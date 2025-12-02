import { eq, inArray } from 'drizzle-orm';
import OpenAI from 'openai';
import { transactions, products, stores, inventory, organizations, subscriptions, stockMovements } from '../../shared/schema';
import { db } from '../db';
import { getFullSystemContext, formatContextForPrompt, type FullSystemContext } from './context-providers';

export interface ChatUserContext {
    userId: string;
    userName?: string;
    role: 'admin' | 'manager' | 'cashier';
    orgId?: string;
    storeId?: string; // Only for managers - their assigned store
}

export interface ChatHistoryMessage {
    role: 'user' | 'assistant';
    content: string;
}

export interface ActionTrigger {
    type: 'navigate' | 'action';
    label: string;
    target: string; // route path or action identifier
    icon?: string;
}

export interface RichContent {
    type: 'table' | 'list' | 'chart' | 'actions' | 'steps';
    title?: string;
    data: any;
}

export interface ChatResponse {
    text: string;
    payload: {
        type: string;
        data: any;
        richContent?: RichContent[];
        actions?: ActionTrigger[];
        isTutorial?: boolean;
    };
}

export class OpenAIService {
    private openai: OpenAI;

    constructor() {
        this.openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY,
        });
    }

    async processChatMessage(
        message: string, 
        storeId: string, 
        userContext?: ChatUserContext,
        conversationHistory?: ChatHistoryMessage[]
    ): Promise<ChatResponse> {
        try {
            // Determine effective store scope based on role
            const effectiveStoreId = this.getEffectiveStoreId(storeId, userContext);
            
            // Get legacy context data for backward compatibility
            const contextData = userContext?.role === 'admin'
                ? await this.getOrgWideContext(userContext.orgId)
                : await this.getStoreContext(effectiveStoreId);
            
            // Get full module-based system context
            const systemContext = await getFullSystemContext(
                effectiveStoreId,
                userContext?.orgId,
                userContext?.role || 'cashier'
            );
            
            // Detect intent type
            const intent = this.detectIntent(message);
            
            // Check for restricted topics for non-admin users
            if (userContext && userContext.role !== 'admin') {
                const restrictedResponse = this.checkRestrictedTopics(message, userContext);
                if (restrictedResponse) {
                    return restrictedResponse as ChatResponse;
                }
            }
            
            // Handle tutorial requests with specialized response
            if (intent.isTutorial) {
                return this.handleTutorialRequest(message, intent.tutorialTopic, userContext);
            }
            
            // Handle data queries that need rich responses
            if (intent.needsRichResponse) {
                return await this.handleDataQuery(message, contextData, userContext, intent);
            }
            
            // Create role-aware system prompt with full module context
            const systemPrompt = this.createSystemPrompt(contextData, userContext, systemContext);
            
            // Build messages array with conversation history
            const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
                { role: 'system', content: systemPrompt }
            ];
            
            // Add conversation history (limit to last 10 exchanges for token efficiency)
            if (conversationHistory && conversationHistory.length > 0) {
                const recentHistory = conversationHistory.slice(-20); // Last 10 exchanges (20 messages)
                for (const msg of recentHistory) {
                    messages.push({ role: msg.role, content: msg.content });
                }
            }
            
            // Add current message
            messages.push({ role: 'user', content: message });
            
            // Process with OpenAI using gpt-4.1-mini (cost-effective)
            const completion = await this.openai.chat.completions.create({
                model: "gpt-4.1-mini",
                messages,
                temperature: 0.7,
                max_tokens: 1500,
                response_format: { type: "text" },
                top_p: 0.9
            });

            const response = completion.choices[0]?.message?.content || "I'm sorry, I couldn't process your request.";
            
            // Parse response for action suggestions
            const actions = this.extractActionSuggestions(response);
            
            return {
                text: response,
                payload: {
                    type: 'text',
                    data: response,
                    actions: actions.length > 0 ? actions : undefined
                }
            };

        } catch (error) {
            console.error('OpenAI processing error:', error);
            return {
                text: "I'm sorry, I encountered an error processing your request. Please try again.",
                payload: {
                    type: 'error',
                    data: 'Processing error'
                }
            };
        }
    }
    
    private detectIntent(message: string): { 
        isTutorial: boolean; 
        tutorialTopic?: string;
        needsRichResponse: boolean;
        queryType?: 'inventory' | 'sales' | 'forecast' | 'analytics';
    } {
        const lowerMessage = message.toLowerCase();
        
        // Tutorial detection patterns
        const tutorialPatterns = [
            { pattern: /how (?:do i|can i|to) (.+?)(?:\?|$)/i, extract: true },
            { pattern: /(?:show|teach|explain|guide|help).* how to (.+?)(?:\?|$)/i, extract: true },
            { pattern: /(?:what is|what's) the (?:process|way|steps?) (?:to|for) (.+?)(?:\?|$)/i, extract: true },
            { pattern: /tutorial (?:on|for|about) (.+?)(?:\?|$)/i, extract: true },
            { pattern: /walk me through (.+?)(?:\?|$)/i, extract: true },
            { pattern: /step.?by.?step/i, extract: false },
        ];
        
        for (const { pattern, extract } of tutorialPatterns) {
            const match = lowerMessage.match(pattern);
            if (match) {
                return {
                    isTutorial: true,
                    tutorialTopic: extract && match[1] ? match[1].trim() : undefined,
                    needsRichResponse: false
                };
            }
        }
        
        // Data query detection for rich responses
        const dataPatterns = [
            { patterns: ['low stock', 'out of stock', 'stock levels', 'inventory status'], type: 'inventory' as const },
            { patterns: ['sales today', 'revenue', 'transactions', 'best selling', 'top products'], type: 'sales' as const },
            { patterns: ['forecast', 'predict', 'demand', 'next week', 'next month'], type: 'forecast' as const },
            { patterns: ['analytics', 'report', 'summary', 'overview', 'performance'], type: 'analytics' as const },
        ];
        
        for (const { patterns, type } of dataPatterns) {
            if (patterns.some(p => lowerMessage.includes(p))) {
                return {
                    isTutorial: false,
                    needsRichResponse: true,
                    queryType: type
                };
            }
        }
        
        return { isTutorial: false, needsRichResponse: false };
    }
    
    private handleTutorialRequest(
        message: string, 
        topic?: string,
        userContext?: ChatUserContext
    ): ChatResponse {
        const tutorials = this.getTutorialDatabase(userContext?.role);
        const lowerTopic = (topic || message).toLowerCase();
        
        // Find matching tutorial
        let matchedTutorial = tutorials.find(t => 
            t.keywords.some(k => lowerTopic.includes(k))
        );
        
        if (!matchedTutorial) {
            // Default to general help
            return {
                text: "I'd be happy to help you learn ChainSync! Here are some topics I can guide you through:",
                payload: {
                    type: 'tutorial',
                    data: { topic: 'general' },
                    isTutorial: true,
                    richContent: [{
                        type: 'list',
                        title: 'Available Tutorials',
                        data: tutorials.map(t => ({ title: t.title, description: t.description }))
                    }],
                    actions: tutorials.slice(0, 4).map(t => ({
                        type: 'action' as const,
                        label: t.title,
                        target: `tutorial:${t.id}`,
                        icon: t.icon
                    }))
                }
            };
        }
        
        return {
            text: `## ${matchedTutorial.title}\n\n${matchedTutorial.description}\n\nFollow these steps:`,
            payload: {
                type: 'tutorial',
                data: { topic: matchedTutorial.id },
                isTutorial: true,
                richContent: [{
                    type: 'steps',
                    title: matchedTutorial.title,
                    data: matchedTutorial.steps
                }],
                actions: matchedTutorial.actions
            }
        };
    }
    
    private getTutorialDatabase(role?: string): Array<{
        id: string;
        title: string;
        description: string;
        keywords: string[];
        icon: string;
        steps: Array<{ step: number; title: string; description: string; action?: string }>;
        actions: ActionTrigger[];
    }> {
        const isAdmin = role === 'admin';
        
        const tutorials = [
            {
                id: 'pos-sale',
                title: 'Making a Sale (POS)',
                description: 'Learn how to process sales transactions using the Point of Sale system.',
                keywords: ['sale', 'pos', 'sell', 'transaction', 'checkout', 'ring up'],
                icon: 'ShoppingCart',
                steps: [
                    { step: 1, title: 'Open POS', description: 'Click "POS" in the sidebar navigation.', action: '/pos' },
                    { step: 2, title: 'Select Products', description: 'Scan barcodes or search for products to add them to the cart.' },
                    { step: 3, title: 'Adjust Quantities', description: 'Use +/- buttons to change quantities or click the quantity to type directly.' },
                    { step: 4, title: 'Apply Discounts', description: 'Click "Discount" to apply percentage or fixed discounts if needed.' },
                    { step: 5, title: 'Select Payment', description: 'Choose payment method: Cash, Card, or Mobile Money.' },
                    { step: 6, title: 'Complete Sale', description: 'Click "Complete Sale" and provide receipt to customer.' }
                ],
                actions: [
                    { type: 'navigate' as const, label: 'Go to POS', target: '/pos', icon: 'ShoppingCart' }
                ]
            },
            {
                id: 'add-inventory',
                title: 'Adding Inventory',
                description: 'Learn how to add new stock or adjust existing inventory levels.',
                keywords: ['add inventory', 'stock', 'restock', 'add product', 'quantity'],
                icon: 'Package',
                steps: [
                    { step: 1, title: 'Open Inventory', description: 'Navigate to "Inventory" from the sidebar.', action: '/inventory' },
                    { step: 2, title: 'Find Product', description: 'Search for the product by name, barcode, or SKU.' },
                    { step: 3, title: 'Click Edit', description: 'Click the edit icon on the product row.' },
                    { step: 4, title: 'Add Quantity', description: 'Enter the quantity to add in the "Quantity to add" field.' },
                    { step: 5, title: 'Update Cost (Optional)', description: 'If the cost price changed, enter the new cost for these units.' },
                    { step: 6, title: 'Save Changes', description: 'Click "Save changes" to update the inventory.' }
                ],
                actions: [
                    { type: 'navigate' as const, label: 'Go to Inventory', target: '/inventory', icon: 'Package' }
                ]
            },
            {
                id: 'remove-stock',
                title: 'Removing Damaged/Expired Stock',
                description: 'Learn how to properly remove stock and track losses.',
                keywords: ['remove', 'damage', 'expired', 'loss', 'write off', 'disposal'],
                icon: 'Trash2',
                steps: [
                    { step: 1, title: 'Open Inventory', description: 'Navigate to "Inventory" from the sidebar.', action: '/inventory' },
                    { step: 2, title: 'Find Product', description: 'Search for the product to remove.' },
                    { step: 3, title: 'Click Edit', description: 'Click the edit icon on the product row.' },
                    { step: 4, title: 'Click Remove Stock', description: 'Click the "Remove stock" button at the bottom.' },
                    { step: 5, title: 'Enter Details', description: 'Enter quantity, select reason (expired, damaged, etc.), and add notes.' },
                    { step: 6, title: 'Record Refund', description: 'If manufacturer provides refund, select refund type and amount.' },
                    { step: 7, title: 'Confirm Removal', description: 'Click "Confirm removal" to complete. Loss is tracked in analytics.' }
                ],
                actions: [
                    { type: 'navigate' as const, label: 'Go to Inventory', target: '/inventory', icon: 'Package' }
                ]
            },
            {
                id: 'view-analytics',
                title: 'Viewing Sales Analytics',
                description: 'Learn how to access and understand your store analytics.',
                keywords: ['analytics', 'report', 'sales report', 'performance', 'dashboard'],
                icon: 'BarChart3',
                steps: [
                    { step: 1, title: 'Open Analytics', description: 'Click "Analytics" in the sidebar.', action: '/analytics' },
                    { step: 2, title: 'Select Date Range', description: 'Use the date picker to choose the period to analyze.' },
                    { step: 3, title: 'Review KPIs', description: 'Check Revenue, Profit, Refunds, and Inventory Value cards.' },
                    { step: 4, title: 'Explore Charts', description: 'Scroll down to see sales trends and category breakdowns.' },
                    { step: 5, title: 'Export Data', description: 'Click "Export" to download reports as CSV or PDF.' }
                ],
                actions: [
                    { type: 'navigate' as const, label: 'Go to Analytics', target: '/analytics', icon: 'BarChart3' }
                ]
            },
            {
                id: 'process-refund',
                title: 'Processing a Refund',
                description: 'Learn how to handle customer refunds properly.',
                keywords: ['refund', 'return', 'money back', 'customer return'],
                icon: 'RotateCcw',
                steps: [
                    { step: 1, title: 'Open Refunds', description: 'Navigate to "Refunds" from the sidebar.', action: '/refunds' },
                    { step: 2, title: 'Find Transaction', description: 'Search for the original transaction by receipt number or date.' },
                    { step: 3, title: 'Select Items', description: 'Check the items being returned.' },
                    { step: 4, title: 'Choose Refund Type', description: 'Select full refund, partial refund, or store credit.' },
                    { step: 5, title: 'Enter Reason', description: 'Document the reason for the refund.' },
                    { step: 6, title: 'Process Refund', description: 'Click "Process Refund" to complete. Stock is automatically restored.' }
                ],
                actions: [
                    { type: 'navigate' as const, label: 'Go to Refunds', target: '/refunds', icon: 'RotateCcw' }
                ]
            }
        ];
        
        // Add admin-only tutorials
        if (isAdmin) {
            tutorials.push(
                {
                    id: 'add-store',
                    title: 'Adding a New Store',
                    description: 'Learn how to add and configure a new store location.',
                    keywords: ['add store', 'new store', 'create store', 'branch', 'location'],
                    icon: 'Building2',
                    steps: [
                        { step: 1, title: 'Open Settings', description: 'Navigate to "Settings" from the sidebar.', action: '/settings' },
                        { step: 2, title: 'Go to Stores', description: 'Click "Stores" in the settings menu.' },
                        { step: 3, title: 'Add Store', description: 'Click "Add Store" button.' },
                        { step: 4, title: 'Enter Details', description: 'Fill in store name, address, currency, and contact info.' },
                        { step: 5, title: 'Assign Manager', description: 'Select or invite a manager for this store.' },
                        { step: 6, title: 'Save', description: 'Click "Create Store" to finalize.' }
                    ],
                    actions: [
                        { type: 'navigate' as const, label: 'Go to Settings', target: '/settings', icon: 'Settings' }
                    ]
                },
                {
                    id: 'manage-users',
                    title: 'Managing Staff & Users',
                    description: 'Learn how to add, edit, and manage staff accounts.',
                    keywords: ['user', 'staff', 'employee', 'manager', 'cashier', 'add user'],
                    icon: 'Users',
                    steps: [
                        { step: 1, title: 'Open Admin Panel', description: 'Navigate to "Admin" from the sidebar.', action: '/admin' },
                        { step: 2, title: 'Go to Users', description: 'Click "Users" tab.' },
                        { step: 3, title: 'Add User', description: 'Click "Add User" to create a new account.' },
                        { step: 4, title: 'Set Role', description: 'Choose role: Manager or Cashier.' },
                        { step: 5, title: 'Assign Store', description: 'Select which store this user can access.' },
                        { step: 6, title: 'Send Invite', description: 'User receives email with login instructions.' }
                    ],
                    actions: [
                        { type: 'navigate' as const, label: 'Go to Admin', target: '/admin', icon: 'Shield' }
                    ]
                }
            );
        }
        
        return tutorials;
    }
    
    private async handleDataQuery(
        message: string,
        contextData: any,
        userContext?: ChatUserContext,
        intent?: { queryType?: string }
    ): Promise<ChatResponse> {
        const queryType = intent?.queryType || 'analytics';
        
        switch (queryType) {
            case 'inventory':
                return this.buildInventoryResponse(contextData);
            case 'sales':
                return this.buildSalesResponse(contextData);
            case 'forecast':
                return this.buildForecastResponse(contextData);
            default:
                return this.buildAnalyticsResponse(contextData, userContext);
        }
    }
    
    private buildInventoryResponse(contextData: any): ChatResponse {
        const inventory = contextData.productInventory || [];
        const lowStock = inventory.filter((p: any) => p.quantity <= (p.minStockLevel || 0));
        const outOfStock = inventory.filter((p: any) => p.quantity === 0);
        
        const tableData = lowStock.slice(0, 10).map((p: any) => ({
            name: p.name,
            quantity: p.quantity,
            minStock: p.minStockLevel || 0,
            status: p.quantity === 0 ? 'Out of Stock' : 'Low Stock'
        }));
        
        return {
            text: `## Inventory Status\n\nYou have **${outOfStock.length} out of stock** and **${lowStock.length - outOfStock.length} low stock** items that need attention.`,
            payload: {
                type: 'inventory',
                data: { lowStockCount: lowStock.length, outOfStockCount: outOfStock.length },
                richContent: tableData.length > 0 ? [{
                    type: 'table',
                    title: 'Items Needing Attention',
                    data: {
                        headers: ['Product', 'Qty', 'Min', 'Status'],
                        rows: tableData.map((p: any) => [p.name, p.quantity, p.minStock, p.status])
                    }
                }] : undefined,
                actions: [
                    { type: 'navigate' as const, label: 'View All Inventory', target: '/inventory', icon: 'Package' },
                    { type: 'navigate' as const, label: 'Filter Low Stock', target: '/inventory?filter=low', icon: 'AlertTriangle' }
                ]
            }
        };
    }
    
    private buildSalesResponse(contextData: any): ChatResponse {
        const transactions = contextData.recentTransactions || [];
        const today = new Date().toDateString();
        const todayTransactions = transactions.filter((t: any) => 
            new Date(t.createdAt).toDateString() === today
        );
        
        const totalRevenue = todayTransactions.reduce((sum: number, t: any) => 
            sum + parseFloat(t.total || t.amount || 0), 0
        );
        
        return {
            text: `## Today's Sales\n\nYou've processed **${todayTransactions.length} transactions** with total revenue of **${totalRevenue.toFixed(2)}**.`,
            payload: {
                type: 'sales',
                data: { 
                    transactionCount: todayTransactions.length, 
                    revenue: totalRevenue 
                },
                richContent: [{
                    type: 'chart',
                    title: 'Sales Overview',
                    data: {
                        type: 'summary',
                        metrics: [
                            { label: 'Transactions', value: todayTransactions.length },
                            { label: 'Revenue', value: `${totalRevenue.toFixed(2)}` },
                            { label: 'Avg. Transaction', value: todayTransactions.length > 0 ? (totalRevenue / todayTransactions.length).toFixed(2) : '0' }
                        ]
                    }
                }],
                actions: [
                    { type: 'navigate' as const, label: 'View Analytics', target: '/analytics', icon: 'BarChart3' },
                    { type: 'navigate' as const, label: 'Open POS', target: '/pos', icon: 'ShoppingCart' }
                ]
            }
        };
    }
    
    private buildForecastResponse(contextData: any): ChatResponse {
        const inventory = contextData.productInventory || [];
        const lowStock = inventory.filter((p: any) => p.quantity <= (p.minStockLevel || 0));
        
        return {
            text: `## Demand Forecast\n\nBased on historical data, here are items likely to need restocking soon:`,
            payload: {
                type: 'forecast',
                data: { itemsAtRisk: lowStock.length },
                richContent: [{
                    type: 'list',
                    title: 'Recommended Actions',
                    data: [
                        { title: 'Restock Low Items', description: `${lowStock.length} items are below minimum levels` },
                        { title: 'Review Fast Movers', description: 'Check top-selling products for adequate stock' },
                        { title: 'Plan for Weekend', description: 'Weekend demand typically 20-30% higher' }
                    ]
                }],
                actions: [
                    { type: 'navigate' as const, label: 'View Inventory', target: '/inventory', icon: 'Package' },
                    { type: 'navigate' as const, label: 'AI Insights', target: '/analytics', icon: 'Sparkles' }
                ]
            }
        };
    }
    
    private buildAnalyticsResponse(contextData: any, userContext?: ChatUserContext): ChatResponse {
        const inventory = contextData.productInventory || [];
        const transactions = contextData.recentTransactions || [];
        const storeCount = contextData.storeList?.length || 1;
        
        return {
            text: `## Quick Overview\n\nHere's a summary of your ${userContext?.role === 'admin' ? 'organization' : 'store'}:`,
            payload: {
                type: 'analytics',
                data: { productCount: inventory.length, transactionCount: transactions.length },
                richContent: [{
                    type: 'chart',
                    title: 'Key Metrics',
                    data: {
                        type: 'summary',
                        metrics: [
                            { label: 'Products', value: inventory.length },
                            { label: 'Recent Sales', value: transactions.length },
                            ...(userContext?.role === 'admin' ? [{ label: 'Stores', value: storeCount }] : [])
                        ]
                    }
                }],
                actions: [
                    { type: 'navigate' as const, label: 'Full Analytics', target: '/analytics', icon: 'BarChart3' },
                    { type: 'navigate' as const, label: 'Inventory', target: '/inventory', icon: 'Package' }
                ]
            }
        };
    }
    
    private extractActionSuggestions(response: string): ActionTrigger[] {
        const actions: ActionTrigger[] = [];
        const lowerResponse = response.toLowerCase();
        
        // Detect mentions of system areas and suggest navigation
        const navigationMap: Array<{ keywords: string[]; action: ActionTrigger }> = [
            { 
                keywords: ['inventory', 'stock', 'products'], 
                action: { type: 'navigate' as const, label: 'Go to Inventory', target: '/inventory', icon: 'Package' }
            },
            { 
                keywords: ['pos', 'sale', 'checkout', 'transaction'], 
                action: { type: 'navigate' as const, label: 'Open POS', target: '/pos', icon: 'ShoppingCart' }
            },
            { 
                keywords: ['analytics', 'report', 'performance'], 
                action: { type: 'navigate' as const, label: 'View Analytics', target: '/analytics', icon: 'BarChart3' }
            },
            { 
                keywords: ['refund', 'return'], 
                action: { type: 'navigate' as const, label: 'Go to Refunds', target: '/refunds', icon: 'RotateCcw' }
            },
            { 
                keywords: ['settings', 'configure', 'setup'], 
                action: { type: 'navigate' as const, label: 'Open Settings', target: '/settings', icon: 'Settings' }
            }
        ];
        
        for (const { keywords, action } of navigationMap) {
            if (keywords.some(k => lowerResponse.includes(k)) && !actions.find(a => a.target === action.target)) {
                actions.push(action);
                if (actions.length >= 3) break; // Limit to 3 actions
            }
        }
        
        return actions;
    }

    private getEffectiveStoreId(requestedStoreId: string, userContext?: ChatUserContext): string {
        // Admins can query any store or org-wide
        if (userContext?.role === 'admin') {
            return requestedStoreId;
        }
        // Managers are restricted to their assigned store only
        if (userContext?.role === 'manager' && userContext.storeId) {
            return userContext.storeId;
        }
        return requestedStoreId;
    }

    private checkRestrictedTopics(message: string, userContext: ChatUserContext): { text: string; payload: any } | null {
        const lowerMessage = message.toLowerCase();
        
        // Topics restricted for managers and cashiers
        const restrictedPatterns = [
            { patterns: ['billing', 'subscription', 'payment plan', 'invoice', 'pricing tier'], topic: 'billing information' },
            { patterns: ['other store', 'all stores', 'multi-store', 'cross-store', 'compare stores'], topic: 'multi-store data' },
            { patterns: ['organization settings', 'org settings', 'company settings'], topic: 'organization settings' },
            { patterns: ['add user', 'remove user', 'user management', 'staff management'], topic: 'user management' },
        ];

        for (const { patterns, topic } of restrictedPatterns) {
            if (patterns.some(p => lowerMessage.includes(p))) {
                return {
                    text: `I'm sorry, but ${topic} is only accessible to organization administrators. As a ${userContext.role}, you can ask me about your store's inventory, sales, products, and performance. How can I help you with those?`,
                    payload: {
                        type: 'restricted',
                        data: { topic, userRole: userContext.role }
                    }
                };
            }
        }

        return null;
    }

    private async getOrgWideContext(orgId?: string) {
        if (!orgId) {
            return {
                scope: 'organization',
                recentTransactions: [],
                productInventory: [],
                storeList: [],
                orgInfo: null,
                subscriptionInfo: null
            };
        }

        try {
            // Get all stores in the organization
            const orgStores = await db.select()
                .from(stores)
                .where(eq(stores.orgId, orgId));
            
            const storeIds = orgStores.map(s => s.id);
            
            // Get org info
            const orgRows = await db.select()
                .from(organizations)
                .where(eq(organizations.id, orgId));
            
            // Get subscription info
            const subRows = await db.select()
                .from(subscriptions)
                .where(eq(subscriptions.orgId, orgId));

            // Get aggregated transactions across all stores
            let recentTransactions: any[] = [];
            if (storeIds.length > 0) {
                recentTransactions = await db.select()
                    .from(transactions)
                    .where(inArray(transactions.storeId, storeIds))
                    .orderBy(transactions.createdAt)
                    .limit(200);
            }

            // Get aggregated inventory across all stores
            let productInventory: any[] = [];
            if (storeIds.length > 0) {
                productInventory = await db.select({
                    id: products.id,
                    name: products.name,
                    category: products.category,
                    brand: products.brand,
                    price: products.price,
                    quantity: inventory.quantity,
                    storeId: inventory.storeId,
                    minStockLevel: inventory.minStockLevel,
                    maxStockLevel: inventory.maxStockLevel
                })
                .from(inventory)
                .innerJoin(products, eq(inventory.productId, products.id))
                .where(inArray(inventory.storeId, storeIds));
            }

            return {
                scope: 'organization',
                recentTransactions,
                productInventory,
                storeList: orgStores,
                orgInfo: orgRows[0] || null,
                subscriptionInfo: subRows[0] || null
            };
        } catch (error) {
            console.error('Error fetching org-wide context:', error);
            return {
                scope: 'organization',
                recentTransactions: [],
                productInventory: [],
                storeList: [],
                orgInfo: null,
                subscriptionInfo: null
            };
        }
    }

    private async getStoreContext(storeId: string) {
        try {
            // Get recent transactions data
            const recentTransactions = await db.select()
                .from(transactions)
                .where(eq(transactions.storeId, storeId))
                .orderBy(transactions.createdAt)
                .limit(100);

            // Get product inventory for this store
            const productInventory = await db.select({
                id: products.id,
                name: products.name,
                category: products.category,
                brand: products.brand,
                price: products.price,
                quantity: inventory.quantity,
                minStockLevel: inventory.minStockLevel,
                maxStockLevel: inventory.maxStockLevel
            })
            .from(inventory)
            .innerJoin(products, eq(inventory.productId, products.id))
            .where(eq(inventory.storeId, storeId));

            // Get store info
            const storeInfo = await db.select()
                .from(stores)
                .where(eq(stores.id, storeId));

            // Get recent stock movements for context
            const recentMovements = await db.select()
                .from(stockMovements)
                .where(eq(stockMovements.storeId, storeId))
                .orderBy(stockMovements.occurredAt)
                .limit(50);

            return {
                scope: 'store',
                recentTransactions,
                productInventory,
                storeInfo: storeInfo[0] || null,
                recentMovements
            };
        } catch (error) {
            console.error('Error fetching store context:', error);
            return {
                scope: 'store',
                recentTransactions: [],
                productInventory: [],
                storeInfo: null,
                recentMovements: []
            };
        }
    }

    private createSystemPrompt(contextData: any, userContext?: ChatUserContext, systemContext?: FullSystemContext): string {
        const isAdmin = userContext?.role === 'admin';
        const userName = userContext?.userName || 'User';
        
        // Extract categories from products
        const categories = Array.from(new Set(
            contextData.productInventory?.map((p: any) => p.category).filter(Boolean) || []
        ));

        // Build legacy context section based on scope
        let legacyContextSection: string;
        if (contextData.scope === 'organization' && isAdmin) {
            const storeCount = contextData.storeList?.length || 0;
            const totalProducts = contextData.productInventory?.length || 0;
            const planCode = contextData.subscriptionInfo?.planCode || 'unknown';
            
            legacyContextSection = `
Organization Overview (Admin View):
- Organization: ${contextData.orgInfo?.name || 'Unknown'}
- Subscription Plan: ${planCode}
- Total Stores: ${storeCount}
- Total Products (across stores): ${totalProducts}
- Stores: ${contextData.storeList?.map((s: any) => s.name).join(', ') || 'None'}
- Product Categories: ${categories.join(', ') || 'None specified'}`;
        } else {
            const storeName = contextData.storeInfo?.name || 'Unknown Store';
            const productCount = contextData.productInventory?.length || 0;
            
            legacyContextSection = `
Store Context:
- Store: ${storeName}
- Total Products: ${productCount}
- Product Categories: ${categories.join(', ') || 'None specified'}`;
        }

        // Build rich module context from system context providers
        const moduleContextSection = systemContext ? formatContextForPrompt(systemContext) : '';

        // Build capabilities section based on role
        const adminCapabilities = `
Admin-Only Capabilities:
- View and compare data across all stores
- Access billing and subscription information
- Review organization-wide performance
- Manage multi-store inventory strategies
- View refund patterns and trends
- Configure organization settings`;

        const managerCapabilities = `
Your Capabilities (Store-Level):
- Analyze your store's transaction data and demand forecasts
- View and manage inventory for your assigned store
- Get low stock alerts and reorder recommendations
- Review your store's sales trends and patterns
- Process and view refunds for your store
- Learn how to use ChainSync features`;

        const capabilities = isAdmin ? adminCapabilities : managerCapabilities;

        // Role restrictions notice for non-admins
        const restrictions = !isAdmin ? `

Note: As a ${userContext?.role || 'user'}, you have access to your assigned store's data only. For organization-wide data, billing, or multi-store information, please contact your administrator.` : '';

        return `You are ChainSync AI, an intelligent assistant for ChainSync retail management system. You're speaking with ${userName} (${userContext?.role || 'user'}).

## Your Purpose
Help users with inventory management, sales analytics, demand forecasting, refund processing, and general system usage. Provide actionable insights based on their data access level.

## Basic Context
${legacyContextSection}

## Live System Data
${moduleContextSection}

## Capabilities
${capabilities}

## How to Help
1. **Inventory Management**: Stock levels, reorder points, low stock alerts, cost analysis, stock removals
2. **Point of Sale**: Recent sales data, transaction patterns, void tracking
3. **Refund Processing**: Refund history, patterns, common reasons
4. **Sales Analysis**: Transaction trends, best sellers, seasonal patterns
5. **Demand Forecasting**: Predict future demand based on historical data
6. **System Tutorials**: Explain how to use ChainSync features (POS, inventory, reports, etc.)
7. **Business Insights**: Actionable recommendations for improving operations
${isAdmin ? '8. **Billing & Settings**: Subscription info, user management, store configuration (admin only)' : ''}

## Response Guidelines
- Be concise and actionable
- Reference specific data from the Live System Data when available
- Highlight urgent issues (out of stock, high void rates, etc.)
- Suggest next steps the user can take
- If asked about restricted topics, politely redirect to allowed areas
- For tutorials, provide step-by-step instructions
${restrictions}

Always be helpful, professional, and focused on improving the user's retail operations.`;
    }

    async handleForecastQuery(parameters: any) {
        const { category, period } = parameters;
        
        // Generate forecast based on parameters
        const forecastData = await this.generateForecast(parameters);
        
        return {
            text: `Based on your request for ${category || 'all products'} over ${period || '30'} days, here's the demand forecast:\n\n${forecastData.summary}\n\nKey insights:\n${forecastData.insights.join('\n')}`,
            payload: {
                type: 'forecast',
                data: forecastData
            }
        };
    }

    async handleInventoryQuery(parameters: any) {
        const { category } = parameters;
        
        // Generate inventory insights
        const inventoryData = await this.generateInventoryInsights(parameters);
        
        return {
            text: `Here are your inventory insights for ${category || 'all products'}:\n\n${inventoryData.summary}\n\nRecommendations:\n${inventoryData.recommendations.join('\n')}`,
            payload: {
                type: 'inventory',
                data: inventoryData
            }
        };
    }

    async handleTrendQuery(parameters: any) {
        const { category, period } = parameters;
        
        // Generate trend analysis
        const trendData = await this.generateTrendAnalysis(parameters);
        
        return {
            text: `Here's the trend analysis for ${category || 'all products'} over ${period || '30'} days:\n\n${trendData.summary}\n\nKey trends:\n${trendData.trends.join('\n')}`,
            payload: {
                type: 'trends',
                data: trendData
            }
        };
    }

    private async generateForecast(parameters: any) {
        // Mock forecast generation - in production, this would use actual ML models
        const { period = 30, category } = parameters;
        
        return {
            summary: `Expected demand for ${category || 'all products'} over the next ${period} days`,
            insights: [
                `Peak demand expected on weekends`,
                `Seasonal increase of 15% compared to last period`,
                `Recommended stock increase of 20% for high-demand items`
            ],
            data: {
                period,
                category,
                forecastedDemand: Math.floor(Math.random() * 1000) + 500,
                confidence: 0.85
            }
        };
    }

    private async generateInventoryInsights(parameters: any) {
        const { category } = parameters;
        
        return {
            summary: `Inventory status for ${category || 'all products'}`,
            recommendations: [
                `Reorder 50 units of high-demand electronics`,
                `Reduce stock of slow-moving clothing items by 30%`,
                `Monitor food items for expiration dates`
            ],
            data: {
                lowStockItems: 5,
                overstockItems: 3,
                optimalItems: 12
            }
        };
    }

    private async generateTrendAnalysis(parameters: any) {
        const { period = 30, category } = parameters;
        
        return {
            summary: `Sales trends for ${category || 'all products'} over ${period} days`,
            trends: [
                `15% increase in online sales`,
                `Electronics showing strongest growth`,
                `Weekend sales 25% higher than weekdays`,
                `Seasonal products performing above expectations`
            ],
            data: {
                period,
                category,
                growthRate: 0.15,
                topPerformingCategory: 'electronics'
            }
        };
    }
} 
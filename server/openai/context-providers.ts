import { eq, inArray, desc, and, gte } from 'drizzle-orm';
import { 
    transactions, 
    products, 
    stores, 
    inventory, 
    organizations, 
    subscriptions,
    stockMovements,
    users,
    userRoles
} from '../../shared/schema';
import { db } from '../db';

export interface ModuleContext {
    moduleName: string;
    summary: string;
    data: any;
    insights?: string[];
}

export interface FullSystemContext {
    inventory?: ModuleContext;
    pos?: ModuleContext;
    refunds?: ModuleContext;
    billing?: ModuleContext;
    settings?: ModuleContext;
}

/**
 * Provides inventory-specific context for AI chat
 * Includes: stock levels, cost layers, low stock alerts, recent removals
 */
export async function getInventoryContext(storeId: string): Promise<ModuleContext> {
    try {
        // Get inventory with product details
        const inventoryItems = await db.select({
            productId: inventory.productId,
            productName: products.name,
            category: products.category,
            quantity: inventory.quantity,
            minStockLevel: inventory.minStockLevel,
            maxStockLevel: inventory.maxStockLevel,
            costPrice: products.costPrice,
            salePrice: products.price,
        })
        .from(inventory)
        .innerJoin(products, eq(inventory.productId, products.id))
        .where(eq(inventory.storeId, storeId));

        // Calculate metrics
        const totalItems = inventoryItems.length;
        const lowStockItems = inventoryItems.filter(i => 
            i.quantity <= (i.minStockLevel || 0)
        );
        const outOfStockItems = inventoryItems.filter(i => i.quantity === 0);
        
        // Calculate total inventory value at cost
        const totalValueAtCost = inventoryItems.reduce((sum, item) => {
            const cost = parseFloat(String(item.costPrice || 0));
            return sum + (cost * item.quantity);
        }, 0);

        // Get recent stock movements (last 7 days)
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        
        const recentMovements = await db.select()
            .from(stockMovements)
            .where(and(
                eq(stockMovements.storeId, storeId),
                gte(stockMovements.occurredAt, sevenDaysAgo)
            ))
            .orderBy(desc(stockMovements.occurredAt))
            .limit(50);

        // Analyze movements
        const removalCount = recentMovements.filter(m => 
            m.actionType === 'removal' || (m.delta && m.delta < 0)
        ).length;
        
        const additionCount = recentMovements.filter(m => 
            m.actionType === 'addition' || m.actionType === 'restock' || (m.delta && m.delta > 0)
        ).length;

        // Build insights
        const insights: string[] = [];
        if (outOfStockItems.length > 0) {
            insights.push(`⚠️ ${outOfStockItems.length} items are out of stock and need immediate restocking`);
        }
        if (lowStockItems.length > outOfStockItems.length) {
            insights.push(`📦 ${lowStockItems.length - outOfStockItems.length} items are running low`);
        }
        if (removalCount > additionCount) {
            insights.push(`📉 More stock removed (${removalCount}) than added (${additionCount}) this week`);
        }

        return {
            moduleName: 'Inventory',
            summary: `${totalItems} products tracked, ${lowStockItems.length} need attention, inventory value: ${totalValueAtCost.toFixed(2)}`,
            data: {
                totalProducts: totalItems,
                lowStockCount: lowStockItems.length,
                outOfStockCount: outOfStockItems.length,
                totalValueAtCost,
                recentMovements: removalCount + additionCount,
                lowStockItems: lowStockItems.slice(0, 10).map(i => ({
                    name: i.productName,
                    quantity: i.quantity,
                    minStock: i.minStockLevel
                }))
            },
            insights
        };
    } catch (error) {
        console.error('Error getting inventory context:', error);
        return {
            moduleName: 'Inventory',
            summary: 'Unable to fetch inventory data',
            data: {}
        };
    }
}

/**
 * Provides POS-specific context for AI chat
 * Includes: recent sales, popular products, void patterns, hourly trends
 */
export async function getPOSContext(storeId: string): Promise<ModuleContext> {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        // Get recent transactions
        const recentTransactions = await db.select()
            .from(transactions)
            .where(and(
                eq(transactions.storeId, storeId),
                gte(transactions.createdAt, sevenDaysAgo)
            ))
            .orderBy(desc(transactions.createdAt))
            .limit(200);

        // Today's transactions
        const todayTransactions = recentTransactions.filter(t => 
            new Date(t.createdAt!) >= today
        );

        // Calculate metrics
        const todayRevenue = todayTransactions.reduce((sum, t) => 
            sum + parseFloat(String(t.total || 0)), 0
        );
        
        const weekRevenue = recentTransactions.reduce((sum, t) => 
            sum + parseFloat(String(t.total || 0)), 0
        );

        const avgTransactionValue = recentTransactions.length > 0 
            ? weekRevenue / recentTransactions.length 
            : 0;

        // Analyze void/held transactions (based on actual schema status values)
        const voidedTransactions = recentTransactions.filter(t => 
            t.status === 'held'
        );
        const voidRate = recentTransactions.length > 0 
            ? (voidedTransactions.length / recentTransactions.length) * 100 
            : 0;

        // Build insights
        const insights: string[] = [];
        if (todayTransactions.length === 0) {
            insights.push('📊 No sales recorded today yet');
        } else {
            insights.push(`💰 ${todayTransactions.length} sales today totaling ${todayRevenue.toFixed(2)}`);
        }
        if (voidRate > 5) {
            insights.push(`⚠️ High void rate: ${voidRate.toFixed(1)}% of transactions voided`);
        }
        if (avgTransactionValue > 0) {
            insights.push(`📈 Average transaction: ${avgTransactionValue.toFixed(2)}`);
        }

        return {
            moduleName: 'POS',
            summary: `${todayTransactions.length} sales today (${todayRevenue.toFixed(2)}), ${recentTransactions.length} this week`,
            data: {
                todayTransactions: todayTransactions.length,
                todayRevenue,
                weekTransactions: recentTransactions.length,
                weekRevenue,
                avgTransactionValue,
                voidRate,
                voidedCount: voidedTransactions.length
            },
            insights
        };
    } catch (error) {
        console.error('Error getting POS context:', error);
        return {
            moduleName: 'POS',
            summary: 'Unable to fetch POS data',
            data: {}
        };
    }
}

/**
 * Provides refund-specific context for AI chat
 * Uses stock movements with refund metadata since refunds are tracked via stock movements
 */
export async function getRefundContext(storeId: string): Promise<ModuleContext> {
    try {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        // Get stock movements that are refund-related (pos_void, returns, or have refundAmount in metadata)
        const recentMovements = await db.select()
            .from(stockMovements)
            .where(and(
                eq(stockMovements.storeId, storeId),
                gte(stockMovements.occurredAt, thirtyDaysAgo)
            ))
            .orderBy(desc(stockMovements.occurredAt))
            .limit(200);

        // Filter for refund-related movements
        const refundMovements = recentMovements.filter(m => {
            const source = m.source?.toLowerCase() || '';
            const metadata = m.metadata as Record<string, unknown> | null;
            return source.includes('void') || 
                   source.includes('return') || 
                   source.includes('refund') ||
                   (metadata && (metadata.refundAmount || metadata.lossAmount));
        });

        // Calculate refund amounts from metadata
        let totalRefundAmount = 0;
        const reasonCounts: Record<string, number> = {};
        
        refundMovements.forEach(m => {
            const metadata = m.metadata as Record<string, unknown> | null;
            if (metadata?.refundAmount) {
                totalRefundAmount += parseFloat(String(metadata.refundAmount));
            }
            const reason = (metadata?.reason as string) || m.source || 'unspecified';
            reasonCounts[reason] = (reasonCounts[reason] || 0) + 1;
        });

        const topReasons = Object.entries(reasonCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([reason, count]) => ({ reason, count }));

        // Build insights
        const insights: string[] = [];
        if (refundMovements.length > 0) {
            insights.push(`📊 ${refundMovements.length} refund-related movements in last 30 days`);
        }
        if (totalRefundAmount > 0) {
            insights.push(`💰 Total refund value: ${totalRefundAmount.toFixed(2)}`);
        }
        if (topReasons.length > 0 && topReasons[0].count > 2) {
            insights.push(`🔍 Common reason: "${topReasons[0].reason}" (${topReasons[0].count} times)`);
        }

        return {
            moduleName: 'Refunds',
            summary: `${refundMovements.length} refund events, ${totalRefundAmount.toFixed(2)} refunded in last 30 days`,
            data: {
                refundCount: refundMovements.length,
                totalAmount: totalRefundAmount,
                topReasons
            },
            insights
        };
    } catch (error) {
        console.error('Error getting refund context:', error);
        return {
            moduleName: 'Refunds',
            summary: 'Unable to fetch refund data',
            data: {}
        };
    }
}

/**
 * Provides billing-specific context for AI chat (admin only)
 * Includes: subscription info, usage stats, payment status
 */
export async function getBillingContext(orgId: string): Promise<ModuleContext> {
    try {
        // Get subscription info
        const [subscription] = await db.select()
            .from(subscriptions)
            .where(eq(subscriptions.orgId, orgId))
            .limit(1);

        // Get organization info
        const [org] = await db.select()
            .from(organizations)
            .where(eq(organizations.id, orgId))
            .limit(1);

        // Get store count
        const storeList = await db.select({ id: stores.id })
            .from(stores)
            .where(eq(stores.orgId, orgId));

        // Get user count
        const userList = await db.select({ id: users.id })
            .from(users)
            .where(eq(users.orgId, orgId));

        const planCode = subscription?.planCode || 'basic';
        const isActive = org?.isActive ?? true;

        // Build insights
        const insights: string[] = [];
        insights.push(`📋 Current plan: ${planCode.toUpperCase()}`);
        insights.push(`🏪 ${storeList.length} store(s), 👥 ${userList.length} user(s)`);
        if (!isActive) {
            insights.push('⚠️ Organization is currently inactive');
        }

        return {
            moduleName: 'Billing',
            summary: `${planCode} plan, ${storeList.length} stores, ${userList.length} users`,
            data: {
                planCode,
                storeCount: storeList.length,
                userCount: userList.length,
                isActive,
                orgName: org?.name
            },
            insights
        };
    } catch (error) {
        console.error('Error getting billing context:', error);
        return {
            moduleName: 'Billing',
            summary: 'Unable to fetch billing data',
            data: {}
        };
    }
}

/**
 * Provides settings-specific context for AI chat (admin only)
 * Includes: store configs, user roles, preferences
 */
export async function getSettingsContext(orgId: string): Promise<ModuleContext> {
    try {
        // Get all stores
        const storeList = await db.select({
            id: stores.id,
            name: stores.name,
            isActive: stores.isActive,
            currency: stores.currency
        })
        .from(stores)
        .where(eq(stores.orgId, orgId));

        // Get all users with roles
        const userList = await db.select({
            id: users.id,
            email: users.email,
            firstName: users.firstName,
            lastName: users.lastName,
            storeId: users.storeId,
            isActive: users.isActive
        })
        .from(users)
        .where(eq(users.orgId, orgId));

        // Get role distribution
        const allRoles = await db.select()
            .from(userRoles)
            .where(inArray(userRoles.userId, userList.map(u => u.id)));

        const roleCounts: Record<string, number> = { ADMIN: 0, MANAGER: 0, CASHIER: 0 };
        allRoles.forEach(r => {
            const role = String(r.role).toUpperCase();
            if (role in roleCounts) roleCounts[role]++;
        });

        // Build insights
        const insights: string[] = [];
        const activeStores = storeList.filter(s => s.isActive !== false);
        const inactiveStores = storeList.filter(s => s.isActive === false);
        
        if (inactiveStores.length > 0) {
            insights.push(`⚠️ ${inactiveStores.length} store(s) are currently inactive`);
        }
        insights.push(`👤 Team: ${roleCounts.ADMIN} admin(s), ${roleCounts.MANAGER} manager(s), ${roleCounts.CASHIER} cashier(s)`);

        return {
            moduleName: 'Settings',
            summary: `${activeStores.length} active stores, ${userList.length} total users`,
            data: {
                stores: storeList.map(s => ({ name: s.name, isActive: s.isActive, currency: s.currency })),
                userCount: userList.length,
                roleCounts,
                activeStoreCount: activeStores.length,
                inactiveStoreCount: inactiveStores.length
            },
            insights
        };
    } catch (error) {
        console.error('Error getting settings context:', error);
        return {
            moduleName: 'Settings',
            summary: 'Unable to fetch settings data',
            data: {}
        };
    }
}

/**
 * Gets full system context based on user role
 * Admins get all modules, managers get store-specific modules only
 */
export async function getFullSystemContext(
    storeId: string,
    orgId: string | undefined,
    role: 'admin' | 'manager' | 'cashier'
): Promise<FullSystemContext> {
    const context: FullSystemContext = {};

    // All roles get inventory and POS context
    const [inventoryCtx, posCtx, refundCtx] = await Promise.all([
        getInventoryContext(storeId),
        getPOSContext(storeId),
        getRefundContext(storeId)
    ]);

    context.inventory = inventoryCtx;
    context.pos = posCtx;
    context.refunds = refundCtx;

    // Admin-only contexts
    if (role === 'admin' && orgId) {
        const [billingCtx, settingsCtx] = await Promise.all([
            getBillingContext(orgId),
            getSettingsContext(orgId)
        ]);
        context.billing = billingCtx;
        context.settings = settingsCtx;
    }

    return context;
}

/**
 * Formats system context into a string for the AI prompt
 */
export function formatContextForPrompt(context: FullSystemContext): string {
    const sections: string[] = [];

    if (context.inventory) {
        sections.push(`## Inventory\n${context.inventory.summary}\n${context.inventory.insights?.join('\n') || ''}`);
    }
    if (context.pos) {
        sections.push(`## Point of Sale\n${context.pos.summary}\n${context.pos.insights?.join('\n') || ''}`);
    }
    if (context.refunds) {
        sections.push(`## Refunds\n${context.refunds.summary}\n${context.refunds.insights?.join('\n') || ''}`);
    }
    if (context.billing) {
        sections.push(`## Billing (Admin)\n${context.billing.summary}\n${context.billing.insights?.join('\n') || ''}`);
    }
    if (context.settings) {
        sections.push(`## Organization Settings (Admin)\n${context.settings.summary}\n${context.settings.insights?.join('\n') || ''}`);
    }

    return sections.join('\n\n');
}

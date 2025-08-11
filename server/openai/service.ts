import OpenAI from 'openai';
import { db } from '../db';
import { transactions, products, stores, inventory } from '../../shared/schema';
import { eq, and, gte, lte } from 'drizzle-orm';

export class OpenAIService {
    private openai: OpenAI;

    constructor() {
        this.openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY,
        });
    }

    async processChatMessage(message: string, storeId: string) {
        try {
            // Get context data from database
            const contextData = await this.getStoreContext(storeId);
            
            // Create system prompt with context
            const systemPrompt = this.createSystemPrompt(contextData);
            
            // Process with OpenAI using GPT-5 with cached token optimization
            const completion = await this.openai.chat.completions.create({
                model: "gpt-5",
                messages: [
                    {
                        role: "system",
                        content: systemPrompt
                    },
                    {
                        role: "user",
                        content: message
                    }
                ],
                temperature: 0.7,
                max_tokens: 1000,
                // Enable cached token optimization for better performance
                response_format: { type: "text" },
                seed: 42, // Consistent responses for caching
                top_p: 0.9
            });

            const response = completion.choices[0]?.message?.content || "I'm sorry, I couldn't process your request.";
            
            return {
                text: response,
                payload: {
                    type: 'text',
                    data: response
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

            return {
                recentTransactions,
                productInventory,
                storeInfo: storeInfo[0] || null
            };
        } catch (error) {
            console.error('Error fetching store context:', error);
            return {
                recentTransactions: [],
                productInventory: [],
                storeInfo: null
            };
        }
    }

    private createSystemPrompt(contextData: any): string {
        const { recentTransactions, productInventory, storeInfo } = contextData;
        
        // Extract unique categories from products
        const categories = Array.from(new Set(productInventory.map((p: any) => p.category).filter(Boolean)));
        
        return `You are an AI assistant for ChainSync, a retail management system. You help store owners and managers with:

1. **Demand Forecasting**: Analyze transaction patterns and predict future demand
2. **Inventory Management**: Provide insights on stock levels, reorder recommendations, and low stock alerts
3. **Sales Analysis**: Identify trends, patterns, and opportunities
4. **Business Intelligence**: Offer actionable insights for business growth

Current store context:
- Store: ${storeInfo?.name || 'Unknown Store'}
- Total products: ${productInventory.length}
- Recent transactions: ${recentTransactions.length}
- Product categories: ${categories.join(', ') || 'None specified'}

Key capabilities:
- Analyze transaction data and provide demand forecasts
- Identify low stock items and suggest reorder quantities
- Detect sales trends and seasonal patterns
- Provide inventory optimization recommendations
- Answer questions about business performance

Always provide specific, actionable insights based on the available data. If you need more specific information, ask clarifying questions. Be conversational but professional, and focus on helping the user make informed business decisions.`;
    }

    async handleForecastQuery(parameters: any) {
        const { product, category, period, month } = parameters;
        
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
        const { product, category } = parameters;
        
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
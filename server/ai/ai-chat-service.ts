/**
 * AI Chat Service - Conversational interface for profit advisor
 * 
 * Uses GPT-4o-mini with function calling to answer questions about
 * store profitability, inventory, and sales data.
 */

import OpenAI from 'openai';
import type { ChatCompletionMessageParam, ChatCompletionTool } from 'openai/resources/chat/completions';

import { loadEnv } from '../../shared/env';
import { logger } from '../lib/logger';
import { aiInsightsService } from './ai-insights-service';

// Initialize OpenAI client
const env = loadEnv(process.env);
const openai = env.OPENAI_API_KEY
    ? new OpenAI({ apiKey: env.OPENAI_API_KEY })
    : null;

// Types
export interface ChatMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
}

export interface ChatResponse {
    message: string;
    functionCalls?: Array<{ name: string; result: unknown }>;
}

// System prompt for the AI
const SYSTEM_PROMPT = `You are an AI Profit Advisor for a retail store management system called ChainSync. Your role is to help store owners and managers understand their profitability, inventory, and sales data.

You have access to real-time data through function calls. When users ask questions about:
- Product profitability, margins, or sales performance → use getProductProfitability or getTopProducts
- Restocking needs or inventory priorities → use getRestockingPriority
- Current insights or alerts → use getInsights
- Specific product lookup → use getProductProfitability with the product name

Guidelines:
1. Be concise but informative. Use bullet points for lists.
2. Always cite specific numbers when available (profit amounts, margins, units sold).
3. Provide actionable recommendations when appropriate.
4. Format currency values appropriately.
5. If data is unavailable, suggest running "Refresh Insights" on the AI Insights tab.
6. Keep responses under 300 words unless the user asks for detailed analysis.

You're friendly, professional, and focused on helping maximize store profits.`;

// Function definitions for OpenAI
const CHAT_FUNCTIONS: ChatCompletionTool[] = [
    {
        type: 'function',
        function: {
            name: 'getProductProfitability',
            description: 'Get profitability data for a specific product or search by name. Returns profit, margin, units sold, and trend.',
            parameters: {
                type: 'object',
                properties: {
                    productName: {
                        type: 'string',
                        description: 'Name or partial name of the product to search for'
                    }
                },
                required: ['productName']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'getTopProducts',
            description: 'Get the top or bottom products by profit. Use for questions about best/worst performers.',
            parameters: {
                type: 'object',
                properties: {
                    type: {
                        type: 'string',
                        enum: ['top', 'bottom'],
                        description: 'Whether to get most profitable (top) or least profitable (bottom) products'
                    },
                    limit: {
                        type: 'number',
                        description: 'Number of products to return (default: 5)'
                    }
                },
                required: ['type']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'getRestockingPriority',
            description: 'Get products that need restocking, ranked by profit potential and urgency.',
            parameters: {
                type: 'object',
                properties: {
                    limit: {
                        type: 'number',
                        description: 'Number of products to return (default: 10)'
                    }
                },
                required: []
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'getInsights',
            description: 'Get current AI-generated insights and alerts for the store.',
            parameters: {
                type: 'object',
                properties: {
                    type: {
                        type: 'string',
                        enum: ['all', 'critical', 'warnings', 'actionable'],
                        description: 'Filter insights by type'
                    }
                },
                required: []
            }
        }
    }
];

// Conversation storage (in-memory, per-session)
const conversationHistory = new Map<string, ChatCompletionMessageParam[]>();

export class AiChatService {
    private readonly maxHistoryLength = 20;

    /**
     * Check if OpenAI is configured
     */
    isAvailable(): boolean {
        return openai !== null;
    }

    /**
     * Send a chat message and get a response
     */
    async chat(
        storeId: string,
        userId: string,
        message: string
    ): Promise<ChatResponse> {
        if (!openai) {
            return {
                message: 'AI Chat is not available. Please configure OPENAI_API_KEY in your environment.'
            };
        }

        const sessionKey = `${userId}-${storeId}`;

        // Get or initialize conversation history
        let history = conversationHistory.get(sessionKey) || [];

        // Add system prompt if new conversation
        if (history.length === 0) {
            history.push({ role: 'system', content: SYSTEM_PROMPT });
        }

        // Add user message
        history.push({ role: 'user', content: message });

        try {
            // Initial API call
            let response = await openai.chat.completions.create({
                model: 'gpt-4o-mini',
                messages: history,
                tools: CHAT_FUNCTIONS,
                tool_choice: 'auto',
                max_tokens: 1000,
                temperature: 0.7,
            });

            let assistantMessage = response.choices[0].message;
            const functionCalls: Array<{ name: string; result: unknown }> = [];

            // Handle function calls
            while (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
                // Add assistant's function call message to history
                history.push(assistantMessage);

                // Execute each function call
                for (const toolCall of assistantMessage.tool_calls) {
                    const functionName = toolCall.function.name;
                    const functionArgs = JSON.parse(toolCall.function.arguments);

                    logger.info('AI Chat executing function', {
                        function: functionName,
                        args: functionArgs,
                        storeId
                    });

                    const result = await this.executeFunction(
                        storeId,
                        functionName,
                        functionArgs
                    );

                    functionCalls.push({ name: functionName, result });

                    // Add function result to history
                    history.push({
                        role: 'tool',
                        tool_call_id: toolCall.id,
                        content: JSON.stringify(result)
                    });
                }

                // Get next response with function results
                response = await openai.chat.completions.create({
                    model: 'gpt-4o-mini',
                    messages: history,
                    tools: CHAT_FUNCTIONS,
                    tool_choice: 'auto',
                    max_tokens: 1000,
                    temperature: 0.7,
                });

                assistantMessage = response.choices[0].message;
            }

            // Add final assistant message to history
            const finalContent = assistantMessage.content || 'I apologize, but I could not generate a response.';
            history.push({ role: 'assistant', content: finalContent });

            // Trim history if too long
            if (history.length > this.maxHistoryLength) {
                // Keep system prompt and recent messages
                const systemPrompt = history[0];
                history = [systemPrompt, ...history.slice(-(this.maxHistoryLength - 1))];
            }

            // Save updated history
            conversationHistory.set(sessionKey, history);

            return {
                message: finalContent,
                functionCalls: functionCalls.length > 0 ? functionCalls : undefined
            };

        } catch (error) {
            logger.error('AI Chat error', { storeId, userId }, error as Error);

            if (error instanceof OpenAI.APIError) {
                if (error.status === 429) {
                    return { message: 'Rate limit exceeded. Please try again in a moment.' };
                }
                if (error.status === 401) {
                    return { message: 'Invalid API key. Please check your OpenAI configuration.' };
                }
            }

            return { message: 'Sorry, I encountered an error processing your request. Please try again.' };
        }
    }

    /**
     * Stream a chat response
     */
    async *streamChat(
        storeId: string,
        userId: string,
        message: string
    ): AsyncGenerator<string, void, unknown> {
        if (!openai) {
            yield 'AI Chat is not available. Please configure OPENAI_API_KEY in your environment.';
            return;
        }

        const sessionKey = `${userId}-${storeId}`;
        let history = conversationHistory.get(sessionKey) || [];

        if (history.length === 0) {
            history.push({ role: 'system', content: SYSTEM_PROMPT });
        }

        history.push({ role: 'user', content: message });

        try {
            // First, check if we need function calls (non-streaming)
            const initialResponse = await openai.chat.completions.create({
                model: 'gpt-4o-mini',
                messages: history,
                tools: CHAT_FUNCTIONS,
                tool_choice: 'auto',
                max_tokens: 1000,
                temperature: 0.7,
            });

            let assistantMessage = initialResponse.choices[0].message;

            // Handle function calls first (can't stream during function execution)
            while (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
                history.push(assistantMessage);

                for (const toolCall of assistantMessage.tool_calls) {
                    const functionName = toolCall.function.name;
                    const functionArgs = JSON.parse(toolCall.function.arguments);

                    yield `[Querying ${functionName}...]\n`;

                    const result = await this.executeFunction(storeId, functionName, functionArgs);

                    history.push({
                        role: 'tool',
                        tool_call_id: toolCall.id,
                        content: JSON.stringify(result)
                    });
                }

                const nextResponse = await openai.chat.completions.create({
                    model: 'gpt-4o-mini',
                    messages: history,
                    tools: CHAT_FUNCTIONS,
                    tool_choice: 'auto',
                    max_tokens: 1000,
                    temperature: 0.7,
                });

                assistantMessage = nextResponse.choices[0].message;
            }

            // Now stream the final response
            const stream = await openai.chat.completions.create({
                model: 'gpt-4o-mini',
                messages: history,
                max_tokens: 1000,
                temperature: 0.7,
                stream: true,
            });

            let fullContent = '';

            for await (const chunk of stream) {
                const content = chunk.choices[0]?.delta?.content || '';
                if (content) {
                    fullContent += content;
                    yield content;
                }
            }

            // Save to history
            history.push({ role: 'assistant', content: fullContent });

            if (history.length > this.maxHistoryLength) {
                const systemPrompt = history[0];
                history = [systemPrompt, ...history.slice(-(this.maxHistoryLength - 1))];
            }

            conversationHistory.set(sessionKey, history);

        } catch (error) {
            logger.error('AI Chat stream error', { storeId, userId }, error as Error);
            yield 'Sorry, I encountered an error. Please try again.';
        }
    }

    /**
     * Execute a function call and return results
     */
    private async executeFunction(
        storeId: string,
        functionName: string,
        args: Record<string, unknown>
    ): Promise<unknown> {
        try {
            switch (functionName) {
                case 'getProductProfitability': {
                    const productName = args.productName as string;
                    const allProducts = await aiInsightsService.computeProductProfitability(storeId);
                    const matches = allProducts.filter(p =>
                        p.productName.toLowerCase().includes(productName.toLowerCase())
                    );
                    return matches.length > 0
                        ? matches.slice(0, 5)
                        : { message: `No products found matching "${productName}"` };
                }

                case 'getTopProducts': {
                    const type = args.type as 'top' | 'bottom';
                    const limit = (args.limit as number) || 5;
                    const allProducts = await aiInsightsService.computeProductProfitability(storeId);

                    const sorted = [...allProducts].sort((a, b) =>
                        type === 'top'
                            ? b.totalProfit - a.totalProfit
                            : a.totalProfit - b.totalProfit
                    );

                    return sorted.slice(0, limit).map(p => ({
                        name: p.productName,
                        profit: p.totalProfit,
                        margin: p.profitMargin,
                        unitsSold: p.unitsSold,
                        trend: p.trend
                    }));
                }

                case 'getRestockingPriority': {
                    const limit = (args.limit as number) || 10;
                    const priorities = await aiInsightsService.getRestockingPriority(storeId, limit);
                    return priorities.map(p => ({
                        name: p.productName,
                        currentStock: p.currentStock,
                        daysToStockout: p.daysToStockout,
                        priorityScore: p.priorityScore,
                        recommendation: p.recommendation
                    }));
                }

                case 'getInsights': {
                    const filterType = args.type as string | undefined;
                    const insights = await aiInsightsService.getInsightsForStore(storeId);

                    let filtered = insights;
                    if (filterType === 'critical') {
                        filtered = insights.filter(i => i.severity === 'critical');
                    } else if (filterType === 'warnings') {
                        filtered = insights.filter(i => i.severity === 'warning');
                    } else if (filterType === 'actionable') {
                        filtered = insights.filter(i => i.isActionable);
                    }

                    return filtered.slice(0, 10).map(i => ({
                        type: i.insightType,
                        title: i.title,
                        description: i.description,
                        severity: i.severity
                    }));
                }

                default:
                    return { error: `Unknown function: ${functionName}` };
            }
        } catch (error) {
            logger.error('Function execution error', { functionName, storeId }, error as Error);
            return { error: 'Failed to retrieve data' };
        }
    }

    /**
     * Get conversation history for a session
     */
    getHistory(userId: string, storeId: string): ChatMessage[] {
        const sessionKey = `${userId}-${storeId}`;
        const history = conversationHistory.get(sessionKey) || [];

        return history
            .filter(m => m.role === 'user' || m.role === 'assistant')
            .map(m => ({
                role: m.role as 'user' | 'assistant',
                content: typeof m.content === 'string' ? m.content : ''
            }));
    }

    /**
     * Clear conversation history
     */
    clearHistory(userId: string, storeId: string): void {
        const sessionKey = `${userId}-${storeId}`;
        conversationHistory.delete(sessionKey);
    }
}

// Singleton instance
export const aiChatService = new AiChatService();

/**
 * AI Chat API Routes
 * 
 * Provides endpoints for conversational AI chat with streaming support.
 */

import { Express, Request, Response } from 'express';

import { aiChatService } from '../ai/ai-chat-service';
import { extractLogContext, logger } from '../lib/logger';
import { requireAuth, requireRole } from '../middleware/authz';

export async function registerAIChatRoutes(app: Express) {
    /**
     * POST /api/ai/chat
     * Send a chat message and get a response (non-streaming)
     */
    app.post('/api/ai/chat', requireAuth, requireRole(['admin', 'manager']), async (req: Request, res: Response) => {
        try {
            const { storeId, message } = req.body;
            const userId = (req.session as any)?.userId;

            if (!storeId || !message) {
                return res.status(400).json({
                    success: false,
                    error: 'storeId and message are required'
                });
            }

            if (!userId) {
                return res.status(401).json({
                    success: false,
                    error: 'User not authenticated'
                });
            }

            if (!aiChatService.isAvailable()) {
                return res.status(503).json({
                    success: false,
                    error: 'AI Chat is not available. OPENAI_API_KEY not configured.'
                });
            }

            logger.info('AI Chat request', {
                ...extractLogContext(req),
                storeId,
                messageLength: message.length
            });

            const response = await aiChatService.chat(storeId, userId, message);

            return res.json({
                success: true,
                response: response.message,
                functionCalls: response.functionCalls
            });

        } catch (error) {
            logger.error('AI Chat endpoint error', extractLogContext(req), error as Error);
            return res.status(500).json({
                success: false,
                error: 'Failed to process chat request'
            });
        }
    });

    /**
     * POST /api/ai/chat/stream
     * Send a chat message and get a streaming response
     */
    app.post('/api/ai/chat/stream', requireAuth, requireRole(['admin', 'manager']), async (req: Request, res: Response) => {
        try {
            const { storeId, message } = req.body;
            const userId = (req.session as any)?.userId;

            if (!storeId || !message) {
                return res.status(400).json({
                    success: false,
                    error: 'storeId and message are required'
                });
            }

            if (!userId) {
                return res.status(401).json({
                    success: false,
                    error: 'User not authenticated'
                });
            }

            if (!aiChatService.isAvailable()) {
                return res.status(503).json({
                    success: false,
                    error: 'AI Chat is not available. OPENAI_API_KEY not configured.'
                });
            }

            // Set up SSE headers
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');
            res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

            logger.info('AI Chat stream request', {
                ...extractLogContext(req),
                storeId,
                messageLength: message.length
            });

            // Stream the response
            for await (const chunk of aiChatService.streamChat(storeId, userId, message)) {
                res.write(`data: ${JSON.stringify({ content: chunk })}\n\n`);
            }

            // Send done signal
            res.write('data: [DONE]\n\n');
            res.end();

        } catch (error) {
            logger.error('AI Chat stream error', extractLogContext(req), error as Error);

            // If headers not sent, send error response
            if (!res.headersSent) {
                return res.status(500).json({
                    success: false,
                    error: 'Failed to process stream request'
                });
            }

            // Otherwise, end the stream
            res.write(`data: ${JSON.stringify({ error: 'Stream error occurred' })}\n\n`);
            res.end();
        }
    });

    /**
     * GET /api/ai/chat/history/:storeId
     * Get conversation history
     */
    app.get('/api/ai/chat/history/:storeId', requireAuth, requireRole(['admin', 'manager']), async (req: Request, res: Response) => {
        try {
            const { storeId } = req.params;
            const userId = (req.session as any)?.userId;

            if (!userId) {
                return res.status(401).json({
                    success: false,
                    error: 'User not authenticated'
                });
            }

            const history = aiChatService.getHistory(userId, storeId);

            return res.json({
                success: true,
                storeId,
                messages: history
            });

        } catch (error) {
            logger.error('AI Chat history error', extractLogContext(req), error as Error);
            return res.status(500).json({
                success: false,
                error: 'Failed to get chat history'
            });
        }
    });

    /**
     * POST /api/ai/chat/clear/:storeId
     * Clear conversation history
     */
    app.post('/api/ai/chat/clear/:storeId', requireAuth, requireRole(['admin', 'manager']), async (req: Request, res: Response) => {
        try {
            const { storeId } = req.params;
            const userId = (req.session as any)?.userId;

            if (!userId) {
                return res.status(401).json({
                    success: false,
                    error: 'User not authenticated'
                });
            }

            aiChatService.clearHistory(userId, storeId);

            return res.json({
                success: true,
                message: 'Conversation cleared'
            });

        } catch (error) {
            logger.error('AI Chat clear error', extractLogContext(req), error as Error);
            return res.status(500).json({
                success: false,
                error: 'Failed to clear chat history'
            });
        }
    });

    /**
     * GET /api/ai/chat/status
     * Check if AI chat is available
     */
    app.get('/api/ai/chat/status', requireAuth, (_req: Request, res: Response) => {
        return res.json({
            success: true,
            available: aiChatService.isAvailable(),
            model: 'gpt-4o-mini'
        });
    });
}

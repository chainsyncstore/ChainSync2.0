import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { ScrollArea } from '../ui/scroll-area';
import { Send, Bot, User, X, MessageCircle, Sparkles, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAIChat } from '@/hooks/use-ai-chat';
import { apiClient, handleApiError } from '@/lib/api-client';

interface ChatMessage {
    id: string;
    text: string;
    sender: 'user' | 'bot';
    timestamp: Date;
    payload?: any;
}

interface FloatingChatProps {
    storeId?: string;
    className?: string;
}

const QUICK_ACTIONS = [
    "Show me low stock items",
    "What are today's sales?",
    "Forecast demand for next week",
    "Which products are selling best?",
    "Help me with inventory management"
];

export default function FloatingChat({ storeId = "default", className }: FloatingChatProps) {
    const { messages, addMessage, clearMessages, isOpen, setIsOpen, isLoading, setIsLoading } = useAIChat();
    const [inputText, setInputText] = useState('');
    const [hasUnreadMessages, setHasUnreadMessages] = useState(false);
    const scrollAreaRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Add welcome message on first open
    useEffect(() => {
        if (isOpen && messages.length === 0) {
            const welcomeMessage: ChatMessage = {
                id: 'welcome',
                text: "Hello! I'm your AI assistant. I can help you with:\n\n• Inventory management and stock levels\n• Sales analytics and trends\n• Demand forecasting\n• Product recommendations\n• Store performance insights\n• Customer data analysis\n\nWhat would you like to know?",
                sender: 'bot',
                timestamp: new Date()
            };
            addMessage(welcomeMessage);
        }
    }, [isOpen, messages.length, addMessage]);

    // Track unread messages
    useEffect(() => {
        if (!isOpen && messages.length > 0) {
            const lastMessage = messages[messages.length - 1];
            if (lastMessage.sender === 'bot') {
                setHasUnreadMessages(true);
            }
        } else if (isOpen) {
            setHasUnreadMessages(false);
        }
    }, [messages, isOpen]);

    const sendMessage = async () => {
        if (!inputText.trim() || isLoading) return;

        const userMessage: ChatMessage = {
            id: Date.now().toString(),
            text: inputText,
            sender: 'user',
            timestamp: new Date()
        };

        addMessage(userMessage);
        setInputText('');
        setIsLoading(true);

        try {
            const data = await apiClient.post('/openai/chat', {
                message: inputText,
                storeId,
                sessionId: `floating-chat-${storeId}-${Date.now()}`
            });
            
            const botMessage: ChatMessage = {
                id: (Date.now() + 1).toString(),
                text: data.fulfillmentText,
                sender: 'bot',
                timestamp: new Date(),
                payload: data.payload
            };

            addMessage(botMessage);
        } catch (error) {
            console.error('Chat error:', error);
            handleApiError(error);
            const errorMessage: ChatMessage = {
                id: (Date.now() + 1).toString(),
                text: "I'm sorry, I encountered an error. Please try again or check your connection.",
                sender: 'bot',
                timestamp: new Date()
            };
            addMessage(errorMessage);
        } finally {
            setIsLoading(false);
        }
    };

    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    };

    useEffect(() => {
        if (scrollAreaRef.current) {
            scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight;
        }
    }, [messages]);

    useEffect(() => {
        if (isOpen && inputRef.current) {
            inputRef.current.focus();
        }
    }, [isOpen]);

    const formatTime = (date: Date) => {
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    const toggleChat = () => {
        setIsOpen(!isOpen);
    };

    const handleClearChat = () => {
        clearMessages();
    };

    const handleQuickAction = (action: string) => {
        setInputText(action);
        // Auto-send the quick action
        setTimeout(() => {
            const userMessage: ChatMessage = {
                id: Date.now().toString(),
                text: action,
                sender: 'user',
                timestamp: new Date()
            };
            addMessage(userMessage);
            setInputText('');
            setIsLoading(true);
            
            // Send the message
            sendQuickAction(action);
        }, 100);
    };

    const sendQuickAction = async (action: string) => {
        try {
            const data = await apiClient.post('/openai/chat', {
                message: action,
                storeId,
                sessionId: `floating-chat-${storeId}-${Date.now()}`
            });
            
            const botMessage: ChatMessage = {
                id: (Date.now() + 1).toString(),
                text: data.fulfillmentText,
                sender: 'bot',
                timestamp: new Date(),
                payload: data.payload
            };

            addMessage(botMessage);
        } catch (error) {
            console.error('Chat error:', error);
            handleApiError(error);
            const errorMessage: ChatMessage = {
                id: (Date.now() + 1).toString(),
                text: "I'm sorry, I encountered an error. Please try again or check your connection.",
                sender: 'bot',
                timestamp: new Date()
            };
            addMessage(errorMessage);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className={cn("fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-50", className)}>
            {/* Floating Chat Button */}
            {!isOpen && (
                <Button
                    onClick={toggleChat}
                    size="lg"
                    className="h-12 w-12 sm:h-14 sm:w-14 rounded-full shadow-lg bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 transition-all duration-200 hover:scale-110"
                >
                    <MessageCircle className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
                    {hasUnreadMessages && (
                        <div className="absolute -top-1 -right-1 w-3 h-3 sm:w-4 sm:h-4 bg-red-500 rounded-full animate-pulse"></div>
                    )}
                </Button>
            )}

            {/* Chat Interface */}
            {isOpen && (
                <Card className="w-80 sm:w-96 h-[400px] sm:h-[500px] shadow-2xl border-0 bg-white/95 backdrop-blur-sm">
                    <CardHeader className="pb-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-t-lg">
                        <div className="flex items-center justify-between">
                            <CardTitle className="flex items-center gap-2 text-white">
                                <Sparkles className="h-5 w-5" />
                                AI Assistant
                            </CardTitle>
                            <div className="flex items-center gap-1">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={handleClearChat}
                                    className="text-white hover:bg-white/20"
                                    title="Clear chat"
                                >
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={toggleChat}
                                    className="text-white hover:bg-white/20"
                                >
                                    <X className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="p-0 flex flex-col h-[calc(400px-60px)] sm:h-[calc(500px-60px)]">
                        <ScrollArea ref={scrollAreaRef} className="flex-1 px-4">
                            <div className="space-y-4 pb-4 pt-4">
                                {/* Quick Actions */}
                                {messages.length === 0 && (
                                    <div className="space-y-3">
                                        <p className="text-sm text-gray-600 text-center">Quick actions:</p>
                                        <div className="flex flex-wrap gap-2">
                                            {QUICK_ACTIONS.map((action, index) => (
                                                <Button
                                                    key={index}
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => handleQuickAction(action)}
                                                    className="text-xs h-auto py-2 px-3"
                                                >
                                                    {action}
                                                </Button>
                                            ))}
                                        </div>
                                    </div>
                                )}
                                
                                {messages.map((message) => (
                                    <div
                                        key={message.id}
                                        className={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                                    >
                                        <div className="flex gap-2 max-w-xs">
                                            {message.sender === 'bot' && (
                                                <div className="flex-shrink-0 w-8 h-8 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full flex items-center justify-center">
                                                    <Bot className="h-4 w-4 text-white" />
                                                </div>
                                            )}
                                            <div
                                                className={`px-4 py-2 rounded-lg ${
                                                    message.sender === 'user'
                                                        ? 'bg-gradient-to-r from-blue-500 to-purple-500 text-white'
                                                        : 'bg-gray-100 text-gray-900'
                                                }`}
                                            >
                                                <p className="text-sm whitespace-pre-wrap">{message.text}</p>
                                                {message.payload && (
                                                    <div className="mt-2">
                                                        {message.payload.richContent?.map((content: any, index: number) => (
                                                            <div key={index}>
                                                                {content.type === 'chart' && (
                                                                    <div className="bg-white p-2 rounded border">
                                                                        <p className="text-xs text-gray-500 mb-2">📊 Chart Data</p>
                                                                        <div className="text-xs text-gray-600">
                                                                            Chart data available for visualization
                                                                        </div>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                                <p className={`text-xs mt-1 ${
                                                    message.sender === 'user' ? 'text-blue-100' : 'text-gray-500'
                                                }`}>
                                                    {formatTime(message.timestamp)}
                                                </p>
                                            </div>
                                            {message.sender === 'user' && (
                                                <div className="flex-shrink-0 w-8 h-8 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full flex items-center justify-center">
                                                    <User className="h-4 w-4 text-white" />
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                                {isLoading && (
                                    <div className="flex justify-start">
                                        <div className="flex gap-2">
                                            <div className="flex-shrink-0 w-8 h-8 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full flex items-center justify-center">
                                                <Bot className="h-4 w-4 text-white" />
                                            </div>
                                            <div className="bg-gray-100 text-gray-900 px-4 py-2 rounded-lg">
                                                <div className="flex space-x-1">
                                                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                                                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                                                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </ScrollArea>
                        
                        <div className="border-t p-4 bg-gray-50">
                            <div className="flex space-x-2">
                                <Input
                                    ref={inputRef}
                                    value={inputText}
                                    onChange={(e) => setInputText(e.target.value)}
                                    onKeyPress={handleKeyPress}
                                    placeholder="Ask me anything..."
                                    disabled={isLoading}
                                    className="flex-1"
                                />
                                <Button 
                                    onClick={sendMessage} 
                                    disabled={isLoading || !inputText.trim()}
                                    size="icon"
                                    className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
                                >
                                    <Send className="h-4 w-4" />
                                </Button>
                            </div>
                            <p className="text-xs text-gray-500 mt-2">
                                Press Enter to send
                            </p>
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    );
} 
import { Send, Bot, User, X, MessageCircle, Sparkles, Trash2, ExternalLink, Package, ShoppingCart, BarChart3, RotateCcw, Settings, AlertTriangle, CheckCircle2, ChevronRight } from 'lucide-react';
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useLocation } from 'wouter';
import { useAIChat } from '@/hooks/use-ai-chat';
import { apiClient, handleApiError } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
import { ScrollArea } from '../ui/scroll-area';

interface ChatMessage {
    id: string;
    text: string;
    sender: 'user' | 'bot';
    timestamp: Date;
    payload?: any;
}

interface ActionTrigger {
    type: 'navigate' | 'action';
    label: string;
    target: string;
    icon?: string;
}

interface RichContent {
    type: 'table' | 'list' | 'chart' | 'actions' | 'steps';
    title?: string;
    data: any;
}

interface FloatingChatProps {
    storeId?: string;
    className?: string;
}

const QUICK_ACTIONS = [
    "Show me low stock items",
    "What are today's sales?",
    "How do I make a sale?",
    "Help me with inventory"
];

// Icon mapping for action buttons
const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
    Package,
    ShoppingCart,
    BarChart3,
    RotateCcw,
    Settings,
    AlertTriangle,
    ExternalLink,
};

export default function FloatingChat({ storeId = "default", className }: FloatingChatProps) {
    const { messages, addMessage, clearMessages, isOpen, setIsOpen, isLoading, setIsLoading } = useAIChat();
    const [inputText, setInputText] = useState('');
    const [hasUnreadMessages, setHasUnreadMessages] = useState(false);
    const scrollAreaRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const [, setLocation] = useLocation();

    // Build conversation history for API calls (excluding welcome message)
    const conversationHistory = useMemo(() => {
        return messages
            .filter(m => m.id !== 'welcome')
            .map(m => ({
                role: m.sender === 'user' ? 'user' as const : 'assistant' as const,
                content: m.text
            }));
    }, [messages]);

    // Add welcome message on first open
    useEffect(() => {
        if (isOpen && messages.length === 0) {
            const welcomeMessage: ChatMessage = {
                id: 'welcome',
                text: "Hello! I'm your AI assistant. I can help you with:\n\n• Inventory & stock management\n• Sales analytics & trends\n• Step-by-step tutorials\n• Demand forecasting\n\nTry asking \"How do I make a sale?\" or click a quick action below!",
                sender: 'bot',
                timestamp: new Date()
            };
            addMessage(welcomeMessage);
        }
    }, [isOpen, messages.length, addMessage]);
    
    // Handle action button clicks
    const handleActionClick = (action: ActionTrigger) => {
        if (action.type === 'navigate') {
            setLocation(action.target);
            setIsOpen(false);
        } else if (action.target.startsWith('tutorial:')) {
            // Handle tutorial action - send as message
            setInputText(`Show me the tutorial for ${action.label}`);
            setTimeout(() => void sendMessageWithText(`Show me the tutorial for ${action.label}`), 100);
        }
    };
    
    // Get icon component for action
    const getActionIcon = (iconName?: string) => {
        if (!iconName) return ExternalLink;
        return iconMap[iconName] || ExternalLink;
    };

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

    // Core message sending function
    const sendMessageWithText = async (text: string) => {
        if (!text.trim() || isLoading) return;

        const userMessage: ChatMessage = {
            id: Date.now().toString(),
            text,
            sender: 'user',
            timestamp: new Date()
        };

        addMessage(userMessage);
        setInputText('');
        setIsLoading(true);

        try {
            const data: any = await apiClient.post('/openai/chat', {
                message: text,
                storeId,
                conversationHistory
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
    
    const sendMessage = () => sendMessageWithText(inputText);

    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            void sendMessage();
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
        void sendMessageWithText(action);
    };
    
    // Render rich content components
    const renderRichContent = (content: RichContent, index: number) => {
        switch (content.type) {
            case 'table':
                return (
                    <div key={index} className="mt-2 bg-white rounded border overflow-hidden">
                        {content.title && (
                            <div className="px-2 py-1 bg-gray-50 border-b text-xs font-medium text-gray-700">
                                {content.title}
                            </div>
                        )}
                        <div className="overflow-x-auto">
                            <table className="w-full text-xs">
                                <thead className="bg-gray-50">
                                    <tr>
                                        {content.data.headers?.map((h: string, i: number) => (
                                            <th key={i} className="px-2 py-1 text-left font-medium text-gray-600">{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {content.data.rows?.slice(0, 5).map((row: any[], rowIdx: number) => (
                                        <tr key={rowIdx} className="border-t">
                                            {row.map((cell, cellIdx) => (
                                                <td key={cellIdx} className="px-2 py-1 text-gray-800">{cell}</td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                );
            
            case 'steps':
                return (
                    <div key={index} className="mt-2 space-y-2">
                        {content.data?.map((step: any) => (
                            <div key={step.step} className="flex gap-2 bg-white rounded border p-2">
                                <div className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-500 text-white text-xs flex items-center justify-center font-medium">
                                    {step.step}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="text-xs font-medium text-gray-800">{step.title}</div>
                                    <div className="text-xs text-gray-600">{step.description}</div>
                                </div>
                                {step.action && (
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-6 px-2 text-xs"
                                        onClick={() => {
                                            setLocation(step.action);
                                            setIsOpen(false);
                                        }}
                                    >
                                        <ChevronRight className="h-3 w-3" />
                                    </Button>
                                )}
                            </div>
                        ))}
                    </div>
                );
            
            case 'list':
                return (
                    <div key={index} className="mt-2 bg-white rounded border p-2">
                        {content.title && (
                            <div className="text-xs font-medium text-gray-700 mb-2">{content.title}</div>
                        )}
                        <div className="space-y-1">
                            {content.data?.map((item: any, i: number) => (
                                <div key={i} className="flex items-start gap-2">
                                    <CheckCircle2 className="h-3 w-3 text-green-500 mt-0.5 flex-shrink-0" />
                                    <div>
                                        <span className="text-xs font-medium text-gray-800">{item.title}</span>
                                        {item.description && (
                                            <span className="text-xs text-gray-600 ml-1">- {item.description}</span>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                );
            
            case 'chart':
                if (content.data?.type === 'summary') {
                    return (
                        <div key={index} className="mt-2 bg-white rounded border p-2">
                            {content.title && (
                                <div className="text-xs font-medium text-gray-700 mb-2">{content.title}</div>
                            )}
                            <div className="grid grid-cols-3 gap-2">
                                {content.data.metrics?.map((metric: any, i: number) => (
                                    <div key={i} className="text-center p-2 bg-gray-50 rounded">
                                        <div className="text-lg font-bold text-blue-600">{metric.value}</div>
                                        <div className="text-xs text-gray-500">{metric.label}</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    );
                }
                return null;
            
            default:
                return null;
        }
    };
    
    // Render action buttons
    const renderActions = (actions: ActionTrigger[]) => {
        if (!actions || actions.length === 0) return null;
        
        return (
            <div className="mt-2 flex flex-wrap gap-1">
                {actions.map((action, i) => {
                    const IconComponent = getActionIcon(action.icon);
                    return (
                        <Button
                            key={i}
                            variant="outline"
                            size="sm"
                            className="h-7 px-2 text-xs gap-1"
                            onClick={() => handleActionClick(action)}
                        >
                            <IconComponent className="h-3 w-3" />
                            {action.label}
                        </Button>
                    );
                })}
            </div>
        );
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
                                        <div className={cn(
                                            "flex gap-2",
                                            message.sender === 'bot' ? "max-w-[95%]" : "max-w-xs"
                                        )}>
                                            {message.sender === 'bot' && (
                                                <div className="flex-shrink-0 w-8 h-8 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full flex items-center justify-center">
                                                    <Bot className="h-4 w-4 text-white" />
                                                </div>
                                            )}
                                            <div
                                                className={cn(
                                                    "px-4 py-2 rounded-lg",
                                                    message.sender === 'user'
                                                        ? 'bg-gradient-to-r from-blue-500 to-purple-500 text-white'
                                                        : 'bg-gray-100 text-gray-900'
                                                )}
                                            >
                                                <p className="text-sm whitespace-pre-wrap">{message.text}</p>
                                                
                                                {/* Tutorial badge */}
                                                {message.payload?.isTutorial && (
                                                    <Badge variant="secondary" className="mt-2 text-xs">
                                                        📚 Tutorial
                                                    </Badge>
                                                )}
                                                
                                                {/* Rich content rendering */}
                                                {message.payload?.richContent?.map((content: RichContent, index: number) => 
                                                    renderRichContent(content, index)
                                                )}
                                                
                                                {/* Action buttons */}
                                                {message.payload?.actions && renderActions(message.payload.actions)}
                                                
                                                <p className={`text-xs mt-2 ${
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
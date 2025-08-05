import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { ScrollArea } from '../ui/scroll-area';
import { Send, Bot, User } from 'lucide-react';

interface ChatMessage {
    id: string;
    text: string;
    sender: 'user' | 'bot';
    timestamp: Date;
    payload?: any;
}

interface ForecastChatProps {
    storeId: string;
    className?: string;
}

export default function ForecastChat({ storeId, className }: ForecastChatProps) {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [inputText, setInputText] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const scrollAreaRef = useRef<HTMLDivElement>(null);

    // Add welcome message on component mount
    useEffect(() => {
        const welcomeMessage: ChatMessage = {
            id: 'welcome',
            text: "Hello! I'm your AI forecasting assistant. I can help you with:\n\n• Demand forecasts (e.g., 'What's the demand forecast for next month?')\n• Inventory insights (e.g., 'Show me low stock alerts')\n• Sales trends (e.g., 'What are the current sales trends?')\n• Reorder recommendations (e.g., 'When should I reorder electronics?')\n\nHow can I help you today?",
            sender: 'bot',
            timestamp: new Date()
        };
        setMessages([welcomeMessage]);
    }, []);

    const sendMessage = async () => {
        if (!inputText.trim() || isLoading) return;

        const userMessage: ChatMessage = {
            id: Date.now().toString(),
            text: inputText,
            sender: 'user',
            timestamp: new Date()
        };

        setMessages(prev => [...prev, userMessage]);
        setInputText('');
        setIsLoading(true);

        try {
            const response = await fetch('/api/openai/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    message: inputText,
                    storeId,
                    sessionId: `store-${storeId}-${Date.now()}`
                })
            });

            if (!response.ok) {
                throw new Error('Failed to get response');
            }

            const data = await response.json();
            
            const botMessage: ChatMessage = {
                id: (Date.now() + 1).toString(),
                text: data.fulfillmentText,
                sender: 'bot',
                timestamp: new Date(),
                payload: data.payload
            };

            setMessages(prev => [...prev, botMessage]);
        } catch (error) {
            console.error('Chat error:', error);
            const errorMessage: ChatMessage = {
                id: (Date.now() + 1).toString(),
                text: "I'm sorry, I encountered an error. Please try again or check your connection.",
                sender: 'bot',
                timestamp: new Date()
            };
            setMessages(prev => [...prev, errorMessage]);
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

    const formatTime = (date: Date) => {
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    return (
        <Card className={className}>
            <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2">
                    <Bot className="h-5 w-5 text-blue-600" />
                    AI Forecasting Assistant
                </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
                <ScrollArea ref={scrollAreaRef} className="h-96 px-4">
                    <div className="space-y-4 pb-4">
                        {messages.map((message) => (
                            <div
                                key={message.id}
                                className={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                            >
                                <div className="flex gap-2 max-w-xs">
                                    {message.sender === 'bot' && (
                                        <div className="flex-shrink-0 w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                                            <Bot className="h-4 w-4 text-blue-600" />
                                        </div>
                                    )}
                                    <div
                                        className={`px-4 py-2 rounded-lg ${
                                            message.sender === 'user'
                                                ? 'bg-blue-500 text-white'
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
                                                                <p className="text-xs text-gray-500 mb-2">📊 Forecast Chart</p>
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
                                        <div className="flex-shrink-0 w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center">
                                            <User className="h-4 w-4 text-white" />
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                        {isLoading && (
                            <div className="flex justify-start">
                                <div className="flex gap-2">
                                    <div className="flex-shrink-0 w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                                        <Bot className="h-4 w-4 text-blue-600" />
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
                
                <div className="border-t p-4">
                    <div className="flex space-x-2">
                        <Input
                            value={inputText}
                            onChange={(e) => setInputText(e.target.value)}
                            onKeyPress={handleKeyPress}
                            placeholder="Ask about forecasts, inventory, or trends..."
                            disabled={isLoading}
                            className="flex-1"
                        />
                        <Button 
                            onClick={sendMessage} 
                            disabled={isLoading || !inputText.trim()}
                            size="icon"
                        >
                            <Send className="h-4 w-4" />
                        </Button>
                    </div>
                    <p className="text-xs text-gray-500 mt-2">
                        Press Enter to send, Shift+Enter for new line
                    </p>
                </div>
            </CardContent>
        </Card>
    );
} 
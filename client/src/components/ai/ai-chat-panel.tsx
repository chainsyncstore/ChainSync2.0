/**
 * AI Chat Panel - Floating chat interface for profit advisor
 * 
 * Features:
 * - Floating button to open/close chat
 * - Message history with streaming responses
 * - Quick suggestion chips
 * - Markdown rendering
 * - Store selection for Admins
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
    Bot,
    MessageCircle,
    Send,
    Sparkles,
    Trash2,
    X,
    Store,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { getCsrfToken } from "@/lib/csrf";
import { cn } from "@/lib/utils";

// Types
interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
}

interface ChatStatusResponse {
    success: boolean;
    available: boolean;
    model: string;
}

interface ChatHistoryResponse {
    success: boolean;
    messages: ChatMessage[];
}

interface StoreData {
    id: string;
    name: string;
    isActive: boolean;
}

// Quick suggestion chips
const SUGGESTIONS = [
    "What are my most profitable products?",
    "Which products need restocking?",
    "Show me products causing losses",
    "What are the current alerts?",
];

interface AiChatPanelProps {
    storeId: string | null;
}

export function AiChatPanel({ storeId }: AiChatPanelProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);
    const [message, setMessage] = useState('');
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [isStreaming, setIsStreaming] = useState(false);
    const [streamingContent, setStreamingContent] = useState('');
    const scrollRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const { toast } = useToast();
    const queryClient = useQueryClient();

    // Determine the active store ID (prop takes precedence, then internal state)
    const activeStoreId = storeId || selectedStoreId;

    // Fetch stores list if no storeId prop is provided (for Admins)
    const storesQuery = useQuery<{ data: StoreData[] }>({
        queryKey: ['/api/stores'],
        enabled: !storeId && isOpen,
        queryFn: async () => {
            const res = await fetch('/api/stores', { credentials: 'include' });
            if (!res.ok) throw new Error('Failed to load stores');
            return res.json();
        }
    });

    const stores = storesQuery.data?.data || [];
    const activeStoreName = stores.find(s => s.id === activeStoreId)?.name;

    // Check if AI chat is available
    const statusQuery = useQuery<ChatStatusResponse>({
        queryKey: ['/api/ai/chat/status'],
        queryFn: async () => {
            const res = await fetch('/api/ai/chat/status', { credentials: 'include' });
            if (!res.ok) throw new Error('Failed to check status');
            return res.json();
        },
        refetchInterval: 60000,
    });

    // Load chat history when opened and store is selected
    const historyQuery = useQuery<ChatHistoryResponse>({
        queryKey: ['/api/ai/chat/history', activeStoreId],
        enabled: Boolean(activeStoreId) && isOpen,
        queryFn: async () => {
            const res = await fetch(`/api/ai/chat/history/${activeStoreId}`, { credentials: 'include' });
            if (!res.ok) throw new Error('Failed to load history');
            return res.json();
        },
    });

    // Sync history when loaded
    useEffect(() => {
        if (historyQuery.data?.messages) {
            setMessages(historyQuery.data.messages);
            // Scroll to bottom after loading history
            setTimeout(() => {
                if (scrollRef.current) {
                    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
                }
            }, 100);
        } else if (!activeStoreId) {
            setMessages([]);
        }
    }, [historyQuery.data, activeStoreId]);

    // Clear history mutation
    const clearMutation = useMutation({
        mutationFn: async () => {
            if (!activeStoreId) return;
            const csrfToken = await getCsrfToken();
            const res = await fetch(`/api/ai/chat/clear/${activeStoreId}`, {
                method: 'POST',
                credentials: 'include',
                headers: { 'X-CSRF-Token': csrfToken },
            });
            if (!res.ok) throw new Error('Failed to clear');
            return res.json();
        },
        onSuccess: () => {
            setMessages([]);
            toast({ title: 'Conversation cleared' });
        },
    });

    // Scroll to bottom when messages change
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages, streamingContent]);

    // Focus input when opening
    useEffect(() => {
        if (isOpen && inputRef.current && activeStoreId) {
            setTimeout(() => inputRef.current?.focus(), 100);
        }
    }, [isOpen, activeStoreId]);

    // Send message with streaming
    const sendMessage = useCallback(async (text: string) => {
        if (!text.trim() || !activeStoreId || isStreaming) return;

        const userMessage: ChatMessage = { role: 'user', content: text };
        setMessages(prev => [...prev, userMessage]);
        setMessage('');
        setIsStreaming(true);
        setStreamingContent('');

        try {
            const csrfToken = await getCsrfToken();
            const response = await fetch('/api/ai/chat/stream', {
                method: 'POST',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': csrfToken,
                },
                body: JSON.stringify({ storeId: activeStoreId, message: text }),
            });

            if (!response.ok) {
                throw new Error('Failed to send message');
            }

            const reader = response.body?.getReader();
            const decoder = new TextDecoder();
            let content = '';

            if (reader) {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    const chunk = decoder.decode(value);
                    const lines = chunk.split('\n');

                    for (const line of lines) {
                        if (line.startsWith('data: ')) {
                            const data = line.slice(6);
                            if (data === '[DONE]') {
                                break;
                            }
                            try {
                                const parsed = JSON.parse(data);
                                if (parsed.content) {
                                    content += parsed.content;
                                    setStreamingContent(content);
                                }
                            } catch {
                                // Ignore parse errors for partial chunks
                            }
                        }
                    }
                }
            }

            // Add final message
            const assistantMessage: ChatMessage = { role: 'assistant', content };
            setMessages(prev => [...prev, assistantMessage]);
            setStreamingContent('');

            // Invalidate history cache
            void queryClient.invalidateQueries({ queryKey: ['/api/ai/chat/history', activeStoreId] });

        } catch {
            toast({
                title: 'Error',
                description: 'Failed to send message. Please try again.',
                variant: 'destructive',
            });
            // Remove the user message on error
            setMessages(prev => prev.slice(0, -1));
        } finally {
            setIsStreaming(false);
            setStreamingContent('');
        }
    }, [activeStoreId, isStreaming, queryClient, toast]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        void sendMessage(message);
    };

    const handleSuggestion = (suggestion: string) => {
        void sendMessage(suggestion);
    };

    const isAvailable = statusQuery.data?.available ?? false;

    // For managers without a store prop, we might render nothing, 
    // but the layout should handle that. For admins, we render to allow selection.

    return (
        <>
            {/* Floating Button */}
            <Button
                onClick={() => setIsOpen(!isOpen)}
                className={cn(
                    "fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-lg z-50",
                    "bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700",
                    "transition-all duration-300 hover:scale-110",
                    isOpen && "rotate-90"
                )}
                size="icon"
                title="AI Profit Advisor"
            >
                {isOpen ? <X className="h-6 w-6" /> : <MessageCircle className="h-6 w-6" />}
            </Button>

            {/* Chat Panel */}
            {isOpen && (
                <Card className={cn(
                    "fixed bottom-24 right-6 w-96 max-h-[600px] z-50",
                    "shadow-2xl border-purple-200/50",
                    "animate-in slide-in-from-bottom-4 fade-in duration-300",
                    "flex flex-col"
                )}>
                    <CardHeader className="pb-3 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-t-lg shrink-0">
                        <CardTitle className="flex items-center justify-between text-base">
                            <div className="flex items-center gap-2">
                                <Bot className="h-5 w-5" />
                                <div className="flex flex-col">
                                    <span>AI Profit Advisor</span>
                                    {activeStoreName && (
                                        <span className="text-[10px] font-normal opacity-90 flex items-center gap-1">
                                            <Store className="h-3 w-3" /> {activeStoreName}
                                        </span>
                                    )}
                                </div>
                                {!isAvailable && (
                                    <span className="text-xs bg-yellow-500 text-black px-2 py-0.5 rounded ml-2">
                                        Unavailable
                                    </span>
                                )}
                            </div>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-white hover:bg-white/20"
                                onClick={() => clearMutation.mutate()}
                                disabled={messages.length === 0 || !activeStoreId}
                                title="Clear conversation"
                            >
                                <Trash2 className="h-4 w-4" />
                            </Button>
                        </CardTitle>

                        {/* Store Selector for Admins */}
                        {!storeId && stores.length > 0 && (
                            <div className="mt-2">
                                <Select
                                    value={selectedStoreId || ''}
                                    onValueChange={(val) => {
                                        setSelectedStoreId(val);
                                        setMessages([]); // Clear visible messages when switching context
                                    }}
                                >
                                    <SelectTrigger className="h-8 text-xs bg-white/10 border-white/20 text-white hover:bg-white/20 focus:ring-0 focus:ring-offset-0">
                                        <SelectValue placeholder="Select a store to chat" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {stores.map(store => (
                                            <SelectItem key={store.id} value={store.id} className="text-xs">
                                                {store.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        )}
                    </CardHeader>

                    <CardContent className="p-0 flex-1 overflow-hidden flex flex-col h-[400px]">
                        <ScrollArea className="flex-1 p-4" ref={scrollRef}>
                            {!activeStoreId ? (
                                <div className="text-center py-12 flex flex-col items-center justify-center h-full text-muted-foreground">
                                    <Store className="h-12 w-12 mb-4 opacity-20" />
                                    <p className="font-medium">Welcome, Admin!</p>
                                    <p className="text-sm mt-1 max-w-[200px]">
                                        Please select a store above to start analyzing its data with AI.
                                    </p>
                                </div>
                            ) : messages.length === 0 && !isStreaming ? (
                                <div className="text-center py-8">
                                    <Sparkles className="h-8 w-8 mx-auto mb-3 text-purple-400" />
                                    <p className="text-sm text-muted-foreground mb-4">
                                        Ask me about your store&apos;s profitability, inventory, or sales!
                                    </p>
                                    <div className="flex flex-wrap gap-2 justify-center">
                                        {SUGGESTIONS.map((suggestion) => (
                                            <Button
                                                key={suggestion}
                                                variant="outline"
                                                size="sm"
                                                className="text-xs"
                                                onClick={() => handleSuggestion(suggestion)}
                                                disabled={!isAvailable}
                                            >
                                                {suggestion}
                                            </Button>
                                        ))}
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-4 pb-4">
                                    {messages.map((msg, i) => (
                                        <div
                                            key={i}
                                            className={cn(
                                                "flex",
                                                msg.role === 'user' ? 'justify-end' : 'justify-start'
                                            )}
                                        >
                                            <div
                                                className={cn(
                                                    "max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap",
                                                    msg.role === 'user'
                                                        ? "bg-purple-600 text-white"
                                                        : "bg-slate-100 text-slate-900"
                                                )}
                                            >
                                                {msg.content}
                                            </div>
                                        </div>
                                    ))}
                                    {isStreaming && streamingContent && (
                                        <div className="flex justify-start">
                                            <div className="max-w-[85%] rounded-lg px-3 py-2 text-sm bg-slate-100 text-slate-900 whitespace-pre-wrap">
                                                {streamingContent}
                                            </div>
                                        </div>
                                    )}
                                    {isStreaming && !streamingContent && (
                                        <div className="flex justify-start">
                                            <div className="rounded-lg px-3 py-2 text-sm bg-slate-100">
                                                <div className="flex gap-1">
                                                    <span className="animate-bounce">●</span>
                                                    <span className="animate-bounce delay-100">●</span>
                                                    <span className="animate-bounce delay-200">●</span>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </ScrollArea>
                    </CardContent>

                    <CardFooter className="p-3 pt-0 shrink-0 bg-white">
                        <form onSubmit={handleSubmit} className="flex gap-2 w-full">
                            <Input
                                ref={inputRef}
                                value={message}
                                onChange={(e) => setMessage(e.target.value)}
                                placeholder={!activeStoreId ? "Select a store first..." : isAvailable ? "Ask about profits, inventory..." : "AI not available"}
                                disabled={isStreaming || !isAvailable || !activeStoreId}
                                className="flex-1"
                            />
                            <Button
                                type="submit"
                                size="icon"
                                disabled={!message.trim() || isStreaming || !isAvailable || !activeStoreId}
                                className="bg-purple-600 hover:bg-purple-700"
                            >
                                <Send className="h-4 w-4" />
                            </Button>
                        </form>
                    </CardFooter>
                </Card>
            )}
        </>
    );
}

export default AiChatPanel;

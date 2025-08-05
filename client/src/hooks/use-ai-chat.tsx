import { useState, useEffect, createContext, useContext, ReactNode } from 'react';

interface ChatMessage {
    id: string;
    text: string;
    sender: 'user' | 'bot';
    timestamp: Date;
    payload?: any;
}

interface AIChatContextType {
    messages: ChatMessage[];
    addMessage: (message: ChatMessage) => void;
    clearMessages: () => void;
    isOpen: boolean;
    setIsOpen: (open: boolean) => void;
    isLoading: boolean;
    setIsLoading: (loading: boolean) => void;
}

const AIChatContext = createContext<AIChatContextType | undefined>(undefined);

export function AIChatProvider({ children }: { children: ReactNode }) {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [isOpen, setIsOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    // Load messages from localStorage on mount
    useEffect(() => {
        const savedMessages = localStorage.getItem('ai-chat-messages');
        if (savedMessages) {
            try {
                const parsed = JSON.parse(savedMessages);
                // Convert timestamp strings back to Date objects
                const messagesWithDates = parsed.map((msg: any) => ({
                    ...msg,
                    timestamp: new Date(msg.timestamp)
                }));
                setMessages(messagesWithDates);
            } catch (error) {
                console.error('Failed to load chat messages:', error);
            }
        }
    }, []);

    // Save messages to localStorage whenever they change
    useEffect(() => {
        localStorage.setItem('ai-chat-messages', JSON.stringify(messages));
    }, [messages]);

    const addMessage = (message: ChatMessage) => {
        setMessages(prev => [...prev, message]);
    };

    const clearMessages = () => {
        setMessages([]);
        localStorage.removeItem('ai-chat-messages');
    };

    const value = {
        messages,
        addMessage,
        clearMessages,
        isOpen,
        setIsOpen,
        isLoading,
        setIsLoading
    };

    return (
        <AIChatContext.Provider value={value}>
            {children}
        </AIChatContext.Provider>
    );
}

export function useAIChat() {
    const context = useContext(AIChatContext);
    if (context === undefined) {
        throw new Error('useAIChat must be used within an AIChatProvider');
    }
    return context;
} 
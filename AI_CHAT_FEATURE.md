# AI Chat Feature

## Overview
The AI Chat feature provides a floating chat interface that can be accessed from any screen in the ChainSync application. It offers intelligent assistance for inventory management, sales analytics, demand forecasting, and more.

## Features

### Floating Chat Interface
- **Floating Button**: A circular chat button appears in the bottom-right corner of every screen
- **Expandable Chat**: Click the button to open a full chat interface
- **Persistent State**: Chat history is maintained across page navigation using localStorage
- **Responsive Design**: Works seamlessly on desktop and mobile devices

### AI Capabilities
The AI assistant can help with:
- **Inventory Management**: Check stock levels, low stock alerts, reorder recommendations
- **Sales Analytics**: View sales trends, performance metrics, revenue analysis
- **Demand Forecasting**: Predict future demand for products
- **Product Insights**: Best-selling products, product recommendations
- **Store Performance**: Multi-store analytics and comparisons
- **Customer Data**: Customer behavior analysis and insights

### User Interface Features
- **Quick Actions**: Pre-defined buttons for common queries
- **Message History**: Persistent conversation history
- **Loading States**: Visual feedback during AI processing
- **Error Handling**: Graceful error messages for failed requests
- **Clear Chat**: Option to clear conversation history
- **Unread Notifications**: Red dot indicator for new messages

## Technical Implementation

### Components
- `FloatingChat`: Main chat interface component
- `useAIChat`: Global state management hook
- `AIChatProvider`: Context provider for chat state

### State Management
- Uses React Context for global state
- localStorage for persistence across sessions
- Real-time message updates
- Loading and error states

### API Integration
- Connects to `/api/openai/chat` endpoint
- Supports store-specific conversations
- Handles rich content responses (charts, data)

## Usage

### For Users
1. Look for the floating chat button (message circle icon) in the bottom-right corner
2. Click to open the chat interface
3. Use quick action buttons or type your own questions
4. Chat history is automatically saved and restored

### For Developers
The chat interface is automatically included in all screens through the `MainLayout` component. No additional setup required.

## Customization

### Styling
- Customizable via Tailwind CSS classes
- Gradient themes (blue to purple)
- Responsive breakpoints for mobile/desktop

### Quick Actions
Modify the `QUICK_ACTIONS` array in `floating-chat.tsx` to add or change quick action buttons.

### AI Responses
The AI responses are handled by the OpenAI integration in the backend. Customize the AI behavior by modifying the server-side chat endpoint.

## Future Enhancements
- Voice input/output
- File upload support
- Advanced analytics integration
- Multi-language support
- Custom AI models per store 
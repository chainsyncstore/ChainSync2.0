# OpenAI Integration for ChainSync AI Forecasting

## Overview

This integration adds OpenAI capabilities to ChainSync, enabling natural language interaction with AI forecasting models. Users can now ask questions about demand forecasts, inventory insights, and sales trends using conversational language powered by GPT-3.5-turbo.

## Features

### 🤖 Conversational AI Interface
- Natural language queries for forecasting data
- Real-time responses with formatted insights
- Rich content support (charts, tables)
- Context-aware conversations using store data

### 📊 Forecasting Queries
- **Demand Forecasting**: "What's the demand forecast for next month?"
- **Product-Specific**: "Show me sales predictions for electronics"
- **Time-Based**: "Forecast demand for next 30 days"
- **Category Analysis**: "What will clothing sales be like?"

### 📦 Inventory Management
- **Low Stock Alerts**: "Show me low stock alerts"
- **Reorder Recommendations**: "When should I reorder electronics?"
- **Overstock Detection**: "Which products are overstocked?"
- **Optimal Levels**: "What's my optimal stock level for food?"

### 📈 Trend Analysis
- **Sales Trends**: "What are the current sales trends?"
- **Seasonal Patterns**: "Show me seasonal patterns for electronics"
- **Growth Drivers**: "What's driving sales growth?"
- **Anomaly Detection**: "Identify sales anomalies"

## Quick Start

### 1. Install Dependencies
```bash
npm install openai
```

### 2. Set Environment Variables
```bash
# .env
OPENAI_API_KEY=your-openai-api-key
```

### 3. Start the Application
```bash
npm run dev
```

### 4. Access AI Assistant
Navigate to the Analytics page and click on the "AI Assistant" tab to start chatting with the forecasting AI.

## Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   OpenAI        │    │   ChainSync     │    │   AI Models     │
│   GPT-3.5-turbo │◄──►│   Backend       │◄──►│   (Forecasting) │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Chat          │    │   Database      │    │   Analytics     │
│   Service       │    │   (PostgreSQL)  │    │   Engine        │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## API Endpoints

### POST `/api/openai/chat`

Process natural language queries and return AI-powered responses.

**Request Body:**
```json
{
  "message": "What's the demand forecast for electronics next month?",
  "storeId": "store-123",
  "sessionId": "session-456"
}
```

**Response:**
```json
{
  "fulfillmentText": "Based on your request for electronics over 30 days, here's the demand forecast...",
  "payload": {
    "type": "forecast",
    "data": {
      "summary": "Expected demand for electronics over the next 30 days",
      "insights": [
        "Peak demand expected on weekends",
        "Seasonal increase of 15% compared to last period"
      ],
      "data": {
        "period": 30,
        "category": "electronics",
        "forecastedDemand": 750,
        "confidence": 0.85
      }
    }
  }
}
```

## System Prompt

The AI assistant uses a comprehensive system prompt that includes:

- **Role Definition**: AI assistant for ChainSync retail management
- **Capabilities**: Demand forecasting, inventory management, sales analysis
- **Context**: Current store data (products, sales, categories)
- **Behavior**: Conversational, professional, actionable insights

## Data Context

The AI service automatically fetches relevant store context:

- **Recent Sales Data**: Last 100 sales records for trend analysis
- **Product Inventory**: Current stock levels and product information
- **Categories**: Store categories for targeted analysis

## Error Handling

The service includes robust error handling:

- **API Errors**: Graceful fallback with user-friendly messages
- **Database Errors**: Safe defaults when data is unavailable
- **Rate Limiting**: Respects OpenAI API limits
- **Timeout Handling**: Configurable response timeouts

## Configuration

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `OPENAI_API_KEY` | Your OpenAI API key | Yes |

### Model Configuration

The service uses GPT-3.5-turbo with the following settings:

- **Model**: `gpt-3.5-turbo`
- **Temperature**: `0.7` (balanced creativity and consistency)
- **Max Tokens**: `1000` (sufficient for detailed responses)
- **System Prompt**: Context-aware with store data

## Security Considerations

- API keys are stored securely in environment variables
- No sensitive data is sent to OpenAI beyond necessary context
- All database queries use parameterized statements
- Session management for user authentication

## Performance Optimization

- **Caching**: Consider implementing response caching for common queries
- **Rate Limiting**: Built-in respect for OpenAI API limits
- **Async Processing**: Non-blocking API calls
- **Context Optimization**: Efficient database queries for context data

## Troubleshooting

### Common Issues

1. **API Key Error**: Ensure `OPENAI_API_KEY` is set correctly
2. **Rate Limit Exceeded**: Implement exponential backoff for retries
3. **Context Data Missing**: Check database connectivity and store ID validity
4. **Response Timeout**: Consider reducing `max_tokens` or optimizing prompts

### Debug Mode

Enable debug logging by setting:
```bash
DEBUG=openai:*
```

## Future Enhancements

- **Fine-tuning**: Custom model training on retail data
- **Multi-modal**: Support for image analysis (receipts, inventory photos)
- **Voice Integration**: Speech-to-text and text-to-speech capabilities
- **Advanced Analytics**: Integration with external BI tools
- **Predictive Models**: Custom ML models for specific forecasting needs 
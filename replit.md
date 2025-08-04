# ChainSync POS System

## Overview

ChainSync is a comprehensive Point-of-Sale (POS) and inventory management system designed for small store owners, standalone supermarkets, and supermarket chains. The application provides real-time inventory tracking, multi-store analytics, automated low-stock alerts, and seamless integration capabilities. It features a modern React frontend with shadcn/ui components and a Node.js/Express backend with PostgreSQL database integration.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript using Vite for build tooling
- **UI Components**: shadcn/ui component library with Radix UI primitives
- **Styling**: Tailwind CSS with CSS variables for theming support
- **State Management**: TanStack Query (React Query) for server state management
- **Routing**: Wouter for lightweight client-side routing
- **Form Handling**: React Hook Form with Zod validation

### Backend Architecture
- **Runtime**: Node.js with Express.js framework
- **Language**: TypeScript with ES modules
- **API Design**: RESTful API architecture with route-based organization
- **Database ORM**: Drizzle ORM for type-safe database operations
- **Schema Validation**: Zod schemas for API input validation
- **Development**: Hot module replacement with Vite integration

### Data Storage Solutions
- **Primary Database**: PostgreSQL with Neon serverless driver
- **Schema Management**: Drizzle Kit for migrations and schema management
- **Database Design**: Normalized relational schema with proper foreign key relationships
- **Connection Pooling**: Neon serverless connection pooling for scalability

### Authentication and Authorization
- **User Roles**: Three-tier role system (cashier, manager, admin)
- **Store Association**: Users are associated with specific stores for multi-tenant support
- **Permission System**: Role-based access control for different application features

### Core Business Logic
- **POS Operations**: Real-time inventory updates during transactions
- **Inventory Management**: Automated stock level tracking with configurable thresholds
- **Analytics Engine**: Sales performance, profit/loss calculations, and product popularity rankings
- **Alert System**: Automated low-stock notifications and system alerts
- **Multi-Store Support**: Centralized management for chain operations

### File Upload and Storage
- **Cloud Storage**: Google Cloud Storage integration for file uploads
- **File Processing**: Uppy.js for drag-and-drop file uploads with progress tracking
- **Data Import**: CSV/Excel file processing for bulk data migration

## External Dependencies

### Cloud Services
- **Neon Database**: Serverless PostgreSQL hosting with connection pooling
- **Google Cloud Storage**: File storage and management for data imports and assets
- **Replit Infrastructure**: Development environment and deployment platform

### Third-Party Libraries
- **UI Framework**: Radix UI primitives for accessible components
- **Charts**: Recharts for data visualization and analytics dashboards
- **File Upload**: Uppy ecosystem for file handling (Core, Dashboard, AWS S3, Drag Drop)
- **Validation**: Zod for runtime type checking and schema validation
- **Utilities**: Class variance authority (CVA) for component styling variants

### Development Tools
- **Build System**: Vite with React plugin and TypeScript support
- **Code Quality**: ESBuild for production bundling
- **Development**: Hot reload, error overlay, and Replit-specific development plugins
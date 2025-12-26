import { ChevronDown, ChevronRight, FileText, Lock, Package, ShoppingCart, Store } from "lucide-react";
import { useState } from "react";

import PublicPageLayout from "@/components/layout/public-page-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface DocSection {
    title: string;
    icon: React.ElementType;
    description: string;
    content: string[];
}

const docSections: DocSection[] = [
    {
        title: "POS Workflow",
        icon: ShoppingCart,
        description: "How the Point of Sale system works",
        content: [
            "The POS screen displays your product catalog with search and barcode scanning support.",
            "Products are added to the cart by clicking or scanning. Quantities can be adjusted.",
            "Multiple payment methods are supported: cash, card, and bank transfer.",
            "Each transaction is automatically recorded with timestamp and user information.",
            "Receipts can be printed or sent digitally to customers.",
            "All sales sync in real-time with inventory and analytics.",
        ],
    },
    {
        title: "Inventory Workflow",
        icon: Package,
        description: "Managing your product inventory",
        content: [
            "Products are organized in a searchable catalog with categories and tags.",
            "Each product tracks quantity, cost price, and selling price.",
            "Stock levels update automatically when sales are made.",
            "Low-stock alerts notify you before items run out.",
            "Stock adjustments can be made for damaged goods or corrections.",
            "Inventory imports allow bulk updates via CSV files.",
        ],
    },
    {
        title: "Roles & Permissions",
        icon: Lock,
        description: "User access control system",
        content: [
            "Admin: Full platform access including settings, billing, and user management.",
            "Manager: Access to inventory, analytics, and staff management for assigned stores.",
            "Cashier: Limited to POS operations and returns for their assigned store.",
            "Each user is assigned to a specific store (except Admins who see all stores).",
            "Role changes take effect immediately upon user re-login.",
            "Two-factor authentication is available for additional security.",
        ],
    },
    {
        title: "Multi-Store Basics",
        icon: Store,
        description: "Operating multiple locations",
        content: [
            "Each store operates independently with its own inventory and staff.",
            "Admins can view consolidated reports across all stores.",
            "Store managers only see data for their assigned location.",
            "Products can be shared across stores or managed separately.",
            "Transfer products between stores with built-in tracking.",
            "Each store has unique settings for taxes, receipts, and operations.",
        ],
    },
];

function DocSectionCard({ section }: { section: DocSection }) {
    const [isOpen, setIsOpen] = useState(false);
    const Icon = section.icon;

    return (
        <Card className="border shadow-sm">
            <CardHeader
                className="cursor-pointer hover:bg-gray-50 transition-colors"
                onClick={() => setIsOpen(!isOpen)}
            >
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center">
                            <Icon className="h-6 w-6 text-primary" />
                        </div>
                        <div>
                            <CardTitle className="text-lg">{section.title}</CardTitle>
                            <p className="text-sm text-gray-500 mt-1">{section.description}</p>
                        </div>
                    </div>
                    {isOpen ? (
                        <ChevronDown className="h-5 w-5 text-gray-400" />
                    ) : (
                        <ChevronRight className="h-5 w-5 text-gray-400" />
                    )}
                </div>
            </CardHeader>
            {isOpen && (
                <CardContent className="pt-0">
                    <div className="border-t pt-4 mt-2">
                        <ul className="space-y-3">
                            {section.content.map((item, index) => (
                                <li key={index} className="flex items-start gap-3 text-gray-600">
                                    <FileText className="h-4 w-4 text-gray-400 mt-1 flex-shrink-0" />
                                    <span>{item}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                </CardContent>
            )}
        </Card>
    );
}

export default function DocumentationPage() {
    return (
        <PublicPageLayout>
            <div className="space-y-12">
                {/* Hero Section */}
                <div className="text-center max-w-3xl mx-auto">
                    <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-6">
                        Everything you need to know about using ChainSync.
                    </h1>
                    <p className="text-xl text-gray-600 leading-relaxed">
                        Our documentation provides detailed guides on system setup, user roles,
                        POS usage, inventory workflows, and integrations.
                    </p>
                </div>

                {/* Description */}
                <div className="max-w-3xl mx-auto">
                    <p className="text-lg text-gray-600 text-center leading-relaxed">
                        Built for both business owners and technical teams.
                    </p>
                </div>

                {/* Documentation Sections */}
                <div className="max-w-3xl mx-auto space-y-4">
                    {docSections.map((section, index) => (
                        <DocSectionCard key={index} section={section} />
                    ))}
                </div>
            </div>
        </PublicPageLayout>
    );
}

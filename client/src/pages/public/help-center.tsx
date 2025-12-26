import { Book, ChevronDown, ChevronRight, HelpCircle, Settings, ShoppingCart, Users } from "lucide-react";
import { useState } from "react";

import PublicPageLayout from "@/components/layout/public-page-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Article {
    title: string;
    icon: React.ElementType;
    steps: string[];
}

const articles: Article[] = [
    {
        title: "How to create your first store",
        icon: Settings,
        steps: [
            "Log in to your ChainSync account",
            "Navigate to Settings from the sidebar",
            "Click 'Add New Store' button",
            "Enter your store name and address",
            "Configure store operating hours",
            "Save your store settings",
        ],
    },
    {
        title: "Adding products to inventory",
        icon: Book,
        steps: [
            "Go to Inventory from the main menu",
            "Click the 'Add Product' button",
            "Enter product name and SKU",
            "Set pricing and cost information",
            "Add initial stock quantity",
            "Optionally add product images",
            "Save the product",
        ],
    },
    {
        title: "Making a sale on POS",
        icon: ShoppingCart,
        steps: [
            "Open the POS screen",
            "Search or scan products to add to cart",
            "Adjust quantities as needed",
            "Select payment method",
            "Process the payment",
            "Print or email receipt to customer",
        ],
    },
    {
        title: "Understanding user roles",
        icon: Users,
        steps: [
            "Admin: Full access to all features and settings",
            "Manager: Inventory management and reporting access",
            "Cashier: POS access and returns processing",
            "Each role has specific permissions",
            "Roles can be assigned in User Management",
        ],
    },
    {
        title: "Viewing analytics reports",
        icon: HelpCircle,
        steps: [
            "Navigate to Analytics from sidebar",
            "Select date range for your report",
            "Choose specific metrics to view",
            "Export reports as needed",
            "Compare performance across periods",
        ],
    },
];

function ArticleCard({ article }: { article: Article }) {
    const [isOpen, setIsOpen] = useState(false);
    const Icon = article.icon;

    return (
        <Card className="border shadow-sm hover:shadow-md transition-shadow">
            <CardHeader
                className="cursor-pointer"
                onClick={() => setIsOpen(!isOpen)}
            >
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                            <Icon className="h-5 w-5 text-primary" />
                        </div>
                        <CardTitle className="text-lg">{article.title}</CardTitle>
                    </div>
                    {isOpen ? (
                        <ChevronDown className="h-5 w-5 text-gray-400" />
                    ) : (
                        <ChevronRight className="h-5 w-5 text-gray-400" />
                    )}
                </div>
            </CardHeader>
            {isOpen && (
                <CardContent>
                    <ol className="space-y-2 ml-2">
                        {article.steps.map((step, index) => (
                            <li key={index} className="flex items-start gap-3 text-gray-600">
                                <span className="flex-shrink-0 w-6 h-6 bg-gray-100 rounded-full flex items-center justify-center text-sm font-medium text-gray-700">
                                    {index + 1}
                                </span>
                                <span className="pt-0.5">{step}</span>
                            </li>
                        ))}
                    </ol>
                </CardContent>
            )}
        </Card>
    );
}

export default function HelpCenterPage() {
    return (
        <PublicPageLayout>
            <div className="space-y-12">
                {/* Hero Section */}
                <div className="text-center max-w-3xl mx-auto">
                    <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-6">
                        Get help when you need it.
                    </h1>
                    <p className="text-xl text-gray-600 leading-relaxed">
                        The ChainSync Help Center contains answers to common questions, setup guides,
                        and best practices to help you get the most out of the platform.
                    </p>
                </div>

                {/* Description */}
                <div className="max-w-3xl mx-auto">
                    <p className="text-lg text-gray-600 text-center leading-relaxed">
                        Whether you&apos;re setting up your first store or managing multiple branches,
                        help is always available.
                    </p>
                </div>

                {/* Articles */}
                <div className="max-w-3xl mx-auto space-y-4">
                    <h2 className="text-2xl font-bold text-gray-900 mb-6">Popular Articles</h2>
                    {articles.map((article, index) => (
                        <ArticleCard key={index} article={article} />
                    ))}
                </div>
            </div>
        </PublicPageLayout>
    );
}

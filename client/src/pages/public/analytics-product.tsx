import { BarChart3, Calendar, Eye, LineChart, TrendingUp } from "lucide-react";

import PublicPageLayout from "@/components/layout/public-page-layout";
import { Card, CardContent } from "@/components/ui/card";

const features = [
    { icon: BarChart3, text: "Sales and revenue reports" },
    { icon: Calendar, text: "Date-range comparisons" },
    { icon: TrendingUp, text: "Branch-level performance" },
    { icon: LineChart, text: "Profit visibility" },
    { icon: Eye, text: "Owner-level oversight" },
];

export default function AnalyticsProductPage() {
    return (
        <PublicPageLayout>
            <div className="space-y-12">
                {/* Hero Section */}
                <div className="text-center max-w-3xl mx-auto">
                    <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-6">
                        Turn daily sales into clear business insight.
                    </h1>
                    <p className="text-xl text-gray-600 leading-relaxed">
                        ChainSync analytics transforms raw sales data into insights you can actually use.
                    </p>
                </div>

                {/* Description */}
                <div className="max-w-3xl mx-auto">
                    <p className="text-lg text-gray-600 text-center leading-relaxed">
                        See what&apos;s selling, what isn&apos;t, how each branch is performing, and where your
                        profit is going — all from one dashboard.
                    </p>
                </div>

                {/* Features Grid */}
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
                    {features.map((feature, index) => (
                        <Card key={index} className="border-0 shadow-md hover:shadow-lg transition-shadow">
                            <CardContent className="p-6">
                                <div className="flex items-start gap-4">
                                    <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center flex-shrink-0">
                                        <feature.icon className="h-5 w-5 text-purple-600" />
                                    </div>
                                    <p className="text-gray-700 font-medium">{feature.text}</p>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>

                {/* Outcome */}
                <div className="bg-gradient-to-r from-purple-50 to-violet-50 rounded-2xl p-8 md:p-12 max-w-4xl mx-auto text-center">
                    <h2 className="text-2xl font-bold text-gray-900 mb-4">Outcome</h2>
                    <p className="text-2xl text-purple-700 font-semibold">
                        Make decisions based on facts, not assumptions.
                    </p>
                </div>
            </div>
        </PublicPageLayout>
    );
}

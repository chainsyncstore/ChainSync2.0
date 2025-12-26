import { BarChart3, Globe, Lock, Package, TrendingUp } from "lucide-react";

import PublicPageLayout from "@/components/layout/public-page-layout";
import { Card, CardContent } from "@/components/ui/card";

const features = [
    { icon: Globe, text: "Centralized control" },
    { icon: Lock, text: "Branch-level permissions" },
    { icon: BarChart3, text: "Consolidated reporting" },
    { icon: Package, text: "Separate inventory tracking per store" },
    { icon: TrendingUp, text: "Scales as your business grows" },
];

export default function MultiStoreProductPage() {
    return (
        <PublicPageLayout>
            <div className="space-y-12">
                {/* Hero Section */}
                <div className="text-center max-w-3xl mx-auto">
                    <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-6">
                        One system. Every branch.
                    </h1>
                    <p className="text-xl text-gray-600 leading-relaxed">
                        Managing multiple stores doesn&apos;t have to mean chaos.
                    </p>
                </div>

                {/* Description */}
                <div className="max-w-3xl mx-auto">
                    <p className="text-lg text-gray-600 text-center leading-relaxed">
                        ChainSync lets you control all your branches from a single dashboard while
                        still giving each location the tools it needs to operate independently.
                    </p>
                </div>

                {/* Features Grid */}
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
                    {features.map((feature, index) => (
                        <Card key={index} className="border-0 shadow-md hover:shadow-lg transition-shadow">
                            <CardContent className="p-6">
                                <div className="flex items-start gap-4">
                                    <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                                        <feature.icon className="h-5 w-5 text-blue-600" />
                                    </div>
                                    <p className="text-gray-700 font-medium">{feature.text}</p>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>

                {/* Outcome */}
                <div className="bg-gradient-to-r from-blue-50 to-sky-50 rounded-2xl p-8 md:p-12 max-w-4xl mx-auto text-center">
                    <h2 className="text-2xl font-bold text-gray-900 mb-4">Outcome</h2>
                    <p className="text-2xl text-blue-700 font-semibold">
                        Grow without losing control.
                    </p>
                </div>
            </div>
        </PublicPageLayout>
    );
}

import { AlertTriangle, BarChart3, Check, Package, Store } from "lucide-react";

import PublicPageLayout from "@/components/layout/public-page-layout";
import { Card, CardContent } from "@/components/ui/card";

const features = [
    { icon: BarChart3, text: "Real-time stock tracking" },
    { icon: AlertTriangle, text: "Low-stock alerts" },
    { icon: Store, text: "Centralized inventory for multi-store businesses" },
    { icon: Check, text: "Reduced losses from errors and shrinkage" },
    { icon: Package, text: "Easy product management" },
];

export default function InventoryManagementPage() {
    return (
        <PublicPageLayout>
            <div className="space-y-12">
                {/* Hero Section */}
                <div className="text-center max-w-3xl mx-auto">
                    <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-6">
                        Know exactly what&apos;s in stock — always.
                    </h1>
                    <p className="text-xl text-gray-600 leading-relaxed">
                        Inventory mistakes cost money. ChainSync gives you real-time visibility
                        into your stock so you can stop guessing and start controlling.
                    </p>
                </div>

                {/* Description */}
                <div className="max-w-3xl mx-auto">
                    <p className="text-lg text-gray-600 text-center leading-relaxed">
                        Track products, monitor stock levels, and receive alerts before items
                        run out — across one store or many.
                    </p>
                </div>

                {/* Features Grid */}
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
                    {features.map((feature, index) => (
                        <Card key={index} className="border-0 shadow-md hover:shadow-lg transition-shadow">
                            <CardContent className="p-6">
                                <div className="flex items-start gap-4">
                                    <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center flex-shrink-0">
                                        <feature.icon className="h-5 w-5 text-green-600" />
                                    </div>
                                    <p className="text-gray-700 font-medium">{feature.text}</p>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>

                {/* Outcome */}
                <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-2xl p-8 md:p-12 max-w-4xl mx-auto text-center">
                    <h2 className="text-2xl font-bold text-gray-900 mb-4">Outcome</h2>
                    <p className="text-2xl text-green-700 font-semibold">
                        Fewer stockouts. Fewer losses. Better planning.
                    </p>
                </div>
            </div>
        </PublicPageLayout>
    );
}

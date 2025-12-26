import { Check, CreditCard, ShieldCheck, Users, Zap } from "lucide-react";

import PublicPageLayout from "@/components/layout/public-page-layout";
import { Card, CardContent } from "@/components/ui/card";

const features = [
    { icon: Zap, text: "Fast, intuitive checkout flow" },
    { icon: CreditCard, text: "Supports cash, transfer, and card payments" },
    { icon: Check, text: "Automatic sales recording" },
    { icon: Users, text: "Role-based access for staff" },
    { icon: ShieldCheck, text: "Works seamlessly with inventory and analytics" },
];

export default function POSSystemPage() {
    return (
        <PublicPageLayout>
            <div className="space-y-12">
                {/* Hero Section */}
                <div className="text-center max-w-3xl mx-auto">
                    <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-6">
                        A POS built for real retail, not theory.
                    </h1>
                    <p className="text-xl text-gray-600 leading-relaxed">
                        ChainSync&apos;s Point of Sale is designed for fast-moving retail environments
                        where accuracy, speed, and accountability matter.
                    </p>
                </div>

                {/* Description */}
                <div className="max-w-3xl mx-auto">
                    <p className="text-lg text-gray-600 text-center leading-relaxed">
                        Process sales in seconds, support multiple payment methods, and track every
                        transaction automatically — even across multiple branches.
                    </p>
                </div>

                {/* Features Grid */}
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
                    {features.map((feature, index) => (
                        <Card key={index} className="border-0 shadow-md hover:shadow-lg transition-shadow">
                            <CardContent className="p-6">
                                <div className="flex items-start gap-4">
                                    <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0">
                                        <feature.icon className="h-5 w-5 text-primary" />
                                    </div>
                                    <p className="text-gray-700 font-medium">{feature.text}</p>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>

                {/* Target Audience */}
                <div className="bg-gradient-to-r from-primary/5 to-blue-50 rounded-2xl p-8 md:p-12 max-w-4xl mx-auto">
                    <h2 className="text-2xl font-bold text-gray-900 mb-4">Who it&apos;s for</h2>
                    <p className="text-lg text-gray-600">
                        Supermarkets, mini-marts, and retail stores that want clarity, not confusion,
                        at the point of sale.
                    </p>
                </div>
            </div>
        </PublicPageLayout>
    );
}

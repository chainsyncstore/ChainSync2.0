import { Eye, Globe, Heart, Lightbulb, Target, Users } from "lucide-react";

import PublicPageLayout from "@/components/layout/public-page-layout";
import { Card, CardContent } from "@/components/ui/card";

const whyWeExist = [
    { icon: Globe, text: "Work the way local stores actually operate" },
    { icon: Target, text: "Scale from one store to many" },
    { icon: Eye, text: "Provide owners with real-time visibility" },
    { icon: Lightbulb, text: "Reduce losses and improve decision-making" },
];

export default function AboutPage() {
    return (
        <PublicPageLayout>
            <div className="space-y-16">
                {/* Hero Section */}
                <div className="text-center max-w-3xl mx-auto">
                    <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-6">
                        Built to give African retailers control.
                    </h1>
                </div>

                {/* Main Narrative */}
                <div className="max-w-3xl mx-auto">
                    <div className="prose prose-lg text-gray-600 space-y-6">
                        <p className="text-xl leading-relaxed">
                            ChainSync was created to solve a simple but costly problem:
                            many retail businesses operate without clear visibility into
                            what&apos;s actually happening in their stores.
                        </p>
                        <p className="leading-relaxed">
                            Sales get recorded manually. Inventory goes missing. Reports don&apos;t
                            tell the full story. Owners are forced to rely on trust instead of data.
                        </p>
                        <p className="text-xl font-semibold text-gray-900">
                            ChainSync changes that.
                        </p>
                        <p className="leading-relaxed">
                            We built a system that brings clarity, accountability, and insight
                            into retail operations — designed specifically for the realities
                            of African businesses.
                        </p>
                    </div>
                </div>

                {/* Why We Exist */}
                <div className="max-w-4xl mx-auto">
                    <div className="bg-gradient-to-r from-primary/5 to-blue-50 rounded-2xl p-8 md:p-12">
                        <h2 className="text-2xl font-bold text-gray-900 mb-6 text-center">
                            Why We Exist
                        </h2>
                        <p className="text-lg text-gray-600 text-center mb-8">
                            Retailers shouldn&apos;t need complex software or foreign systems that
                            don&apos;t understand local workflows.
                        </p>
                        <div className="grid md:grid-cols-2 gap-4">
                            {whyWeExist.map((item, index) => (
                                <Card key={index} className="border-0 shadow-sm bg-white/80">
                                    <CardContent className="p-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0">
                                                <item.icon className="h-5 w-5 text-primary" />
                                            </div>
                                            <p className="text-gray-700 font-medium">{item.text}</p>
                                        </div>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Founder-Led Section */}
                <div className="max-w-3xl mx-auto">
                    <div className="text-center">
                        <div className="w-16 h-16 bg-purple-100 rounded-2xl flex items-center justify-center mx-auto mb-6">
                            <Heart className="h-8 w-8 text-purple-600" />
                        </div>
                        <h2 className="text-2xl font-bold text-gray-900 mb-4">
                            Founder-Led, Product-Driven
                        </h2>
                        <div className="prose prose-lg text-gray-600 mx-auto">
                            <p>
                                ChainSync is founder-led and product-driven.
                            </p>
                            <p>
                                It wasn&apos;t built in a boardroom.
                                It was built by deeply understanding retail operations,
                                operational pain points, and the realities of running stores
                                in competitive markets.
                            </p>
                            <p className="font-semibold text-gray-900">
                                Every feature exists to solve a real problem — not to look impressive.
                            </p>
                        </div>
                    </div>
                </div>

                {/* Vision */}
                <div className="max-w-4xl mx-auto">
                    <div className="bg-gray-900 text-white rounded-2xl p-8 md:p-12 text-center">
                        <div className="w-16 h-16 bg-white/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
                            <Users className="h-8 w-8 text-white" />
                        </div>
                        <h2 className="text-2xl font-bold mb-4">Our Vision</h2>
                        <p className="text-lg text-gray-300 mb-4">
                            We believe modern retail infrastructure should be accessible,
                            reliable, and built with local context in mind.
                        </p>
                        <p className="text-xl font-semibold text-white">
                            ChainSync&apos;s vision is to become the operating system for retail
                            businesses across Africa — helping businesses grow with confidence
                            and control.
                        </p>
                    </div>
                </div>
            </div>
        </PublicPageLayout>
    );
}

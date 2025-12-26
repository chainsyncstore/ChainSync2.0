import { Briefcase, Heart, Mail, Rocket } from "lucide-react";

import PublicPageLayout from "@/components/layout/public-page-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const values = [
    {
        icon: Rocket,
        title: "Move Fast",
        description: "We ship quickly and iterate based on real feedback.",
    },
    {
        icon: Heart,
        title: "Care Deeply",
        description: "We genuinely care about our users&apos; success.",
    },
    {
        icon: Briefcase,
        title: "Stay Practical",
        description: "We build solutions that work in the real world.",
    },
];

export default function CareersPage() {
    return (
        <PublicPageLayout>
            <div className="space-y-12">
                {/* Hero Section */}
                <div className="text-center max-w-3xl mx-auto">
                    <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-6">
                        Build the future of retail with us.
                    </h1>
                    <p className="text-xl text-gray-600 leading-relaxed">
                        ChainSync is growing. While we&apos;re not actively hiring at the moment,
                        we&apos;re always interested in connecting with people passionate about
                        building meaningful products.
                    </p>
                </div>

                {/* Values */}
                <div className="max-w-4xl mx-auto">
                    <h2 className="text-2xl font-bold text-gray-900 mb-6 text-center">
                        What We Value
                    </h2>
                    <div className="grid md:grid-cols-3 gap-6">
                        {values.map((value, index) => {
                            const Icon = value.icon;
                            return (
                                <Card key={index} className="border-0 shadow-md text-center">
                                    <CardContent className="p-6">
                                        <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center mx-auto mb-4">
                                            <Icon className="h-6 w-6 text-primary" />
                                        </div>
                                        <h3 className="text-lg font-semibold text-gray-900 mb-2">
                                            {value.title}
                                        </h3>
                                        <p className="text-gray-600 text-sm">{value.description}</p>
                                    </CardContent>
                                </Card>
                            );
                        })}
                    </div>
                </div>

                {/* Check Back */}
                <div className="max-w-3xl mx-auto">
                    <div className="bg-gradient-to-r from-primary/5 to-blue-50 rounded-2xl p-8 md:p-12 text-center">
                        <h2 className="text-2xl font-bold text-gray-900 mb-4">
                            No Open Positions Right Now
                        </h2>
                        <p className="text-lg text-gray-600 mb-6">
                            Check back soon for opportunities. In the meantime, feel free to
                            introduce yourself.
                        </p>
                        <Button asChild>
                            <a href="mailto:careers@chainsync.store" className="gap-2">
                                <Mail className="h-4 w-4" />
                                Say Hello
                            </a>
                        </Button>
                    </div>
                </div>
            </div>
        </PublicPageLayout>
    );
}

import { FileText, Lock, Shield, UserCheck } from "lucide-react";

import PublicPageLayout from "@/components/layout/public-page-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const sections = [
    {
        icon: FileText,
        title: "Information We Collect",
        content: [
            "Account information (name, email, business details)",
            "Transaction and sales data processed through our platform",
            "Usage data and analytics to improve our services",
            "Device and browser information for security purposes",
        ],
    },
    {
        icon: Shield,
        title: "How We Use Your Data",
        content: [
            "To provide and maintain our services",
            "To process transactions and manage your account",
            "To improve and personalize your experience",
            "To communicate important updates and support",
        ],
    },
    {
        icon: Lock,
        title: "Data Security",
        content: [
            "Industry-standard encryption for data in transit and at rest",
            "Regular security audits and monitoring",
            "Strict access controls and authentication",
            "Secure data centers with redundant backups",
        ],
    },
    {
        icon: UserCheck,
        title: "Your Rights",
        content: [
            "Access and export your data at any time",
            "Request correction of inaccurate information",
            "Delete your account and associated data",
            "Opt out of non-essential communications",
        ],
    },
];

export default function PrivacyPolicyPage() {
    return (
        <PublicPageLayout>
            <div className="space-y-12">
                {/* Hero Section */}
                <div className="text-center max-w-3xl mx-auto">
                    <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-6">
                        Your privacy matters to us.
                    </h1>
                    <p className="text-xl text-gray-600 leading-relaxed">
                        ChainSync is committed to protecting your data and using it responsibly.
                        This policy explains how we collect, use, and safeguard your information.
                    </p>
                </div>

                {/* Last Updated */}
                <div className="max-w-3xl mx-auto text-center">
                    <p className="text-sm text-gray-500">
                        Last updated: December 2024
                    </p>
                </div>

                {/* Privacy Sections */}
                <div className="max-w-3xl mx-auto space-y-6">
                    {sections.map((section, index) => {
                        const Icon = section.icon;
                        return (
                            <Card key={index} className="border shadow-sm">
                                <CardHeader>
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                                            <Icon className="h-5 w-5 text-primary" />
                                        </div>
                                        <CardTitle className="text-lg">{section.title}</CardTitle>
                                    </div>
                                </CardHeader>
                                <CardContent>
                                    <ul className="space-y-2">
                                        {section.content.map((item, itemIndex) => (
                                            <li key={itemIndex} className="flex items-start gap-2 text-gray-600">
                                                <span className="text-primary mt-1">•</span>
                                                <span>{item}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </CardContent>
                            </Card>
                        );
                    })}
                </div>

                {/* Contact for Privacy */}
                <div className="max-w-3xl mx-auto">
                    <div className="bg-gray-50 rounded-2xl p-8 text-center">
                        <h2 className="text-xl font-bold text-gray-900 mb-4">
                            Questions About Privacy?
                        </h2>
                        <p className="text-gray-600 mb-2">
                            If you have questions about this policy or how we handle your data,
                            please contact us.
                        </p>
                        <a
                            href="mailto:privacy@chainsync.store"
                            className="text-primary hover:underline font-medium"
                        >
                            privacy@chainsync.store
                        </a>
                    </div>
                </div>

                {/* Placeholder Notice */}
                <div className="max-w-3xl mx-auto">
                    <p className="text-sm text-gray-500 text-center italic">
                        This is a summary of our privacy practices. A detailed privacy policy
                        document will be published soon.
                    </p>
                </div>
            </div>
        </PublicPageLayout>
    );
}

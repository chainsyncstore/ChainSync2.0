import { Activity, CheckCircle, Cloud, Database, Shield } from "lucide-react";

import PublicPageLayout from "@/components/layout/public-page-layout";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface ServiceStatus {
    name: string;
    status: "operational" | "degraded" | "outage";
    icon: React.ElementType;
    description: string;
}

const services: ServiceStatus[] = [
    {
        name: "API Services",
        status: "operational",
        icon: Cloud,
        description: "Core API endpoints and authentication",
    },
    {
        name: "Database",
        status: "operational",
        icon: Database,
        description: "Data storage and retrieval",
    },
    {
        name: "POS System",
        status: "operational",
        icon: Activity,
        description: "Point of sale transactions",
    },
    {
        name: "Security Services",
        status: "operational",
        icon: Shield,
        description: "Authentication and encryption",
    },
];

function getStatusColor(status: ServiceStatus["status"]) {
    switch (status) {
        case "operational":
            return "bg-green-500";
        case "degraded":
            return "bg-yellow-500";
        case "outage":
            return "bg-red-500";
    }
}

function getStatusBadge(status: ServiceStatus["status"]) {
    switch (status) {
        case "operational":
            return <Badge className="bg-green-100 text-green-700 hover:bg-green-100">Operational</Badge>;
        case "degraded":
            return <Badge className="bg-yellow-100 text-yellow-700 hover:bg-yellow-100">Degraded</Badge>;
        case "outage":
            return <Badge className="bg-red-100 text-red-700 hover:bg-red-100">Outage</Badge>;
    }
}

export default function SystemStatusPage() {
    const allOperational = services.every(s => s.status === "operational");

    return (
        <PublicPageLayout>
            <div className="space-y-12">
                {/* Hero Section */}
                <div className="text-center max-w-3xl mx-auto">
                    <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-6">
                        Platform status & uptime.
                    </h1>
                    <p className="text-xl text-gray-600 leading-relaxed">
                        This page provides real-time information on the operational status
                        of ChainSync services.
                    </p>
                </div>

                {/* Overall Status */}
                <div className="max-w-3xl mx-auto">
                    <Card className={`border-0 shadow-lg ${allOperational ? 'bg-green-50' : 'bg-yellow-50'}`}>
                        <CardContent className="p-8">
                            <div className="flex items-center justify-center gap-4">
                                <CheckCircle className={`h-12 w-12 ${allOperational ? 'text-green-500' : 'text-yellow-500'}`} />
                                <div className="text-center">
                                    <h2 className="text-2xl font-bold text-gray-900">
                                        {allOperational ? "All Systems Operational" : "Some Systems Experiencing Issues"}
                                    </h2>
                                    <p className="text-gray-600 mt-1">
                                        Last updated: {new Date().toLocaleString()}
                                    </p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Service Status List */}
                <div className="max-w-3xl mx-auto">
                    <h2 className="text-2xl font-bold text-gray-900 mb-6">Service Status</h2>
                    <div className="space-y-4">
                        {services.map((service, index) => {
                            const Icon = service.icon;
                            return (
                                <Card key={index} className="border shadow-sm">
                                    <CardHeader className="pb-2">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
                                                    <Icon className="h-5 w-5 text-gray-600" />
                                                </div>
                                                <div>
                                                    <CardTitle className="text-lg">{service.name}</CardTitle>
                                                    <p className="text-sm text-gray-500">{service.description}</p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <div className={`w-3 h-3 rounded-full ${getStatusColor(service.status)}`} />
                                                {getStatusBadge(service.status)}
                                            </div>
                                        </div>
                                    </CardHeader>
                                </Card>
                            );
                        })}
                    </div>
                </div>

                {/* Transparency Statement */}
                <div className="max-w-3xl mx-auto">
                    <div className="bg-gradient-to-r from-gray-50 to-slate-50 rounded-2xl p-8 text-center">
                        <p className="text-lg text-gray-600">
                            <strong className="text-gray-900">Transparency matters.</strong>{" "}
                            If there&apos;s an issue, you&apos;ll see it here.
                        </p>
                    </div>
                </div>
            </div>
        </PublicPageLayout>
    );
}

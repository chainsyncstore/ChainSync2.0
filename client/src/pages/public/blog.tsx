import { ArrowRight, Calendar, Clock, Tag } from "lucide-react";

import PublicPageLayout from "@/components/layout/public-page-layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface BlogPost {
    title: string;
    excerpt: string;
    category: string;
    date: string;
    readTime: string;
}

const blogPosts: BlogPost[] = [
    {
        title: "5 Ways to Reduce Inventory Shrinkage in Your Store",
        excerpt: "Learn practical strategies to minimize stock loss and improve profitability in your retail business.",
        category: "Inventory",
        date: "Coming Soon",
        readTime: "5 min read",
    },
    {
        title: "The Complete Guide to Multi-Store Management",
        excerpt: "How to effectively manage multiple retail locations without losing control of operations.",
        category: "Operations",
        date: "Coming Soon",
        readTime: "8 min read",
    },
    {
        title: "Understanding Your POS Data: A Beginner&apos;s Guide",
        excerpt: "Making sense of transaction data and using it to make better business decisions.",
        category: "Analytics",
        date: "Coming Soon",
        readTime: "6 min read",
    },
];

export default function BlogPage() {
    return (
        <PublicPageLayout>
            <div className="space-y-12">
                {/* Hero Section */}
                <div className="text-center max-w-3xl mx-auto">
                    <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-6">
                        Insights on retail, technology, and growth.
                    </h1>
                    <p className="text-xl text-gray-600 leading-relaxed">
                        The ChainSync blog shares insights on retail operations, business growth,
                        and technology — with a focus on real-world application.
                    </p>
                </div>

                {/* Blog Posts */}
                <div className="max-w-4xl mx-auto">
                    <div className="grid gap-6">
                        {blogPosts.map((post, index) => (
                            <Card key={index} className="border shadow-sm hover:shadow-md transition-shadow group">
                                <CardHeader>
                                    <div className="flex items-start justify-between gap-4">
                                        <div className="space-y-2">
                                            <div className="flex items-center gap-2">
                                                <Badge variant="secondary" className="text-xs">
                                                    <Tag className="h-3 w-3 mr-1" />
                                                    {post.category}
                                                </Badge>
                                                <Badge variant="outline" className="text-xs bg-orange-50 text-orange-600 border-orange-200">
                                                    {post.date}
                                                </Badge>
                                            </div>
                                            <CardTitle className="text-xl group-hover:text-primary transition-colors">
                                                {post.title}
                                            </CardTitle>
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent>
                                    <p className="text-gray-600 mb-4">{post.excerpt}</p>
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-4 text-sm text-gray-500">
                                            <span className="flex items-center gap-1">
                                                <Calendar className="h-4 w-4" />
                                                {post.date}
                                            </span>
                                            <span className="flex items-center gap-1">
                                                <Clock className="h-4 w-4" />
                                                {post.readTime}
                                            </span>
                                        </div>
                                        <Button variant="ghost" size="sm" className="gap-1" disabled>
                                            Read More
                                            <ArrowRight className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                </div>

                {/* Coming Soon Notice */}
                <div className="max-w-3xl mx-auto">
                    <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-2xl p-8 text-center">
                        <h2 className="text-xl font-bold text-gray-900 mb-2">More content coming soon</h2>
                        <p className="text-gray-600">
                            We&apos;re working on creating valuable content to help you succeed.
                            Check back regularly for new articles.
                        </p>
                    </div>
                </div>
            </div>
        </PublicPageLayout>
    );
}

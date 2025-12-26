import { Clock, Mail, MessageSquare, Send } from "lucide-react";
import { useState } from "react";

import PublicPageLayout from "@/components/layout/public-page-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

export default function ContactUsPage() {
    const { toast } = useToast();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [formData, setFormData] = useState({
        name: "",
        email: "",
        subject: "",
        message: "",
    });

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);

        // Simulate form submission
        await new Promise(resolve => setTimeout(resolve, 1000));

        toast({
            title: "Message sent!",
            description: "We&apos;ll get back to you as soon as possible.",
        });

        setFormData({ name: "", email: "", subject: "", message: "" });
        setIsSubmitting(false);
    };

    return (
        <PublicPageLayout>
            <div className="space-y-12">
                {/* Hero Section */}
                <div className="text-center max-w-3xl mx-auto">
                    <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-6">
                        We&apos;re here to help.
                    </h1>
                    <p className="text-xl text-gray-600 leading-relaxed">
                        Have questions? Need help getting started? Want a demo?
                        Reach out to us and a member of the ChainSync team will respond promptly.
                    </p>
                </div>

                <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto">
                    {/* Contact Methods */}
                    <div className="space-y-6">
                        <Card className="border-0 shadow-md">
                            <CardHeader>
                                <div className="flex items-center gap-3">
                                    <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center">
                                        <Mail className="h-6 w-6 text-primary" />
                                    </div>
                                    <div>
                                        <CardTitle className="text-lg">Email Support</CardTitle>
                                        <p className="text-sm text-gray-500">For general inquiries</p>
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent>
                                <a
                                    href="mailto:support@chainsync.store"
                                    className="text-primary hover:underline font-medium"
                                >
                                    support@chainsync.store
                                </a>
                            </CardContent>
                        </Card>

                        <Card className="border-0 shadow-md">
                            <CardHeader>
                                <div className="flex items-center gap-3">
                                    <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
                                        <Clock className="h-6 w-6 text-green-600" />
                                    </div>
                                    <div>
                                        <CardTitle className="text-lg">Support Hours</CardTitle>
                                        <p className="text-sm text-gray-500">When we&apos;re available</p>
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent>
                                <p className="text-gray-700 font-medium">8am – 5pm WAT</p>
                                <p className="text-sm text-gray-500 mt-1">Monday to Friday</p>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Contact Form */}
                    <Card className="border-0 shadow-md">
                        <CardHeader>
                            <div className="flex items-center gap-3">
                                <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center">
                                    <MessageSquare className="h-6 w-6 text-purple-600" />
                                </div>
                                <div>
                                    <CardTitle className="text-lg">Send us a message</CardTitle>
                                    <p className="text-sm text-gray-500">We&apos;ll respond within 24 hours</p>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <form onSubmit={handleSubmit} className="space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="name">Name</Label>
                                        <Input
                                            id="name"
                                            value={formData.name}
                                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                            required
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="email">Email</Label>
                                        <Input
                                            id="email"
                                            type="email"
                                            value={formData.email}
                                            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                            required
                                        />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="subject">Subject</Label>
                                    <Input
                                        id="subject"
                                        value={formData.subject}
                                        onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                                        required
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="message">Message</Label>
                                    <Textarea
                                        id="message"
                                        rows={4}
                                        value={formData.message}
                                        onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                                        required
                                    />
                                </div>
                                <Button type="submit" className="w-full" disabled={isSubmitting}>
                                    {isSubmitting ? (
                                        "Sending..."
                                    ) : (
                                        <>
                                            <Send className="h-4 w-4 mr-2" />
                                            Send Message
                                        </>
                                    )}
                                </Button>
                            </form>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </PublicPageLayout>
    );
}

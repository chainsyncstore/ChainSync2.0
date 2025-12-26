import { ArrowLeft, Store } from "lucide-react";
import { useLocation } from "wouter";

import { Button } from "@/components/ui/button";

interface PublicPageLayoutProps {
    children: React.ReactNode;
    title?: string;
}

export default function PublicPageLayout({ children, title }: PublicPageLayoutProps) {
    const [, setLocation] = useLocation();

    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-slate-50">
            {/* Header */}
            <header className="bg-white shadow-sm border-b sticky top-0 z-50">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex justify-between items-center py-4">
                        <div className="flex items-center space-x-4">
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setLocation("/")}
                                className="flex items-center gap-2 text-gray-600 hover:text-gray-900"
                            >
                                <ArrowLeft className="h-4 w-4" />
                                Back
                            </Button>
                            <div className="h-6 w-px bg-gray-300" />
                            <button
                                onClick={() => setLocation("/")}
                                className="flex items-center space-x-2 hover:opacity-80 transition-opacity"
                            >
                                <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                                    <Store className="text-white text-sm" />
                                </div>
                                <span className="text-xl font-bold text-gray-900">ChainSync</span>
                            </button>
                        </div>
                        <div className="flex items-center space-x-4">
                            <Button variant="ghost" onClick={() => setLocation("/login")}>
                                Sign In
                            </Button>
                            <Button onClick={() => setLocation("/signup")}>
                                Get Started
                            </Button>
                        </div>
                    </div>
                </div>
            </header>

            {/* Page Content */}
            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
                {title && (
                    <div className="mb-8">
                        <h1 className="text-4xl font-bold text-gray-900">{title}</h1>
                    </div>
                )}
                {children}
            </main>

            {/* Footer */}
            <footer className="bg-gray-900 text-white py-12 mt-auto">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="grid md:grid-cols-4 gap-8">
                        <div>
                            <div className="flex items-center space-x-2 mb-4">
                                <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                                    <Store className="text-white text-sm" />
                                </div>
                                <span className="text-xl font-bold">ChainSync</span>
                            </div>
                            <p className="text-gray-400">
                                The complete retail management solution for modern businesses.
                            </p>
                        </div>

                        <div>
                            <h3 className="font-semibold mb-4">Product</h3>
                            <ul className="space-y-2 text-gray-400">
                                <li>
                                    <button onClick={() => setLocation("/product/pos")} className="hover:text-white transition-colors">
                                        POS System
                                    </button>
                                </li>
                                <li>
                                    <button onClick={() => setLocation("/product/inventory")} className="hover:text-white transition-colors">
                                        Inventory Management
                                    </button>
                                </li>
                                <li>
                                    <button onClick={() => setLocation("/product/analytics")} className="hover:text-white transition-colors">
                                        Analytics
                                    </button>
                                </li>
                                <li>
                                    <button onClick={() => setLocation("/product/multi-store")} className="hover:text-white transition-colors">
                                        Multi-Store
                                    </button>
                                </li>
                            </ul>
                        </div>

                        <div>
                            <h3 className="font-semibold mb-4">Support</h3>
                            <ul className="space-y-2 text-gray-400">
                                <li>
                                    <button onClick={() => setLocation("/support/help")} className="hover:text-white transition-colors">
                                        Help Center
                                    </button>
                                </li>
                                <li>
                                    <button onClick={() => setLocation("/support/docs")} className="hover:text-white transition-colors">
                                        Documentation
                                    </button>
                                </li>
                                <li>
                                    <button onClick={() => setLocation("/support/contact")} className="hover:text-white transition-colors">
                                        Contact Us
                                    </button>
                                </li>
                                <li>
                                    <button onClick={() => setLocation("/support/status")} className="hover:text-white transition-colors">
                                        Status
                                    </button>
                                </li>
                            </ul>
                        </div>

                        <div>
                            <h3 className="font-semibold mb-4">Company</h3>
                            <ul className="space-y-2 text-gray-400">
                                <li>
                                    <button onClick={() => setLocation("/company/about")} className="hover:text-white transition-colors">
                                        About
                                    </button>
                                </li>
                                <li>
                                    <button onClick={() => setLocation("/company/blog")} className="hover:text-white transition-colors">
                                        Blog
                                    </button>
                                </li>
                                <li>
                                    <button onClick={() => setLocation("/company/careers")} className="hover:text-white transition-colors">
                                        Careers
                                    </button>
                                </li>
                                <li>
                                    <button onClick={() => setLocation("/company/privacy")} className="hover:text-white transition-colors">
                                        Privacy
                                    </button>
                                </li>
                            </ul>
                        </div>
                    </div>

                    <div className="border-t border-gray-800 mt-8 pt-8 text-center text-gray-400">
                        <p>&copy; {new Date().getFullYear()} ChainSync. All rights reserved.</p>
                    </div>
                </div>
            </footer>
        </div>
    );
}

import { Check, Star, Zap, Shield, Store, ArrowRight, Calendar } from "lucide-react";

import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PRICING_TIERS } from "@/lib/constants";

function formatCurrency(amountMinor: number, currency: "NGN" | "USD") {
  return new Intl.NumberFormat(currency === "NGN" ? "en-NG" : "en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amountMinor / 100);
}

interface PricingTier {
  name: string;
  price: {
    ngn: string;
    usd: string;
  };
  features: readonly string[];
  stores: string;
  popular?: boolean;
}

const pricingTiers: PricingTier[] = [
  {
    name: "Basic",
    price: {
      ngn: formatCurrency(PRICING_TIERS.basic.ngn, "NGN"),
      usd: formatCurrency(PRICING_TIERS.basic.usd, "USD"),
    },
    features: PRICING_TIERS.basic.features,
    stores: "1 store only",
  },
  {
    name: "Pro",
    price: {
      ngn: formatCurrency(PRICING_TIERS.pro.ngn, "NGN"),
      usd: formatCurrency(PRICING_TIERS.pro.usd, "USD"),
    },
    features: PRICING_TIERS.pro.features,
    stores: "Max 10 stores",
    popular: true,
  },
  {
    name: "Enterprise",
    price: {
      ngn: formatCurrency(PRICING_TIERS.enterprise.ngn, "NGN"),
      usd: formatCurrency(PRICING_TIERS.enterprise.usd, "USD"),
    },
    features: PRICING_TIERS.enterprise.features,
    stores: "10+ stores",
  },
];

export default function Landing() {
  const [, setLocation] = useLocation();
  const [userLocation, setUserLocation] = useState<'nigeria' | 'international'>('international');
  const [selectedTier, setSelectedTier] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    // Detect user location (simplified - in production, use a proper geolocation service)
    const detectLocation = async () => {
      try {
        // Use browser's built-in geolocation API instead of external service
        if (navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(
            () => {
              // For now, default to international since we can't easily determine country from coordinates
              // In production, you could use a reverse geocoding service that's allowed in your CSP
              setUserLocation('international');
            },
            (error) => {
              console.warn('Geolocation failed, defaulting to international:', error.message);
              setUserLocation('international');
            },
            { timeout: 5000, enableHighAccuracy: false }
          );
        } else {

          // Fallback: try to detect from timezone (less accurate but no external API needed)
          const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
          if (timezone && timezone.includes('Africa/Lagos')) {
            setUserLocation('nigeria');
          } else {
            setUserLocation('international');
          }
        }
      } catch (error) {
        console.warn('Could not detect location, defaulting to international', error);
        setUserLocation('international');
      }
    };

    void detectLocation();
  }, []);

  const handleSignup = async (tier: string) => {
    setIsLoading(true);
    setSelectedTier(tier);

    // Redirect to signup page with tier selection
    setLocation(`/signup?tier=${tier}&location=${userLocation}`);
  };

  const getPrice = (tier: PricingTier) => {
    return userLocation === 'nigeria' ? tier.price.ngn : tier.price.usd;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-slate-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                <Store className="text-white text-sm" />
              </div>
              <span className="text-xl font-bold text-gray-900">ChainSync</span>
            </div>
            <div className="flex items-center space-x-4">
              <Button variant="ghost" onClick={() => setLocation('/login')}>
                Sign In
              </Button>
              <Button onClick={() => setLocation('/signup')}>
                Get Started
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto text-center">
          <Badge variant="secondary" className="mb-4">
            <Zap className="w-4 h-4 mr-2" />
            AI-Powered Inventory Management
          </Badge>
          <h1 className="text-4xl md:text-6xl font-bold text-gray-900 mb-6">
            Transform Your Business with
            <span className="text-primary block">Smart POS & Analytics</span>
          </h1>
          <p className="text-xl text-gray-600 mb-8 max-w-3xl mx-auto">
            Streamline your retail operations with our comprehensive POS system,
            AI-powered insights, and multi-store management platform.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button size="lg" onClick={() => setLocation('/signup')}>
              Start Free Trial
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
            <Button variant="outline" size="lg">
              Watch Demo
            </Button>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">
              Everything You Need to Scale
            </h2>
            <p className="text-xl text-gray-600">
              Powerful features designed for modern retail businesses
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <div className="text-center">
              <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <Store className="text-primary h-8 w-8" />
              </div>
              <h3 className="text-xl font-semibold mb-2">Multi-Store Management</h3>
              <p className="text-gray-600">
                Manage multiple locations from a single dashboard with real-time synchronization.
              </p>
            </div>

            <div className="text-center">
              <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <Zap className="text-primary h-8 w-8" />
              </div>
              <h3 className="text-xl font-semibold mb-2">AI-Powered Insights</h3>
              <p className="text-gray-600">
                Get intelligent recommendations for inventory, pricing, and business decisions.
              </p>
            </div>

            <div className="text-center">
              <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <Shield className="text-primary h-8 w-8" />
              </div>
              <h3 className="text-xl font-semibold mb-2">Secure & Reliable</h3>
              <p className="text-gray-600">
                Enterprise-grade security with 99.9% uptime and automatic backups.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">
              Simple, Transparent Pricing
            </h2>
            <p className="text-xl text-gray-600 mb-8">
              2-week free trial • No credit card required • Cancel anytime
            </p>

            {/* Location Toggle */}
            <div className="flex items-center justify-center space-x-4 mb-8">
              <span className="text-sm text-gray-600">Pricing for:</span>
              <div className="flex bg-gray-100 rounded-lg p-1">
                <button
                  onClick={() => setUserLocation('nigeria')}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${userLocation === 'nigeria'
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                    }`}
                >
                  Nigeria
                </button>
                <button
                  onClick={() => setUserLocation('international')}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${userLocation === 'international'
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                    }`}
                >
                  International
                </button>
              </div>
            </div>

            <div className="flex items-center justify-center space-x-2 text-sm text-gray-600">
              <Calendar className="h-4 w-4" />
              <span>Enjoy full access for 14 days before billing begins</span>
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {pricingTiers.map((tier) => (
              <Card
                key={tier.name}
                className={`relative ${tier.popular ? 'ring-2 ring-primary shadow-lg' : ''}`}
              >
                {tier.popular && (
                  <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                    <Badge className="bg-primary text-white">
                      <Star className="w-3 h-3 mr-1" />
                      Most Popular
                    </Badge>
                  </div>
                )}

                <CardHeader className="text-center">
                  <CardTitle className="text-2xl">{tier.name}</CardTitle>
                  <div className="mt-4">
                    <div className="text-2xl font-bold text-primary">Free for 14 days</div>
                    <div className="text-lg text-gray-600">
                      <span className="font-semibold">{getPrice(tier)}</span>/month after trial
                    </div>
                  </div>
                  <CardDescription className="text-sm">
                    {tier.stores} • No credit card required to start
                  </CardDescription>
                </CardHeader>

                <CardContent className="space-y-4">
                  <ul className="space-y-3">
                    {tier.features.map((feature) => (
                      <li key={feature} className="flex items-center space-x-3">
                        <Check className="h-4 w-4 text-green-500 flex-shrink-0" />
                        <span className="text-sm text-gray-600">{feature}</span>
                      </li>
                    ))}
                  </ul>

                  <Button
                    className="w-full mt-6"
                    variant={tier.popular ? "default" : "outline"}
                    onClick={() => handleSignup(tier.name.toLowerCase())}
                    disabled={isLoading}
                  >
                    {isLoading && selectedTier === tier.name.toLowerCase()
                      ? "Processing..."
                      : "Start Free Trial"
                    }
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-primary">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl font-bold text-white mb-4">
            Ready to Transform Your Business?
          </h2>
          <p className="text-xl text-primary-100 mb-8">
            Join thousands of businesses already using ChainSync
          </p>
          <Button
            size="lg"
            variant="secondary"
            onClick={() => setLocation('/signup')}
          >
            Get Started Today
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-12">
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
            <p>&copy; 2024 ChainSync. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
} 
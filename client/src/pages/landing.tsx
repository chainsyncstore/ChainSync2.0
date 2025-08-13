import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check, Star, Zap, Shield, Users, Store, ArrowRight, Globe, CreditCard } from "lucide-react";
import { useLocation } from "wouter";
import { PRICING_TIERS } from "@/lib/constants";

interface PricingTier {
  name: string;
  price: {
    ngn: string;
    usd: string;
  };
  features: string[];
  stores: string;
  popular?: boolean;
}

const pricingTiers: PricingTier[] = [
  {
    name: "Basic",
    price: {
      ngn: "₦30,000",
      usd: "$30"
    },
    features: PRICING_TIERS.basic.features,
    stores: "1 store only"
  },
  {
    name: "Pro",
    price: {
      ngn: "₦100,000",
      usd: "$100"
    },
    features: PRICING_TIERS.pro.features,
    stores: "Max 10 stores",
    popular: true
  },
  {
    name: "Enterprise",
    price: {
      ngn: "₦500,000",
      usd: "$500"
    },
    features: PRICING_TIERS.enterprise.features,
    stores: "10+ stores"
  }
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
            (position) => {
              // For now, default to international since we can't easily determine country from coordinates
              // In production, you could use a reverse geocoding service that's allowed in your CSP
              setUserLocation('international');
            },
            (error) => {
              console.log('Geolocation failed, defaulting to international:', error.message);
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
        console.log('Could not detect location, defaulting to international');
        setUserLocation('international');
      }
    };
    
    detectLocation();
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

  const getPaymentProvider = () => {
    return userLocation === 'nigeria' ? 'Paystack' : 'Flutterwave';
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
              2-week free trial • No credit card required
            </p>
            
            {/* Location Toggle */}
            <div className="flex items-center justify-center space-x-4 mb-8">
              <span className="text-sm text-gray-600">Pricing for:</span>
              <div className="flex bg-gray-100 rounded-lg p-1">
                <button
                  onClick={() => setUserLocation('nigeria')}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                    userLocation === 'nigeria'
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Nigeria
                </button>
                <button
                  onClick={() => setUserLocation('international')}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                    userLocation === 'international'
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  International
                </button>
              </div>
            </div>
            
            <div className="flex items-center justify-center space-x-2 text-sm text-gray-600">
              <CreditCard className="h-4 w-4" />
              <span>Powered by {getPaymentProvider()}</span>
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
                    <span className="text-4xl font-bold">{getPrice(tier)}</span>
                    <span className="text-gray-600">/month</span>
                  </div>
                  <CardDescription className="text-sm">
                    {tier.stores}
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
                <li>POS System</li>
                <li>Inventory Management</li>
                <li>Analytics</li>
                <li>Multi-Store</li>
              </ul>
            </div>
            
            <div>
              <h3 className="font-semibold mb-4">Support</h3>
              <ul className="space-y-2 text-gray-400">
                <li>Help Center</li>
                <li>Documentation</li>
                <li>Contact Us</li>
                <li>Status</li>
              </ul>
            </div>
            
            <div>
              <h3 className="font-semibold mb-4">Company</h3>
              <ul className="space-y-2 text-gray-400">
                <li>About</li>
                <li>Blog</li>
                <li>Careers</li>
                <li>Privacy</li>
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
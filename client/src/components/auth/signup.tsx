import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertCircle, UserPlus, Store, CreditCard, Check } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { useLocation } from "wouter";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PasswordStrength } from "@/components/ui/password-strength";
import { PhoneInput } from "@/components/ui/phone-input";
import { apiClient } from "@/lib/api-client";

interface SignupForm {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  companyName: string;
  password: string;
  confirmPassword: string;
  tier: string;
  location: 'nigeria' | 'international';
}

interface PricingTier {
  name: string;
  price: {
    ngn: string;
    usd: string;
  };
  stores: string;
  features: string[];
}

const pricingTiers: PricingTier[] = [
  {
    name: "basic",
    price: {
      ngn: "₦30,000",
      usd: "$30"
    },
    stores: "1 store only",
    features: [
      "1 Store Management",
      "Basic POS System",
      "Inventory Tracking",
      "Sales Reports",
      "Customer Management",
      "Email Support"
    ]
  },
  {
    name: "premium",
    price: {
      ngn: "₦100,000",
      usd: "$100"
    },
    stores: "Max 10 stores",
    features: [
      "Up to 10 Stores",
      "Advanced POS Features",
      "Real-time Analytics",
      "AI-powered Insights",
      "Multi-location Support",
      "Priority Support",
      "Custom Branding",
      "Advanced Reporting"
    ]
  },
  {
    name: "enterprise",
    price: {
      ngn: "₦500,000",
      usd: "$500"
    },
    stores: "10+ stores",
    features: [
      "Unlimited Stores",
      "Custom Integrations",
      "Dedicated Account Manager",
      "White-label Solutions",
      "API Access",
      "24/7 Phone Support",
      "Custom Training",
      "Advanced Security"
    ]
  }
];

export default function Signup() {
  const [, setLocation] = useLocation();
  const [formData, setFormData] = useState<SignupForm>({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    companyName: "",
    password: "",
    confirmPassword: "",
    tier: "basic",
    location: "international"
  });
  
  const [errors, setErrors] = useState<Partial<SignupForm>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [step, setStep] = useState<'form' | 'payment'>('form');
  const [userData, setUserData] = useState<any>(null);

  // Get URL parameters
  const urlParams = new URLSearchParams(window.location.search);
  const tierFromUrl = urlParams.get('tier');
  const locationFromUrl = urlParams.get('location');

  useEffect(() => {
    if (tierFromUrl) {
      setFormData(prev => ({ ...prev, tier: tierFromUrl }));
    }
    if (locationFromUrl) {
      setFormData(prev => ({ ...prev, location: locationFromUrl as 'nigeria' | 'international' }));
    }
  }, [tierFromUrl, locationFromUrl]);

  const validateForm = (): boolean => {
    const newErrors: Partial<SignupForm> = {};

    // First name validation
    if (!formData.firstName.trim()) {
      newErrors.firstName = "First name is required";
    } else if (formData.firstName.length > 100) {
      newErrors.firstName = "First name must be less than 100 characters";
    } else if (!/^[a-zA-Z\s'-]+$/.test(formData.firstName)) {
      newErrors.firstName = "First name can only contain letters, spaces, hyphens, and apostrophes";
    }

    // Last name validation
    if (!formData.lastName.trim()) {
      newErrors.lastName = "Last name is required";
    } else if (formData.lastName.length > 100) {
      newErrors.lastName = "Last name must be less than 100 characters";
    } else if (!/^[a-zA-Z\s'-]+$/.test(formData.lastName)) {
      newErrors.lastName = "Last name can only contain letters, spaces, hyphens, and apostrophes";
    }

    // Email validation
    if (!formData.email.trim()) {
      newErrors.email = "Email is required";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = "Invalid email format";
    } else if (formData.email.length > 255) {
      newErrors.email = "Email must be less than 255 characters";
    }

    // Phone validation - simplified, backend will handle detailed validation
    if (!formData.phone.trim()) {
      newErrors.phone = "Phone number is required";
    } else if (formData.phone.length < 10) {
      newErrors.phone = "Phone number must be at least 10 digits";
    }

    // Company name validation
    if (!formData.companyName.trim()) {
      newErrors.companyName = "Company name is required";
    } else if (formData.companyName.length > 255) {
      newErrors.companyName = "Company name must be less than 255 characters";
    }

    // Password validation - simplified, backend handles detailed validation
    if (!formData.password) {
      newErrors.password = "Password is required";
    } else if (formData.password.length < 8) {
      newErrors.password = "Password must be at least 8 characters";
    } else if (formData.password.length > 128) {
      newErrors.password = "Password must be less than 128 characters";
    }

    // Confirm password validation
    if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = "Passwords do not match";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleInputChange = (field: keyof SignupForm, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: undefined }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    setIsLoading(true);
    
    try {
      const signupData = {
        firstName: formData.firstName,
        lastName: formData.lastName,
        email: formData.email,
        phone: formData.phone,
        companyName: formData.companyName,
        password: formData.password,
        tier: formData.tier,
        location: formData.location
      };
      
      // First, create the user account using API client (includes CSRF token)
      const responseData = await apiClient.post('/auth/signup', signupData);

      // Check if this is resuming an incomplete signup
      if (responseData.isResume) {
        // Pre-fill the form with existing data
        setFormData(prev => ({
          ...prev,
          firstName: responseData.user.firstName || prev.firstName,
          lastName: responseData.user.lastName || prev.lastName,
          tier: responseData.user.tier || prev.tier
        }));
        
        // Show success message
        setErrors({});
        // You could also show a toast notification here
      }

      // Store user data for payment step
      setUserData(responseData.user);

      // Move to payment step
      setStep('payment');
    } catch (error: any) {
      console.error('Signup error:', error);
      
      if (error.response?.status === 400 && error.response?.data?.message === "User with this email already exists") {
        setErrors({ email: 'An account with this email already exists. Please try logging in instead.' });
      } else if (error.response?.status === 500) {
        setErrors({ email: 'Server error. Please try again later or contact support.' });
      } else if (error.message) {
        setErrors({ email: error.message });
      } else {
        // Generic error message for security
        setErrors({ email: 'Account creation failed. Please try again or contact support.' });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handlePayment = async () => {
    setIsLoading(true);
    
    try {
      const paymentProvider = formData.location === 'nigeria' ? 'paystack' : 'flutterwave';
      const selectedTier = pricingTiers.find(t => t.name === formData.tier);
      const amount = formData.location === 'nigeria' 
        ? selectedTier?.price.ngn.replace('₦', '').replace(',', '')
        : selectedTier?.price.usd.replace('$', '');

      const paymentData = await apiClient.post('/payment/initialize', {
        email: formData.email,
        amount: amount,
        currency: formData.location === 'nigeria' ? 'NGN' : 'USD',
        provider: paymentProvider,
        tier: formData.tier,
        userId: userData?.id, // Pass user ID for signup completion tracking
        metadata: {
          firstName: formData.firstName,
          lastName: formData.lastName,
          companyName: formData.companyName,
          phone: formData.phone
        }
      });
      
      // Store user ID for signup completion
      if (userData?.id) {
        localStorage.setItem('pendingSignupUserId', userData.id);
      }
      
      // Redirect to payment gateway
      if (paymentProvider === 'paystack') {
        window.location.href = paymentData.authorization_url;
      } else {
        // Flutterwave
        window.location.href = paymentData.link;
      }
    } catch (error) {
      setErrors({ email: 'Payment initialization failed. Please try again.' });
    } finally {
      setIsLoading(false);
    }
  };

  const selectedTier = pricingTiers.find(t => t.name === formData.tier);
  const getPrice = () => {
    return formData.location === 'nigeria' ? selectedTier?.price.ngn : selectedTier?.price.usd;
  };

  const getPaymentProvider = () => {
    return formData.location === 'nigeria' ? 'Paystack' : 'Flutterwave';
  };

  // Function to complete signup after successful payment
  const completeSignup = async (userId: string) => {
    try {
      await apiClient.post('/auth/complete-signup', { userId });
      localStorage.removeItem('pendingSignupUserId');
      // Redirect to success page or dashboard
      window.location.href = '/dashboard';
    } catch (error) {
      console.error('Failed to complete signup:', error);
      // Handle error - maybe show a message to contact support
    }
  };

  // Check for pending signup completion on component mount
  React.useEffect(() => {
    const pendingUserId = localStorage.getItem('pendingSignupUserId');
    if (pendingUserId) {
      // Complete the signup
      completeSignup(pendingUserId);
    }
  }, []);

  if (step === 'payment') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-slate-50 p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="space-y-1 text-center">
            <div className="w-12 h-12 bg-primary rounded-lg flex items-center justify-center mx-auto mb-4">
              <CreditCard className="text-white text-xl" />
            </div>
            <CardTitle className="text-2xl font-bold">Complete Your Subscription</CardTitle>
            <CardDescription>
              You're almost there! Complete your payment to start your free trial.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Subscription Summary */}
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="flex justify-between items-center mb-2">
                <span className="font-medium">Plan:</span>
                <span className="text-primary font-semibold capitalize">{formData.tier}</span>
              </div>
              <div className="flex justify-between items-center mb-2">
                <span className="font-medium">Price:</span>
                <span className="font-semibold">{getPrice()}/month</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="font-medium">Payment:</span>
                <span className="text-sm text-gray-600">{getPaymentProvider()}</span>
              </div>
            </div>

            {/* Features */}
            <div>
              <h4 className="font-medium mb-3">What's included:</h4>
              <ul className="space-y-2">
                {selectedTier?.features.slice(0, 4).map((feature) => (
                  <li key={feature} className="flex items-center space-x-2">
                    <Check className="h-4 w-4 text-green-500" />
                    <span className="text-sm text-gray-600">{feature}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p className="text-sm text-blue-800">
                <strong>Free Trial:</strong> Start with a 2-week free trial. No charges until your trial ends.
              </p>
            </div>

            <Button
              onClick={handlePayment}
              className="w-full"
              disabled={isLoading}
            >
              {isLoading ? "Processing..." : `Pay with ${getPaymentProvider()}`}
            </Button>

            <Button
              variant="outline"
              onClick={() => setStep('form')}
              className="w-full"
            >
              Back to Form
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-slate-50 p-4">
      <Card className="w-full max-w-2xl">
        <CardHeader className="space-y-1 text-center">
          <div className="w-12 h-12 bg-primary rounded-lg flex items-center justify-center mx-auto mb-4">
            <UserPlus className="text-white text-xl" />
          </div>
          <CardTitle className="text-2xl font-bold">Create Your ChainSync Account</CardTitle>
          <CardDescription>
            Start your 2-week free trial. No credit card required to start.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {errors.email && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{errors.email}</AlertDescription>
            </Alert>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Personal Information */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="firstName">First Name *</Label>
                <Input
                  id="firstName"
                  type="text"
                  value={formData.firstName}
                  onChange={(e) => handleInputChange('firstName', e.target.value)}
                  required
                  disabled={isLoading}
                />
                {errors.firstName && (
                  <p className="text-sm text-red-500">{errors.firstName}</p>
                )}
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="lastName">Last Name *</Label>
                <Input
                  id="lastName"
                  type="text"
                  value={formData.lastName}
                  onChange={(e) => handleInputChange('lastName', e.target.value)}
                  required
                  disabled={isLoading}
                />
                {errors.lastName && (
                  <p className="text-sm text-red-500">{errors.lastName}</p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email Address *</Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => handleInputChange('email', e.target.value)}
                required
                disabled={isLoading}
              />
              {errors.email && (
                <p className="text-sm text-red-500">{errors.email}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">Phone Number *</Label>
              <PhoneInput
                id="phone"
                value={formData.phone}
                onChange={(value) => handleInputChange('phone', value)}
                disabled={isLoading}
                required
              />
              <p className="text-sm text-gray-500">
                Include your country code (e.g., +234 801 234 5678 for Nigeria)
              </p>
              {errors.phone && (
                <p className="text-sm text-red-500">{errors.phone}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="companyName">Company Name *</Label>
              <Input
                id="companyName"
                type="text"
                value={formData.companyName}
                onChange={(e) => handleInputChange('companyName', e.target.value)}
                required
                disabled={isLoading}
              />
              {errors.companyName && (
                <p className="text-sm text-red-500">{errors.companyName}</p>
              )}
            </div>

            {/* Subscription Tier Selection */}
            <div className="space-y-2">
              <Label>Subscription Plan *</Label>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {pricingTiers.map((tier) => (
                  <div
                    key={tier.name}
                    className={`border rounded-lg p-3 cursor-pointer transition-colors ${
                      formData.tier === tier.name
                        ? 'border-primary bg-primary/5'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                    onClick={() => handleInputChange('tier', tier.name)}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium capitalize">{tier.name}</span>
                      {formData.tier === tier.name && (
                        <Check className="h-4 w-4 text-primary" />
                      )}
                    </div>
                    <div className="text-sm text-gray-600 mb-1">
                      {formData.location === 'nigeria' ? tier.price.ngn : tier.price.usd}/month
                    </div>
                    <div className="text-xs text-gray-500">{tier.stores}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Location Selection */}
            <div className="space-y-2">
              <Label>Location *</Label>
              <div className="flex bg-gray-100 rounded-lg p-1 w-fit">
                <button
                  type="button"
                  onClick={() => handleInputChange('location', 'nigeria')}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                    formData.location === 'nigeria'
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Nigeria
                </button>
                <button
                  type="button"
                  onClick={() => handleInputChange('location', 'international')}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                    formData.location === 'international'
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  International
                </button>
              </div>
            </div>

            {/* Password */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="password">Password *</Label>
                <Input
                  id="password"
                  type="password"
                  value={formData.password}
                  onChange={(e) => handleInputChange('password', e.target.value)}
                  required
                  disabled={isLoading}
                />
                {errors.password && (
                  <p className="text-sm text-red-500">{errors.password}</p>
                )}
                <PasswordStrength password={formData.password} />
                
                {/* Test: Simple password strength display without zxcvbn */}
                {/* {formData.password && (
                  <div className="text-sm text-gray-600">
                    <p>Password length: {formData.password.length} characters</p>
                    <p>Strength: {formData.password.length >= 8 ? 'Good' : 'Too short'}</p>
                  </div>
                )} */}
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm Password *</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  value={formData.confirmPassword}
                  onChange={(e) => handleInputChange('confirmPassword', e.target.value)}
                  required
                  disabled={isLoading}
                />
                {errors.confirmPassword && (
                  <p className="text-sm text-red-500">{errors.confirmPassword}</p>
                )}
              </div>
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={isLoading}
            >
              {isLoading ? "Creating Account..." : "Create Account & Continue"}
            </Button>
          </form>

          <div className="text-center text-sm text-gray-600">
            Already have an account?{" "}
            <button
              onClick={() => setLocation('/login')}
              className="text-primary hover:underline"
            >
              Sign in
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
} 
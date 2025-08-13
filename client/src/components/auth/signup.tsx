import React, { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
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
import { ErrorBoundary } from "@/components/error-boundary";

// Zod schema for form validation
const signupSchema = z.object({
  firstName: z.string()
    .min(1, "First name is required")
    .max(100, "First name must be less than 100 characters")
    .regex(/^[a-zA-Z\s'-]+$/, "First name can only contain letters, spaces, hyphens, and apostrophes"),
  lastName: z.string()
    .min(1, "Last name is required")
    .max(100, "Last name must be less than 100 characters")
    .regex(/^[a-zA-Z\s'-]+$/, "Last name can only contain letters, spaces, hyphens, and apostrophes"),
  email: z.string()
    .min(1, "Email is required")
    .email("Invalid email format")
    .max(255, "Email must be less than 255 characters"),
  phone: z.string()
    .min(1, "Phone number is required")
    .regex(/^\+[1-9]\d{1,14}$/, "Phone number must be in E.164 format (e.g., +1234567890)"),
  companyName: z.string()
    .min(1, "Company name is required")
    .max(255, "Company name must be less than 255 characters"),
  password: z.string()
    .min(8, "Password must be at least 8 characters")
    .max(128, "Password must be less than 128 characters"),
  confirmPassword: z.string()
    .min(1, "Please confirm your password"),
  tier: z.enum(["basic", "pro", "enterprise"]),
  location: z.enum(["nigeria", "international"])
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"]
});

type SignupFormData = z.infer<typeof signupSchema>;

import { PRICING_TIERS, VALID_TIERS, VALID_LOCATIONS, PHONE_REGEX } from '../../lib/constants';
import { validatePaymentUrl, generateRecaptchaToken } from '../../lib/security';

interface PricingTier {
  name: string;
  price: {
    ngn: string;
    usd: string;
  };
  stores: string;
  features: string[];
}

// Convert numeric pricing to display format
const pricingTiers: PricingTier[] = [
  {
    name: "basic",
    price: {
      ngn: "₦30,000",
      usd: "$30"
    },
    stores: "1 store only",
    features: PRICING_TIERS.basic.features
  },
  {
    name: "pro",
    price: {
      ngn: "₦100,000",
      usd: "$100"
    },
    stores: "Max 10 stores",
    features: PRICING_TIERS.pro.features
  },
  {
    name: "enterprise",
    price: {
      ngn: "₦500,000",
      usd: "$500"
    },
    stores: "10+ stores",
    features: PRICING_TIERS.enterprise.features
  }
];

function SignupForm() {
  const [, setLocation] = useLocation();
  const [isLoading, setIsLoading] = useState(false);
  const [step, setStep] = useState<'form' | 'payment'>('form');
  const [userData, setUserData] = useState<any>(null);
  const [generalError, setGeneralError] = useState<string>('');

  // Get URL parameters and validate them before setting form defaults
  const urlParams = new URLSearchParams(window.location.search);
  const tierFromUrl = urlParams.get('tier');
  const locationFromUrl = urlParams.get('location');

  // Initialize form with react-hook-form
  const {
    register,
    handleSubmit,
    formState: { errors, isValid, isDirty },
    setValue,
    watch,
    trigger,
    clearErrors,
    setError,
    getValues
  } = useForm<SignupFormData>({
    resolver: zodResolver(signupSchema),
    mode: "onChange", // Validate on change for better UX
    defaultValues: {
      firstName: "",
      lastName: "",
      email: "",
      phone: "",
      companyName: "",
      password: "",
      confirmPassword: "",
      tier: (tierFromUrl && VALID_TIERS.includes(tierFromUrl)) ? tierFromUrl as "basic" | "pro" | "enterprise" : "basic",
      location: (locationFromUrl && VALID_LOCATIONS.includes(locationFromUrl as 'nigeria' | 'international')) 
        ? locationFromUrl as 'nigeria' | 'international' 
        : 'international'
    }
  });

  // Watch form values for real-time updates
  const watchedValues = watch();

  // Handle input changes with proper error clearing
  const handleInputChange = async (field: keyof SignupFormData, value: string) => {
    setValue(field, value, { shouldValidate: false }); // Set value without immediate validation
    
    // Clear error for this field only after setting the value
    if (errors[field]) {
      clearErrors(field);
    }
    
    // Trigger validation for this field after a short delay to prevent race conditions
    setTimeout(() => {
      trigger(field);
    }, 100);
  };

  // Handle form submission
  const onSubmit = async (data: SignupFormData) => {
    if (!isValid) {
      return;
    }

    setIsLoading(true);
    setGeneralError('');
    
    try {
      // Generate reCAPTCHA token for bot protection
      const recaptchaToken = await generateRecaptchaToken();
      
      const signupData = {
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        phone: data.phone,
        companyName: data.companyName,
        password: data.password,
        tier: data.tier,
        location: data.location,
        recaptchaToken
      };
      
      // Create the user account using API client (includes CSRF token)
      const responseData = await apiClient.post('/auth/signup', signupData);

      // Check if this is resuming an incomplete signup
      if (responseData.isResume) {
        // Pre-fill the form with existing data
        setValue('firstName', responseData.user.firstName || data.firstName);
        setValue('lastName', responseData.user.lastName || data.lastName);
        setValue('tier', responseData.user.tier || data.tier);
        
        // Clear any existing errors
        clearErrors();
      }

      // Store user data for payment step
      setUserData(responseData.user);

      // Move to payment step
      setStep('payment');
    } catch (error: any) {
      console.error('Signup error:', error);
      
      // Handle specific error cases
      if (error.code === 'DUPLICATE_EMAIL' || error.message?.includes('already registered')) {
        setGeneralError('Email is already registered, please check details and try again.');
      } else if (error.code === 'NETWORK_ERROR' || error.message?.includes('Connection failed')) {
        setGeneralError('Connection failed. Please check your internet connection and try again.');
      } else if (error.code === 'VALIDATION_ERROR') {
        setGeneralError('Please check your input details and try again.');
      } else if (error.code === 'RATE_LIMIT_EXCEEDED') {
        setGeneralError('Too many signup attempts. Please wait a moment and try again.');
      } else {
        // Generic error for other cases
        setGeneralError('Signup failed. Please try again or contact support if the problem persists.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handlePayment = async () => {
    const data = getValues();
    setIsLoading(true);
    setGeneralError('');
    
    try {
      const paymentProvider = data.location === 'nigeria' ? 'paystack' : 'flutterwave';
      const selectedTier = pricingTiers.find(t => t.name === data.tier);
      
      // Use numeric pricing from constants instead of parsing strings
      const amount = data.location === 'nigeria' 
        ? PRICING_TIERS[data.tier as keyof typeof PRICING_TIERS]?.ngn
        : PRICING_TIERS[data.tier as keyof typeof PRICING_TIERS]?.usd;

      if (!amount) {
        throw new Error('Invalid pricing tier selected');
      }

      const paymentData = await apiClient.post('/payment/initialize', {
        email: data.email,
        currency: data.location === 'nigeria' ? 'NGN' : 'USD',
        provider: paymentProvider,
        tier: data.tier,
        userId: userData?.id,
        metadata: {
          firstName: data.firstName,
          lastName: data.lastName,
          companyName: data.companyName,
          phone: data.phone
        }
      });
      
      // Validate payment URL before redirecting for security
      let paymentUrl: string;
      if (paymentProvider === 'paystack') {
        paymentUrl = paymentData.authorization_url;
      } else {
        // Flutterwave
        paymentUrl = paymentData.link;
      }

      // Security: Validate that the payment URL is from an expected provider domain
      if (!validatePaymentUrl(paymentUrl, paymentProvider)) {
        throw new Error('Invalid payment provider URL detected');
      }
      
      // Redirect to payment gateway
      window.location.href = paymentUrl;
    } catch (error) {
      console.error('Payment error:', error);
      setGeneralError('Payment initialization failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const selectedTier = pricingTiers.find(t => t.name === watchedValues.tier);
  const getPrice = () => {
    return watchedValues.location === 'nigeria' ? selectedTier?.price.ngn : selectedTier?.price.usd;
  };

  const getPaymentProvider = () => {
    return watchedValues.location === 'nigeria' ? 'Paystack' : 'Flutterwave';
  };

  // Function to complete signup after successful payment
  const completeSignup = async (userId: string) => {
    try {
      await apiClient.post('/auth/complete-signup', { userId });
      // Cookie is automatically cleared by the server
      // Redirect to success page or dashboard
      window.location.href = '/dashboard';
    } catch (error) {
      console.error('Failed to complete signup:', error);
      // Handle error - maybe show a message to contact support
    }
  };

  // Check for pending signup completion on component mount
  React.useEffect(() => {
    const checkPendingSignup = async () => {
      try {
        const response = await apiClient.get('/auth/pending-signup');
        if (response.pendingUserId) {
          // Complete the signup
          completeSignup(response.pendingUserId);
        }
      } catch (error) {
        console.error('Failed to check pending signup:', error);
        // Continue with normal signup flow
      }
    };
    
    checkPendingSignup();
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
                <span className="text-primary font-semibold capitalize">{watchedValues.tier}</span>
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
          {generalError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{generalError}</AlertDescription>
            </Alert>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {/* Personal Information */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="firstName">First Name *</Label>
                <Input
                  id="firstName"
                  type="text"
                  {...register('firstName')}
                  onChange={(e) => handleInputChange('firstName', e.target.value)}
                  required
                  disabled={isLoading}
                />
                {errors.firstName && (
                  <p className="text-sm text-red-500">{errors.firstName.message}</p>
                )}
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="lastName">Last Name *</Label>
                <Input
                  id="lastName"
                  type="text"
                  {...register('lastName')}
                  onChange={(e) => handleInputChange('lastName', e.target.value)}
                  required
                  disabled={isLoading}
                />
                {errors.lastName && (
                  <p className="text-sm text-red-500">{errors.lastName.message}</p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email Address *</Label>
              <Input
                id="email"
                type="email"
                {...register('email')}
                onChange={(e) => handleInputChange('email', e.target.value)}
                required
                disabled={isLoading}
              />
              {errors.email && (
                <p className="text-sm text-red-500">{errors.email.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">Phone Number *</Label>
              <PhoneInput
                id="phone"
                value={watchedValues.phone}
                onChange={(value) => handleInputChange('phone', value)}
                disabled={isLoading}
                required
              />
              <p className="text-sm text-gray-500">
                Include your country code (e.g., +234 801 234 5678 for Nigeria)
              </p>
              {errors.phone && (
                <p className="text-sm text-red-500">{errors.phone.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="companyName">Company Name *</Label>
              <Input
                id="companyName"
                type="text"
                {...register('companyName')}
                onChange={(e) => handleInputChange('companyName', e.target.value)}
                required
                disabled={isLoading}
              />
              {errors.companyName && (
                <p className="text-sm text-red-500">{errors.companyName.message}</p>
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
                      watchedValues.tier === tier.name
                        ? 'border-primary bg-primary/5'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                    onClick={() => handleInputChange('tier', tier.name)}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium capitalize">{tier.name}</span>
                      {watchedValues.tier === tier.name && (
                        <Check className="h-4 w-4 text-primary" />
                      )}
                    </div>
                    <div className="text-sm text-gray-600 mb-1">
                      {watchedValues.location === 'nigeria' ? tier.price.ngn : tier.price.usd}/month
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
                    watchedValues.location === 'nigeria'
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
                    watchedValues.location === 'international'
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
                  {...register('password')}
                  onChange={(e) => handleInputChange('password', e.target.value)}
                  required
                  disabled={isLoading}
                />
                {errors.password && (
                  <p className="text-sm text-red-500">{errors.password.message}</p>
                )}
                <PasswordStrength password={watchedValues.password} />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm Password *</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  {...register('confirmPassword')}
                  onChange={(e) => handleInputChange('confirmPassword', e.target.value)}
                  required
                  disabled={isLoading}
                />
                {errors.confirmPassword && (
                  <p className="text-sm text-red-500">{errors.confirmPassword.message}</p>
                )}
              </div>
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={isLoading || !isValid}
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

// Wrap the component with error boundary
export default function Signup() {
  return (
    <ErrorBoundary
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-slate-50 p-4">
          <Card className="w-full max-w-md">
            <CardHeader className="text-center">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertCircle className="h-8 w-8 text-red-600" />
              </div>
              <CardTitle className="text-xl font-semibold text-gray-900">
                Something went wrong
              </CardTitle>
              <CardDescription className="text-gray-600">
                We encountered an unexpected error while loading the signup form. Please refresh the page or try again later.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-3">
                <Button 
                  onClick={() => window.location.reload()}
                  className="flex-1"
                  variant="default"
                >
                  Refresh Page
                </Button>
                <Button 
                  onClick={() => window.location.href = '/'}
                  className="flex-1"
                  variant="outline"
                >
                  Go Home
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      }
    >
      <SignupForm />
    </ErrorBoundary>
  );
} 
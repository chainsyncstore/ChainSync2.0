import React, { useEffect, useState } from "react";
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
import { useAuth } from "@/hooks/use-auth";

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
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?])/, "Password must contain at least one lowercase letter, one uppercase letter, one number, and one special character")
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
  upfrontFee: {
    ngn: string;
    usd: string;
  };
  stores: string;
  features: string[];
}

// Normalize incoming tier names (handles legacy values like "premium")
function normalizeTier(tier: string | undefined | null): "basic" | "pro" | "enterprise" {
  const value = (tier || "").toString().toLowerCase();
  if (value === "premium") return "pro"; // legacy mapping
  if (value === "basic" || value === "pro" || value === "enterprise") return value;
  return "basic";
}

// Convert numeric pricing to display format with upfront fees
const pricingTiers: PricingTier[] = [
  {
    name: "basic",
    price: {
      ngn: "₦30,000",
      usd: "$30"
    },
    upfrontFee: {
      ngn: "₦1,000",
      usd: "$1"
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
    name: "pro",
    price: {
      ngn: "₦100,000",
      usd: "$100"
    },
    upfrontFee: {
      ngn: "₦1,000",
      usd: "$1"
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
    upfrontFee: {
      ngn: "₦1,000",
      usd: "$1"
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

function SignupForm() {
  const { login } = useAuth();
  const [, setLocation] = useLocation();
  const [isLoading, setIsLoading] = useState(false);
  const [step, setStep] = useState<'form' | 'payment'>('form');
  const [userData, setUserData] = useState<any>(null);
  const [generalError, setGeneralError] = useState<string>('');
  const [showStrength, setShowStrength] = useState(false);

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
      tier: normalizeTier(tierFromUrl),
      location: (locationFromUrl && VALID_LOCATIONS.includes(locationFromUrl as 'nigeria' | 'international')) 
        ? locationFromUrl as 'nigeria' | 'international' 
        : 'international'
    }
  });

  // Watch form values for real-time updates
  const watchedValues = watch();

  // Debug form values on mount and changes
  useEffect(() => {
    console.log('Form values changed:', watchedValues);
    console.log('Current tier:', watchedValues.tier);
    console.log('Current location:', watchedValues.location);
  }, [watchedValues]);

  // Ensure form is properly initialized with default values
  useEffect(() => {
    console.log('Component mounted, setting default values...');
    console.log('URL params - tier:', tierFromUrl, 'location:', locationFromUrl);
    
    // Set default values if they're not already set
    if (!watchedValues.tier) {
      const defaultTier = normalizeTier(tierFromUrl);
      console.log('Setting default tier to:', defaultTier);
      setValue('tier', defaultTier);
    } else {
      // Normalize any legacy tier already present (e.g., from resumed signup)
      const normalized = normalizeTier(watchedValues.tier);
      if (normalized !== watchedValues.tier) {
        console.log('Normalizing legacy tier value:', watchedValues.tier, '->', normalized);
        setValue('tier', normalized);
      }
    }
    
    if (!watchedValues.location) {
      const defaultLocation = (locationFromUrl && VALID_LOCATIONS.includes(locationFromUrl as 'nigeria' | 'international')) 
        ? locationFromUrl as 'nigeria' | 'international' 
        : 'international';
      console.log('Setting default location to:', defaultLocation);
      setValue('location', defaultLocation);
    }
  }, []); // Only run on mount

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
    console.log('Form submission started with data:', data);
    console.log('Form validation state:', { isValid, errors });
    
    if (!isValid) {
      console.error('Form validation failed:', errors);
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
      
      console.log('Signup data prepared:', signupData);
      
      // Create the user account using API client (includes CSRF token)
      const responseData: any = await apiClient.post('/auth/signup', signupData);

      // Check if this is resuming an incomplete signup
      if (responseData.isResume) {
        // Pre-fill the form with existing data
        setValue('firstName', responseData.user.firstName || data.firstName);
        setValue('lastName', responseData.user.lastName || data.lastName);
        // Preserve the tier the user just selected; fall back to server value only if missing
        setValue('tier', normalizeTier(data.tier || responseData.user.tier));
        
        // Clear any existing errors
        clearErrors();
      }

      // Log the user in directly
      await login(data.email, data.password);
    } catch (error: any) {
      console.error('Signup error:', error);
      
      // Handle specific error cases
      if (error.message?.includes('reCAPTCHA site key not configured')) {
        setGeneralError('Security verification is not properly configured. Please contact support.');
      } else if (error.message?.includes('Failed to load reCAPTCHA')) {
        setGeneralError('Security verification failed to load. Please refresh the page and try again.');
      } else if (error.code === 'DUPLICATE_EMAIL' || /duplicate|already exists|already registered/i.test(error.message || '')) {
        setGeneralError('User with this credential already exists');
      } else if (error.code === 'NETWORK_ERROR' || error.message?.includes('Connection failed')) {
        setGeneralError('Connection failed. Please check your internet connection and try again.');
      } else if (error.code === 'VALIDATION_ERROR') {
        if (Array.isArray(error.details)) {
          const passwordErrors = error.details
            .filter((d: any) => d.field === 'password' && typeof d.message === 'string')
            .map((d: any) => d.message);
          if (passwordErrors.length) {
            setGeneralError(`Password requirements: ${passwordErrors.join('; ')}`);
          } else {
            setGeneralError('Please check your input details and try again.');
          }
        } else {
          setGeneralError('Please check your input details and try again.');
        }
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
    console.log('Payment process started with form data:', data);
    
    setIsLoading(true);
    setGeneralError('');
    
    try {
      console.log('Starting payment process...', { data });
      
      // Generate captcha token for bot prevention in production
      let recaptchaToken: string | undefined;
      try {
        // Generate token specifically for payment action to satisfy server verification
        recaptchaToken = await generateRecaptchaToken('payment');
      } catch (e) {
        console.warn('Failed to generate reCAPTCHA token (continuing if allowed):', e);
      }
      
      const paymentProvider = data.location === 'nigeria' ? 'paystack' : 'flutterwave';
      const normalizedTier = normalizeTier(data.tier);
      const selectedTier = pricingTiers.find(t => t.name === normalizedTier);
      
      console.log('Payment provider:', paymentProvider);
      console.log('Selected tier:', selectedTier);
      console.log('Tier from data:', data.tier);
      console.log('Location from data:', data.location);
      
      // Use upfront fee from constants instead of monthly amount
      const upfrontFee = data.location === 'nigeria' 
        ? PRICING_TIERS[normalizedTier as keyof typeof PRICING_TIERS]?.upfrontFee.ngn
        : PRICING_TIERS[normalizedTier as keyof typeof PRICING_TIERS]?.upfrontFee.usd;

      console.log('Upfront fee amount:', upfrontFee);

      if (!upfrontFee) {
        throw new Error('Invalid pricing tier selected');
      }

      const paymentRequest = {
        email: userData?.email || data.email,
        amount: upfrontFee, // Use upfront fee instead of monthly amount
        currency: data.location === 'nigeria' ? 'NGN' : 'USD',
        provider: paymentProvider,
        tier: normalizedTier,
        location: data.location,
        userId: userData?.id,
        ...(recaptchaToken ? { recaptchaToken } : {}),
        metadata: {
          firstName: data.firstName,
          lastName: data.lastName,
          companyName: data.companyName,
          phone: data.phone
        }
      };

      console.log('Sending payment request:', paymentRequest);

      // Persist minimal onboarding context locally for callback consumption
      try {
        const onboardingContext = {
          userId: userData?.id || null,
          tier: normalizedTier,
          location: data.location,
          savedAt: Date.now()
        };
        localStorage.setItem('chainsync_onboarding', JSON.stringify(onboardingContext));
      } catch (e) {
        console.warn('Failed to persist onboarding context:', e);
      }

      const paymentData = await apiClient.post('/payment/initialize', paymentRequest);
      
      console.log('Payment response received:', paymentData);
      
      // Persist the payment reference locally in case provider omits it on redirect
      try {
        const referenceCandidate = (paymentData as any)?.reference || (paymentData as any)?.data?.reference;
        if (referenceCandidate) {
          localStorage.setItem('chainsync_payment_reference', String(referenceCandidate));
        }
      } catch {}

      // Validate payment URL before redirecting for security
      // Extract redirect URL robustly for both providers and response shapes
      let paymentUrl: string | undefined;
      if (paymentProvider === 'paystack') {
        paymentUrl = (paymentData as any)?.authorization_url
          || (paymentData as any)?.data?.authorization_url
          || (paymentData as any)?.data?.data?.authorization_url;
        console.log('Paystack payment URL:', paymentUrl);
      } else {
        paymentUrl = (paymentData as any)?.link
          || (paymentData as any)?.data?.link
          || (paymentData as any)?.data?.data?.link;
        console.log('Flutterwave payment URL:', paymentUrl);
      }

      if (!paymentUrl) {
        throw new Error(`No payment URL received from ${paymentProvider}`);
      }

      // Security: Validate that the payment URL is from an expected provider domain
      if (!validatePaymentUrl(paymentUrl, paymentProvider)) {
        throw new Error('Invalid payment provider URL detected');
      }
      
      console.log('Redirecting to payment gateway:', paymentUrl);
      
      // Redirect to payment gateway
      window.location.href = paymentUrl;
    } catch (error: any) {
      console.error('Payment error details:', {
        error,
        message: error.message,
        stack: error.stack,
        response: error.response
      });
      
      let errorMessage = 'Payment initialization failed. Please try again.';
      
      if (error.response?.status === 500) {
        errorMessage = 'Server error during payment initialization. Please contact support.';
      } else if (error.response?.status === 400) {
        errorMessage = error.response.data?.message || 'Invalid payment request. Please check your details.';
      } else if (error.message?.includes('CSRF token')) {
        errorMessage = 'Security token expired. Please refresh the page and try again.';
      } else if (error.message?.includes('Network')) {
        errorMessage = 'Network error. Please check your connection and try again.';
      }
      
      setGeneralError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const selectedTier = pricingTiers.find(t => t.name === watchedValues.tier);
  console.log('Selected tier:', selectedTier, 'for watchedValues.tier:', watchedValues.tier);
  console.log('Available pricing tiers:', pricingTiers.map(t => t.name));
  console.log('Current form values:', watchedValues);
  
  const getPrice = () => {
    if (!selectedTier) {
      console.error('No tier selected. Available tiers:', pricingTiers.map(t => t.name));
      console.error('Current tier value:', watchedValues.tier);
      return null;
    }
    
    const price = watchedValues.location === 'nigeria' ? selectedTier.price.ngn : selectedTier.price.usd;
    console.log('getPrice() called:', { 
      location: watchedValues.location, 
      selectedTier: selectedTier.name, 
      price
    });
    return price;
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
  useEffect(() => {
    const checkPendingSignup = async () => {
      try {
        const response: any = await apiClient.get('/auth/pending-signup');
        if (response.pendingSignupId) {
          // Complete the signup
          completeSignup(response.pendingSignupId);
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
                <span className="font-medium">Upfront Fee:</span>
                <span className="font-semibold text-primary">
                  {selectedTier ? (watchedValues.location === 'nigeria' ? selectedTier.upfrontFee.ngn : selectedTier.upfrontFee.usd) : 'Fee not available'}
                </span>
              </div>
              <div className="flex justify-between items-center mb-2">
                <span className="font-medium">Monthly Price:</span>
                <span className="font-semibold">
                  {selectedTier ? (watchedValues.location === 'nigeria' ? selectedTier.price.ngn : selectedTier.price.usd) : 'Price not available'}/month
                </span>
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

            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
              <p className="text-sm text-yellow-900">
                Verify your email to activate your account and log in.
              </p>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p className="text-sm text-blue-800">
                <strong>Free Trial:</strong> Start with a 2-week free trial. Pay a small upfront fee to access your trial. This fee will be credited toward your first month's subscription.
              </p>
            </div>

            <Button
              onClick={handlePayment}
              className="w-full"
              disabled={isLoading}
            >
              {isLoading ? (
                <div className="flex items-center space-x-2">
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>Processing Payment...</span>
                </div>
              ) : (
                `Pay with ${getPaymentProvider()}`
              )}
            </Button>

            {generalError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{generalError}</AlertDescription>
              </Alert>
            )}

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
            Start your 2-week free trial. Small upfront fee required to access your trial.
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
                  autoComplete="given-name"
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
                  autoComplete="family-name"
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
                autoComplete="email"
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
                autoComplete="organization"
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
                      <div className="font-semibold text-primary">
                        {watchedValues.location === 'nigeria' ? tier.upfrontFee.ngn : tier.upfrontFee.usd} upfront
                      </div>
                      <div className="text-xs text-gray-500">
                        {watchedValues.location === 'nigeria' ? tier.price.ngn : tier.price.usd}/month after trial
                      </div>
                    </div>
                    <div className="text-xs text-gray-500">{tier.stores}</div>
                  </div>
                ))}
              </div>
              {/* Hidden input for form validation */}
              <input type="hidden" {...register('tier')} />
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
              {/* Hidden input for form validation */}
              <input type="hidden" {...register('location')} />
            </div>

            {/* Password */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="password">Password *</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  {...register('password')}
                  onFocus={() => setShowStrength(true)}
                  onChange={(e) => handleInputChange('password', e.target.value)}
                  required
                  disabled={isLoading}
                />
                {errors.password && (
                  <p className="text-sm text-red-500">{errors.password.message}</p>
                )}
                {showStrength && (
                  <PasswordStrength password={watchedValues.password} />
                )}
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm Password *</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  autoComplete="new-password"
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
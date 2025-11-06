import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircle, UserPlus, Check } from "lucide-react";
import React, { useEffect, useState } from "react";

import { useForm } from "react-hook-form";
import { useLocation } from "wouter";
import { z } from "zod";
import { ErrorBoundary } from "@/components/error-boundary";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordStrength } from "@/components/ui/password-strength";
import { PhoneInput } from "@/components/ui/phone-input";
import { apiClient } from "@/lib/api-client";

// Zod schema for form validation
const passwordComplexityRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9])/;

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
    .regex(passwordComplexityRegex, "Password must contain at least one lowercase letter, one uppercase letter, one number, and one special character")
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

import { PRICING_TIERS, VALID_LOCATIONS } from '../../lib/constants';
import { generateRecaptchaToken } from '../../lib/security';

interface PricingTier {
  name: string;
  price: {
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

const tierOrder: Array<keyof typeof PRICING_TIERS> = ["basic", "pro", "enterprise"];

function formatCurrencyFromMinor(amountMinor: number, currency: "NGN" | "USD") {
  return new Intl.NumberFormat(currency === "NGN" ? "en-NG" : "en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amountMinor / 100);
}

const pricingTiers: PricingTier[] = tierOrder.map((tier) => ({
  name: tier,
  price: {
    ngn: formatCurrencyFromMinor(PRICING_TIERS[tier].ngn, "NGN"),
    usd: formatCurrencyFromMinor(PRICING_TIERS[tier].usd, "USD"),
  },
  stores: PRICING_TIERS[tier].stores,
  features: [...PRICING_TIERS[tier].features],
}));

function SignupForm() {
  const [, setLocation] = useLocation();
  const [isLoading, setIsLoading] = useState(false);
  const [generalError, setGeneralError] = useState<string>('');
  const [showStrength, setShowStrength] = useState(false);

  const urlParams = new URLSearchParams(window.location.search);
  const tierFromUrl = urlParams.get('tier');
  const locationFromUrl = urlParams.get('location');

  // Initialize form with react-hook-form
  const {
    register,
    handleSubmit,
    formState: { errors, isValid },
    setValue,
    watch,
    trigger,
    clearErrors,
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

  // Ensure form is properly initialized with default values
  useEffect(() => {
    const currentTier = getValues('tier');
    if (!currentTier) {
      setValue('tier', normalizeTier(tierFromUrl));
    } else {
      const normalizedTier = normalizeTier(currentTier);
      if (normalizedTier !== currentTier) {
        setValue('tier', normalizedTier);
      }
    }

    const currentLocation = getValues('location');
    if (!currentLocation) {
      const defaultLocation = (locationFromUrl && VALID_LOCATIONS.includes(locationFromUrl as 'nigeria' | 'international'))
        ? locationFromUrl as 'nigeria' | 'international'
        : 'international';
      setValue('location', defaultLocation);
    }
  }, [getValues, locationFromUrl, setValue, tierFromUrl]);

  // Handle input changes with proper error clearing
  const handleInputChange = async (field: keyof SignupFormData, value: string) => {
    setValue(field, value, { shouldValidate: false }); // Set value without immediate validation
    
    // Clear error for this field only after setting the value
    if (errors[field]) {
      clearErrors(field);
    }
    
    // Trigger validation for this field after a short delay to prevent race conditions
    setTimeout(() => {
      void trigger(field);
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
      
      await apiClient.post('/auth/signup', signupData);
      clearErrors();
      setGeneralError('');
      setTimeout(() => {
        setLocation(`/verify-email?sent=1&email=${encodeURIComponent(data.email)}`);
      }, 500);
    } catch (error: any) {
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

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-slate-50 p-4">
      <Card className="w-full max-w-2xl">
        <CardHeader className="space-y-1 text-center">
          <div className="w-12 h-12 bg-primary rounded-lg flex items-center justify-center mx-auto mb-4">
            <UserPlus className="text-white text-xl" />
          </div>
          <CardTitle className="text-2xl font-bold">Create Your ChainSync Account</CardTitle>
          <CardDescription>
            Start your 2-week free trial instantly. No payment required today.
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
                    <div className="text-sm text-gray-600">
                      <div className="font-semibold text-primary">
                        Free for 14 days
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
import { AlertCircle, ShieldCheck, Share } from "lucide-react";
import React, { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";

import { ErrorBoundary } from "@/components/error-boundary";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiClient } from "@/lib/api-client";

function SignupVerifyOtpForm() {
  const [, setLocation] = useLocation();
  const [otp, setOtp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResending, setIsResending] = useState(false);

  const email = useMemo(() => {
    if (typeof window === "undefined") {
      return "";
    }
    return new URLSearchParams(window.location.search).get("email") ?? "";
  }, []);

  useEffect(() => {
    if (!email) {
      setLocation("/signup", { replace: true });
    }
  }, [email, setLocation]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!email) {
      setError("Signup session not found. Please start again.");
      return;
    }

    if (!/^\d{6}$/.test(otp)) {
      setError("Enter the 6-digit code that was sent to your email.");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setStatusMessage(null);

    try {
      const response = await apiClient.post<any>("/auth/verify-otp", {
        email,
        otp,
      });

      const redirectPath = response?.redirect || "/analytics";
      setStatusMessage("Success! Redirecting to your dashboard...");

      setTimeout(() => {
        setLocation(redirectPath, { replace: true });
      }, 1200);
    } catch (err: any) {
      const message = err?.message || "Verification failed. Please try again.";
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResend = async () => {
    if (!email) {
      setError("Signup session not found. Please start again.");
      return;
    }

    setIsResending(true);
    setError(null);
    setStatusMessage(null);

    try {
      const response = await apiClient.post<any>("/auth/resend-otp", { email });
      setStatusMessage(response?.message || "A new verification code has been sent to your email.");
    } catch (err: any) {
      const message = err?.message || "Unable to resend code. Please wait a moment and try again.";
      setError(message);
    } finally {
      setIsResending(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-slate-50 p-4">
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center space-y-3">
          <div className="mx-auto h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
            <ShieldCheck className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-2xl font-bold">Verify your signup</CardTitle>
          <CardDescription>
            Enter the six-digit code we just emailed to <strong>{email}</strong> to activate your account.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {statusMessage && !error && (
            <Alert>
              <Share className="h-4 w-4" />
              <AlertDescription>{statusMessage}</AlertDescription>
            </Alert>
          )}

          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700" htmlFor="otp">
                Verification code
              </label>
              <Input
                id="otp"
                inputMode="numeric"
                pattern="\d{6}"
                maxLength={6}
                placeholder="123456"
                value={otp}
                onChange={(event) => setOtp(event.target.value.replace(/[^0-9]/g, ""))}
                autoComplete="one-time-code"
                disabled={isSubmitting}
                required
              />
              <p className="text-xs text-gray-500">
                The code expires in 15 minutes. Check your spam folder if you do not see the email.
              </p>
            </div>

            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? "Verifying…" : "Verify and continue"}
            </Button>
          </form>

          <div className="flex items-center justify-between text-sm text-gray-600">
            <span>Need a new code?</span>
            <Button
              type="button"
              variant="outline"
              onClick={handleResend}
              disabled={isResending || isSubmitting}
            >
              {isResending ? "Sending…" : "Resend code"}
            </Button>
          </div>

          <div className="text-center text-xs text-gray-500">
            If you close this window you can restart the signup process, but you will receive a new code.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function SignupVerifyOtp() {
  return (
    <ErrorBoundary
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-muted/40 p-4">
          <Card className="w-full max-w-md">
            <CardHeader className="text-center space-y-2">
              <AlertCircle className="h-10 w-10 mx-auto text-destructive" />
              <CardTitle>Something went wrong</CardTitle>
              <CardDescription>
                We could not load the verification screen. Please refresh the page or restart the signup process.
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      }
    >
      <SignupVerifyOtpForm />
    </ErrorBoundary>
  );
}

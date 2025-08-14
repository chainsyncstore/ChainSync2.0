import { useEffect, useState } from "react";
import { post } from "@/lib/api-client";
import { PageLoading } from "@/components/ui/loading";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function VerifyEmailPage() {
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState<string>("Verifying your email, please wait...");
  const [email, setEmail] = useState<string>("");
  const [resendMessage, setResendMessage] = useState<string>("");
  const [resending, setResending] = useState<boolean>(false);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get("token");

    async function verify() {
      if (!token) {
        setStatus("error");
        setMessage("Missing verification token.");
        return;
      }
      try {
        await post("/auth/verify-email", { token });
        setStatus("success");
        setMessage("Email verified successfully. Redirecting to login...");
        setTimeout(() => {
          window.location.href = "/login";
        }, 1500);
      } catch (e) {
        setStatus("error");
        setMessage("Invalid or expired verification link.");
      }
    }

    verify();
  }, []);

  if (status === "loading") {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <PageLoading />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="max-w-md w-full">
        <CardHeader>
          <CardTitle>Verify Email</CardTitle>
        </CardHeader>
        <CardContent>
          <p className={status === "error" ? "text-red-600" : "text-green-700"}>{message}</p>
          {status === "error" && (
            <div className="mt-4 flex gap-2">
              <Button onClick={() => (window.location.href = "/login")} variant="secondary">
                Go to Login
              </Button>
              <Button onClick={() => (window.location.href = "/signup")}>
                Create Account
              </Button>
            </div>
          )}
          {status === "error" && (
            <div className="mt-6 space-y-2">
              <p className="text-sm text-muted-foreground">Didn't get the email? Enter your address to resend the verification link.</p>
              <div className="flex gap-2">
                <input
                  type="email"
                  className="flex-1 border rounded px-3 py-2"
                  placeholder="your@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                <Button
                  disabled={resending || !email}
                  onClick={async () => {
                    setResendMessage("");
                    setResending(true);
                    try {
                      const res = await post("/auth/resend-verification", { email });
                      // Standard and legacy formats supported; show success
                      setResendMessage(
                        (res && typeof res === 'object' && 'message' in res && (res as any).message) ||
                        'If an account exists, a verification email has been sent.'
                      );
                    } catch (e) {
                      setResendMessage('Unable to resend verification right now. Please try again later.');
                    } finally {
                      setResending(false);
                    }
                  }}
                >
                  {resending ? 'Sending...' : 'Resend Email'}
                </Button>
              </div>
              {resendMessage && <p className="text-sm">{resendMessage}</p>}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}



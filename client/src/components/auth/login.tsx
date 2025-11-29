import { AlertCircle } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/notice";

// eslint-disable-next-line no-unused-vars
type LoginHandler = (username: string, password: string) => Promise<void>;

interface LoginProps {
  onLogin: LoginHandler;
  onForgotPassword: () => void;
  isLoading: boolean;
  error?: string | null;
}

export default function Login({ onLogin, onForgotPassword, isLoading, error }: LoginProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (username && password) {
      await onLogin(username, password);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-slate-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1 text-center">
          <div className="w-14 h-14 rounded-lg flex items-center justify-center mx-auto mb-4">
            <img
              src="/branding/chainsync-logo-solid.svg"
              alt="ChainSync logo"
              className="w-12 h-12"
            />
          </div>
          <CardTitle className="text-2xl font-bold">ChainSync Login</CardTitle>
          <CardDescription>
            Access your POS and inventory management system
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">Email or Username</Label>
              <Input
                id="username"
                type="text"
                placeholder="Enter your email or username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="email username"
                required
                disabled={isLoading}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
                disabled={isLoading}
              />
            </div>
            
            <Button
              type="submit"
              className="w-full"
              disabled={isLoading || !username || !password}
            >
              {isLoading ? "Signing in..." : "Sign In"}
            </Button>
          </form>
          
          <div className="text-center">
            <Button
              variant="ghost"
              onClick={onForgotPassword}
              className="text-sm text-slate-600 hover:text-slate-900"
            >
              Forgot your password?
            </Button>
          </div>
          
          <div className="text-center text-sm text-slate-600 mt-4">
            <div className="space-y-1">
              <p><strong>Production System</strong></p>
              <p>Please contact your system administrator for login credentials.</p>
              <p className="text-xs text-slate-500">
                For demo access, run the secure seed script and check the console output.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
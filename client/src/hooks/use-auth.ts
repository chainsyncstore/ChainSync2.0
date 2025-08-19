import { useState, useEffect, useCallback } from "react";
import { post } from "@/lib/api-client";
import { User } from "@shared/schema";
import { saveSession, loadSession, clearSession, refreshSession } from "@/lib/utils";

interface AuthState {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

interface AuthActions {
  login: (usernameOrEmail: string, password: string) => Promise<void>;
  logout: () => void;
  error: string | null;
}

export function useAuth(): AuthState & AuthActions {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Auto-refresh session when user is active
  const handleUserActivity = useCallback(() => {
    if (user && (user as any)?.role && ((user as any).role === "manager" || (user as any).role === "cashier")) {
      refreshSession();
    }
  }, [user]);

  useEffect(() => {
    if (user && (user as any)?.role && ((user as any).role === "manager" || (user as any).role === "cashier")) {
      const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];
      const activityHandler = () => {
        handleUserActivity();
      };
      events.forEach(event => {
        document.addEventListener(event, activityHandler, { passive: true });
      });
      const interval = setInterval(handleUserActivity, 30 * 60 * 1000);
      return () => {
        events.forEach(event => {
          document.removeEventListener(event, activityHandler);
        });
        clearInterval(interval);
      };
    }
  }, [user, handleUserActivity]);

  // Check if user is already logged in on mount
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const savedUser = loadSession();
        if (savedUser) {
          setUser(savedUser as any);
        }
        const response = await fetch("/api/auth/me", { credentials: "include" });
        if (response.ok) {
          const payload = await response.json();
          const userData = (payload as any)?.data || payload;
          setUser(userData as any);
          saveSession(userData as any);
          refreshSession();
        } else {
          clearSession();
          setUser(null);
        }
      } catch {
        clearSession();
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    };
    checkAuth();
  }, []);

  const login = async (usernameOrEmail: string, password: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const body: any = usernameOrEmail.includes('@')
        ? { email: usernameOrEmail, password }
        : { username: usernameOrEmail, password };
      const loginResp: any = await post<any>("/auth/login", body);
      if (loginResp?.status === 'otp_required') {
        const otp = window.prompt('Enter 2FA code from your authenticator app');
        if (!otp) {
          setIsLoading(false);
          setError('2FA required');
          return;
        }
        const verifyResp = await post<any>("/auth/2fa/verify", { code: otp });
        if (!verifyResp?.success && !verifyResp?.user) {
          setIsLoading(false);
          setError('Invalid OTP');
          return;
        }
      }
      const me = await fetch("/api/auth/me", { credentials: 'include' });
      if (!me.ok) throw new Error('Failed to fetch user');
      const payload = await me.json();
      const userData = (payload as any)?.data || payload;
      setUser(userData as any);
      saveSession(userData as any);
      const role = (userData as any)?.role || ((userData as any)?.isAdmin ? 'admin' : 'cashier');
      let defaultPath = "/pos";
      if (role === "admin") defaultPath = "/analytics";
      else if (role === "manager") defaultPath = "/inventory";
      window.location.href = defaultPath;
    } catch (err) {
      setError("Login failed. Please check your credentials.");
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    try {
      await post("/auth/logout");
    } catch {}
    setUser(null);
    setError(null);
    clearSession();
    window.location.reload();
  };

  return { user: user as any, isLoading, isAuthenticated: !!user, login, logout, error };
}
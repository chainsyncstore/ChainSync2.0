import { useState, useEffect, useCallback } from "react";
import { post } from "@/lib/api-client";
import { User } from "@shared/schema";
import { saveSession, loadSession, clearSession, refreshSession } from "@/lib/utils";

interface AuthState {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  requiresPasswordChange: boolean;
}

interface AuthActions {
  login: (usernameOrEmail: string, password: string) => Promise<void>;
  logout: () => void;
  error: string | null;
  refreshUser: () => Promise<void>;
}

export function useAuth(): AuthState & AuthActions {
  const [user, setUser] = useState<User | null>(null);
  const [requiresPasswordChange, setRequiresPasswordChange] = useState<boolean>(false);
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
          setRequiresPasswordChange(Boolean((savedUser as any)?.requiresPasswordChange));
        }
        const response = await fetch("/api/auth/me", { credentials: "include", cache: "no-store" as RequestCache });
        if (response.ok) {
          const payload = await response.json();
          const userData = (payload as any)?.data || payload;
          setUser(userData as any);
          setRequiresPasswordChange(Boolean((userData as any)?.requiresPasswordChange));
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

  const refreshUser = useCallback(async () => {
    try {
      const response = await fetch("/api/auth/me", { credentials: "include", cache: "no-store" as RequestCache });
      if (!response.ok) {
        clearSession();
        setUser(null);
        setRequiresPasswordChange(false);
        return;
      }
      const payload = await response.json();
      const userData = (payload as any)?.data || payload;
      setUser(userData as any);
      setRequiresPasswordChange(Boolean((userData as any)?.requiresPasswordChange));
      saveSession(userData as any);
    } catch {
      clearSession();
      setUser(null);
      setRequiresPasswordChange(false);
    }
  }, []);

  const login = async (usernameOrEmail: string, password: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const body: any = usernameOrEmail.includes('@')
        ? { email: usernameOrEmail, password }
        : { username: usernameOrEmail, password };

      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });

      let loginResp: any = null;
      try {
        loginResp = await response.json();
      } catch {
        /* ignore */
      }

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
        loginResp = verifyResp;
      }

      if (!response.ok || loginResp?.status !== 'success') {
        const message = loginResp?.message || 'Login failed. Please check your credentials.';
        throw new Error(message);
      }

      const respUser = (loginResp as any)?.user;
      if (respUser) {
        setUser(respUser as any);
        setRequiresPasswordChange(Boolean((respUser as any)?.requiresPasswordChange));
        saveSession(respUser as any);
        refreshSession();

        if (Boolean((respUser as any)?.requiresPasswordChange)) {
          window.location.href = "/force-password-reset";
          return;
        }

        const role = (respUser as any)?.role || ((respUser as any)?.isAdmin ? 'admin' : 'cashier');
        let defaultPath = "/pos";
        if (role === "admin") defaultPath = "/analytics";
        else if (role === "manager") defaultPath = "/inventory";
        window.location.href = defaultPath;
        return;
      }
      const fetchMe = async (attempt = 1): Promise<Response> => {
        const res = await fetch("/api/auth/me", { credentials: 'include', cache: 'no-store' as RequestCache });
        if (res.ok) return res;
        if (attempt < 3) {
          await new Promise(r => setTimeout(r, attempt === 1 ? 200 : 400));
          return fetchMe(attempt + 1);
        }
        return res;
      };
      const me = await fetchMe();
      if (!me.ok) throw new Error('Failed to fetch user');
      const payload = await me.json();
      const userData = (payload as any)?.data || payload;
      setUser(userData as any);
      setRequiresPasswordChange(Boolean((userData as any)?.requiresPasswordChange));
      saveSession(userData as any);

      if (Boolean((userData as any)?.requiresPasswordChange)) {
        window.location.href = "/force-password-reset";
        return;
      }

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
    // Clear client state and storage first
    setUser(null);
    setError(null);
    clearSession();
    // Navigate to login without hard reload to avoid reusing any cached responses
    if (window.location.pathname !== '/login') {
      window.location.href = '/login';
    } else {
      // If already on login, do a soft reload to clear in-memory state
      window.history.replaceState(null, '', '/login');
    }
  };

  return { user: user as any, isLoading, isAuthenticated: !!user, login, logout, error, requiresPasswordChange, refreshUser } as any;
}
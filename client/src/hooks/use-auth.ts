import { useState, useEffect, useCallback } from "react";
import { post } from "@/lib/api-client";
import { User } from "@shared/schema";
import { saveSession, loadSession, clearSession, refreshSession } from "@/lib/utils";

interface AuthState {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  requiresPasswordChange: boolean;
  twoFactorEnabled: boolean;
}

interface AuthActions {
  login: (usernameOrEmail: string, password: string) => Promise<void>;
  logout: () => void;
  error: string | null;
  refreshUser: () => Promise<void>;
  setupTwoFactor: () => Promise<{ otpauth: string } | null>;
  verifyTwoFactor: (token: string) => Promise<boolean>;
  disableTwoFactor: (password: string) => Promise<boolean>;
}

const normalizeUserPayload = (raw: any | null) => {
  if (!raw) return raw;

  const isAdmin = Boolean(raw.isAdmin ?? raw.is_admin);
  const storeId = raw.storeId ?? raw.store_id ?? null;
  const roleRaw = raw.role ?? (isAdmin ? 'admin' : raw.role);
  const role = roleRaw ? roleRaw.toString().toLowerCase() : undefined;
  const twofaVerified = Boolean(
    raw.twofaVerified ?? raw.twofa_verified ?? raw.requires2fa ?? raw.totpVerified ?? false
  );

  return {
    ...raw,
    isAdmin,
    storeId,
    role,
    twofaVerified,
  };
};

export function useAuth(): AuthState & AuthActions {
  const [user, setUser] = useState<User | null>(null);
  const [requiresPasswordChange, setRequiresPasswordChange] = useState<boolean>(false);
  const [twoFactorEnabled, setTwoFactorEnabled] = useState<boolean>(false);
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
          const normalizedSaved = normalizeUserPayload(savedUser);
          setUser(normalizedSaved as any);
          setRequiresPasswordChange(Boolean((normalizedSaved as any)?.requiresPasswordChange));
          setTwoFactorEnabled(Boolean((normalizedSaved as any)?.twofaVerified));
        }

        const response = await fetch("/api/auth/me", {
          credentials: "include",
          cache: "no-store" as RequestCache,
        });

        if (response.ok) {
          const payload = await response.json();
          const userData = (payload as any)?.data || payload;
          const normalized = normalizeUserPayload(userData);
          setUser(normalized as any);
          setRequiresPasswordChange(Boolean((normalized as any)?.requiresPasswordChange));
          setTwoFactorEnabled(Boolean((normalized as any)?.twofaVerified));
          saveSession(normalized as any);
          refreshSession();
        } else {
          clearSession();
          setUser(null);
          setTwoFactorEnabled(false);
        }
      } catch {
        clearSession();
        setUser(null);
        setTwoFactorEnabled(false);
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
        setTwoFactorEnabled(false);
        return;
      }

      const payload = await response.json();
      const userData = (payload as any)?.data || payload;
      const normalized = normalizeUserPayload(userData);
      setUser(normalized as any);
      setRequiresPasswordChange(Boolean((normalized as any)?.requiresPasswordChange));
      setTwoFactorEnabled(Boolean((normalized as any)?.twofaVerified));
      saveSession(normalized as any);
    } catch {
      clearSession();
      setUser(null);
      setRequiresPasswordChange(false);
      setTwoFactorEnabled(false);
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
        const normalizedUser = normalizeUserPayload(respUser);
        setUser(normalizedUser as any);
        setRequiresPasswordChange(Boolean((normalizedUser as any)?.requiresPasswordChange));
        setTwoFactorEnabled(Boolean((normalizedUser as any)?.twofaVerified));
        saveSession(normalizedUser as any);
        refreshSession();

        if (Boolean((normalizedUser as any)?.requiresPasswordChange)) {
          window.location.href = "/force-password-reset";
          return;
        }

        const role = normalizedUser?.isAdmin ? 'admin' : (normalizedUser as any)?.role || 'cashier';
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
      const normalizedUser = normalizeUserPayload(userData);
      setUser(normalizedUser as any);
      setRequiresPasswordChange(Boolean((normalizedUser as any)?.requiresPasswordChange));
      setTwoFactorEnabled(Boolean((normalizedUser as any)?.twofaVerified));
      saveSession(normalizedUser as any);

      if (Boolean((normalizedUser as any)?.requiresPasswordChange)) {
        window.location.href = "/force-password-reset";
        return;
      }

      const role = normalizedUser?.isAdmin ? 'admin' : (normalizedUser as any)?.role || 'cashier';
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
    const ensureServerLogout = async () => {
      try {
        const response = await fetch('/api/auth/me', {
          credentials: 'include',
          cache: 'no-store' as RequestCache,
        });

        if (response.ok) {
          console.warn('Logout follow-up: /api/auth/me still returns 200; forcing second logout attempt.');
          await post('/auth/logout');
        }
      } catch (err) {
        console.warn('Logout follow-up fetch failed', err);
      }
    };

    try {
      await post('/auth/logout');
    } catch (logoutError) {
      console.warn('Logout request failed', logoutError);
    }

    // Clear client caches regardless of network result
    setUser(null);
    setError(null);
    clearSession();
    setTwoFactorEnabled(false);

    await ensureServerLogout();

    // Final verification before redirecting
    try {
      const verifyResponse = await fetch('/api/auth/me', {
        credentials: 'include',
        cache: 'no-store' as RequestCache,
      });

      if (verifyResponse.ok) {
        console.warn('Logout verify: session still active; clearing local state and forcing redirect.');
      }
    } catch (err) {
      console.warn('Logout verify request failed', err);
    }

    // Ensure session storage is cleared one last time before navigation
    clearSession();

    const redirectTo = '/login';
    if (window.location.pathname !== redirectTo) {
      window.location.replace(redirectTo);
    } else {
      window.history.replaceState(null, '', redirectTo);
    }
  };

  const setupTwoFactor = async () => {
    try {
      const response = await fetch('/api/auth/setup-2fa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });

      if (!response.ok) {
        const errorData = await response
          .json()
          .catch(() => null);
        throw new Error(errorData?.message || 'Failed to start 2FA setup');
      }

      return (await response.json()) as { otpauth: string };
    } catch (error) {
      console.error('setupTwoFactor error', error);
      return null;
    }
  };

  const verifyTwoFactor = async (token: string) => {
    try {
      const response = await fetch('/api/auth/verify-2fa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ token }),
      });

      if (!response.ok) {
        const errorData = await response
          .json()
          .catch(() => null);
        throw new Error(errorData?.message || 'Invalid 2FA code');
      }

      setTwoFactorEnabled(true);
      await refreshUser();
      return true;
    } catch (error) {
      console.error('verifyTwoFactor error', error);
      return false;
    }
  };

  const disableTwoFactor = async (password: string) => {
    try {
      const response = await fetch('/api/auth/disable-2fa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ password }),
      });

      if (!response.ok) {
        const errorData = await response
          .json()
          .catch(() => null);
        throw new Error(errorData?.message || 'Unable to disable 2FA');
      }

      setTwoFactorEnabled(false);
      await refreshUser();
      return true;
    } catch (error) {
      console.error('disableTwoFactor error', error);
      return false;
    }
  };

  return {
    user: user as any,
    isLoading,
    isAuthenticated: !!user,
    login,
    logout,
    error,
    requiresPasswordChange,
    refreshUser,
    twoFactorEnabled,
    setupTwoFactor,
    verifyTwoFactor,
    disableTwoFactor,
  } as any;
}
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
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  error: string | null;
}

export function useAuth(): AuthState & AuthActions {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Auto-refresh session when user is active
  const handleUserActivity = useCallback(() => {
    if (user && (user.role === "manager" || user.role === "cashier")) {
      refreshSession();
    }
  }, [user]);

  useEffect(() => {
    if (user && (user.role === "manager" || user.role === "cashier")) {
      // Refresh session on user activity
      const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];
      
      const activityHandler = () => {
        handleUserActivity();
      };

      events.forEach(event => {
        document.addEventListener(event, activityHandler, { passive: true });
      });

      // Refresh session every 30 minutes
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
        // First check localStorage for session persistence
        const savedUser = loadSession();
        if (savedUser) {
          // Session is valid, set user immediately
          setUser(savedUser);
          setIsLoading(false);
          
          // Refresh session expiry
          refreshSession();
          return;
        }

        // Fallback to server auth check
        const response = await fetch("/api/auth/me");
        console.log("Auth check response status:", response.status);
        if (response.ok) {
          const userData = await response.json();
          console.log("User data from auth check:", userData);
          setUser(userData);
          
          // Save session for manager/cashier roles
          if (userData.role === "manager" || userData.role === "cashier") {
            saveSession(userData);
          }
        } else {
          console.log("Auth check failed - not authenticated");
        }
      } catch (err) {
        console.error("Auth check failed:", err);
      } finally {
        setIsLoading(false);
      }
    };

    checkAuth();
  }, []);

  const login = async (username: string, password: string) => {
    setIsLoading(true);
    setError(null);
    
    try {
      // Use centralized API client which automatically handles CSRF tokens and cookies
      const userData = await post<User>("/auth/login", { username, password });
      console.log("Login successful, user data:", userData);
      setUser(userData);
      setError(null);
      
      // Save session for manager/cashier roles
      if (userData.role === "manager" || userData.role === "cashier") {
        saveSession(userData);
      }
      
      // Redirect to appropriate default page based on role
      const role = userData.role || "cashier";
      let defaultPath = "/";
      if (role === "admin") {
        defaultPath = "/analytics";
      } else if (role === "manager") {
        defaultPath = "/inventory";
      } else {
        defaultPath = "/pos";
      }
      
      console.log("Redirecting to default path after login:", defaultPath);
      window.location.href = defaultPath;
    } catch (err) {
      setError("Network error. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    try {
      // Ensure CSRF token is included on logout request as well
      await post("/auth/logout");
    } catch (err) {
      console.error("Logout error:", err);
    } finally {
      setUser(null);
      setError(null);
      // Clear session from localStorage
      clearSession();
      // Force a page reload to clear all state and redirect to login
      window.location.reload();
    }
  };

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
    login,
    logout,
    error,
  };
}
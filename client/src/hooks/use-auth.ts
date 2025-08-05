import { useState, useEffect } from "react";
import { User } from "@shared/schema";

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

  // Check if user is already logged in on mount
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const response = await fetch("/api/auth/me");
        console.log("Auth check response status:", response.status);
        if (response.ok) {
          const userData = await response.json();
          console.log("User data from auth check:", userData);
          setUser(userData);
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
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username, password }),
      });

      if (response.ok) {
        const userData = await response.json();
        console.log("Login successful, user data:", userData);
        setUser(userData);
        setError(null);
        
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
      } else {
        const errorData = await response.json();
        console.log("Login failed:", errorData);
        setError(errorData.message || "Login failed");
      }
    } catch (err) {
      setError("Network error. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch (err) {
      console.error("Logout error:", err);
    } finally {
      setUser(null);
      setError(null);
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
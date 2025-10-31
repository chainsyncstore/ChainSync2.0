import { useEffect } from "react";
import { useLocation } from "wouter";

export const PUBLIC_ROUTES = new Set<string>([
  "/",
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/payment-callback",
  "/post-onboarding",
]);

export function useProtectedRouteGuard(isLoading: boolean, isAuthenticated: boolean) {
  const [location, setLocation] = useLocation();

  useEffect(() => {
    if (isLoading || isAuthenticated) {
      return;
    }

    const [currentPath] = location.split("?");
    if (PUBLIC_ROUTES.has(currentPath)) {
      return;
    }

    setLocation("/login", { replace: true });
  }, [isLoading, isAuthenticated, location, setLocation]);
}

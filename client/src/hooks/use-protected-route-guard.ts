import { useEffect } from "react";
import { useLocation } from "wouter";

export const PUBLIC_ROUTES = new Set<string>([
  "/",
  "/login",
  "/signup",
  "/signup/verify-otp",
  "/forgot-password",
  "/reset-password",
  "/payment-callback",
  "/post-onboarding",
  // Product pages
  "/product/pos",
  "/product/inventory",
  "/product/analytics",
  "/product/multi-store",
  // Support pages
  "/support/help",
  "/support/docs",
  "/support/contact",
  "/support/status",
  // Company pages
  "/company/about",
  "/company/blog",
  "/company/careers",
  "/company/privacy",
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

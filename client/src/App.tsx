import { QueryClientProvider } from "@tanstack/react-query";
import React, { Suspense, lazy, useEffect } from 'react';
import { Switch, Route, useLocation } from "wouter";
import { ErrorBoundary } from "@/components/error-boundary";
import { PageLoading } from "@/components/ui/loading";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AIChatProvider } from "@/hooks/use-ai-chat";
import { useAuth } from "@/hooks/use-auth";
import { ScannerProvider } from "@/hooks/use-barcode-scanner";
import { useProtectedRouteGuard } from "@/hooks/use-protected-route-guard";
import { RECAPTCHA_SITE_KEY } from "./lib/constants";
import { queryClient } from "./lib/queryClient";

const Login = lazy(() => import("@/components/auth/login"));
const Signup = lazy(() => import("@/components/auth/signup"));
const ForgotPassword = lazy(() => import("@/components/auth/forgot-password"));
const ResetPassword = lazy(() => import("@/components/auth/reset-password"));
const ForcePasswordReset = lazy(() => import("./components/auth/force-password-reset"));
const MainLayout = lazy(() => import("@/components/layout/main-layout"));

// Lazy load pages for better performance
const Landing = lazy(() => import("@/pages/landing"));
const POS = lazy(() => import("@/pages/pos"));
const Inventory = lazy(() => import("@/pages/inventory"));
const Analytics = lazy(() => import("@/pages/analytics"));  
const AdminAudit = lazy(() => import("@/pages/admin/audit"));
const AdminUsers = lazy(() => import("@/pages/admin/users"));
const AdminIp = lazy(() => import("@/pages/admin/ip-whitelist"));
const AdminBulk = lazy(() => import("@/pages/admin/bulk-pricing"));
const AdminBilling = lazy(() => import("@/pages/admin/billing"));
const Loyalty = lazy(() => import("@/pages/loyalty"));
const Alerts = lazy(() => import("@/pages/alerts"));
const DataImport = lazy(() => import("@/pages/data-import"));
const MultiStore = lazy(() => import("@/pages/multi-store"));
const Settings = lazy(() => import("@/pages/settings"));
const StoreStaff = lazy(() => import("./pages/store-staff"));
const DebugCsrf = lazy(() => import("@/pages/debug-csrf"));
const NotFound = lazy(() => import("@/pages/not-found"));


// Loading component for lazy-loaded pages
const PageLoader = () => (
  <div className="flex items-center justify-center min-h-screen">
    <PageLoading />
  </div>
);

// Dashboard component for different user roles
function Dashboard({ userRole }: { userRole: string }) {
  // Ensure userRole is always a valid string; default to "admin" for new signups
  const role = userRole || "admin";
  console.log("Dashboard rendering with role:", role);
  const [location, setLocation] = useLocation();

  useEffect(() => {
    const defaultPath = role === "admin" ? "/analytics" : role === "manager" ? "/inventory" : "/pos";
    if (location === "/login" || location === "/") {
      setLocation(defaultPath, { replace: true });
    }
  }, [location, setLocation, role]);

  if (role === "admin") {
    return (
      <ScannerProvider>
        <MainLayout userRole={role}>
          <Suspense fallback={<PageLoader />}>
            <Switch>
              <Route path="/" component={Analytics} /> {/* Admin sees analytics as default */}
              <Route path="/login" component={Analytics} /> {/* Redirect login to default */}
              <Route path="/inventory" component={Inventory} />
              <Route path="/analytics" component={Analytics} />
              <Route path="/admin/audit" component={AdminAudit} />
              <Route path="/admin/users" component={AdminUsers} />
              <Route path="/admin/ip-whitelist" component={AdminIp} />
              <Route path="/admin/bulk-pricing" component={AdminBulk} />
              <Route path="/admin/billing" component={AdminBilling} />
              <Route path="/loyalty" component={Loyalty} />
              <Route path="/alerts" component={Alerts} />
              <Route path="/data-import" component={DataImport} />
              <Route path="/multi-store" component={MultiStore} />
              <Route path="/settings" component={Settings} />
              <Route path="/stores/:storeId/staff" component={StoreStaff} />
              <Route path="/debug-csrf" component={DebugCsrf} />
              <Route component={NotFound} />
            </Switch>
          </Suspense>
        </MainLayout>
      </ScannerProvider>
    );
  }
  
  if (role === "manager") {
    return (
      <ScannerProvider>
        <MainLayout userRole={role}>
          <Suspense fallback={<PageLoader />}>
            <Switch>
              <Route path="/" component={Inventory} /> {/* Manager sees inventory as default */}
              <Route path="/login" component={Inventory} /> {/* Redirect login to default */}
              <Route path="/inventory" component={Inventory} />
              <Route path="/analytics" component={Analytics} />
              <Route path="/admin/audit" component={AdminAudit} />
              <Route path="/admin/users" component={AdminUsers} />
              <Route path="/admin/ip-whitelist" component={AdminIp} />
              <Route path="/admin/bulk-pricing" component={AdminBulk} />
              <Route path="/loyalty" component={Loyalty} />
              <Route path="/alerts" component={Alerts} />
              <Route path="/data-import" component={DataImport} />
              <Route path="/settings" component={Settings} />
              <Route component={NotFound} />
            </Switch>
          </Suspense>
        </MainLayout>
      </ScannerProvider>
    );
  }
  
  // Cashier role (default) - redirect directly to POS
  return (
    <ScannerProvider>
      <MainLayout userRole={role}>
        <Suspense fallback={<PageLoader />}>
          <Switch>
            <Route path="/" component={POS} /> {/* Cashier sees POS as default */}
            <Route path="/login" component={POS} /> {/* Redirect login to default */}
            <Route path="/pos" component={POS} />
            <Route path="/settings" component={Settings} />
            <Route component={NotFound} />
          </Switch>
        </Suspense>
      </MainLayout>
    </ScannerProvider>
  );
}

function App() {
  const { user, login, isAuthenticated, isLoading, error, requiresPasswordChange } = useAuth();
  const [location, setLocation] = useLocation();

  useEffect(() => {
    if (isAuthenticated && requiresPasswordChange && location !== "/force-password-reset") {
      setLocation("/force-password-reset");
    }
  }, [isAuthenticated, requiresPasswordChange, location, setLocation]);

  useProtectedRouteGuard(isLoading, isAuthenticated);

  // Debug: Log reCAPTCHA site key
  console.log('App loaded, RECAPTCHA_SITE_KEY:', RECAPTCHA_SITE_KEY);
  console.log('Environment variables:', {
    VITE_RECAPTCHA_SITE_KEY: import.meta.env.VITE_RECAPTCHA_SITE_KEY,
    NODE_ENV: import.meta.env.NODE_ENV,
    MODE: import.meta.env.MODE
  });

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AIChatProvider>
          <TooltipProvider>
              <Toaster />
              {isLoading ? (
                <PageLoader />
              ) : isAuthenticated && user ? (
                requiresPasswordChange ? (
                  <Suspense fallback={<PageLoader />}>
                    <ForcePasswordReset />
                  </Suspense>
                ) : (
                  <Dashboard userRole={user.role} />
                )
              ) : (
                <Suspense fallback={<PageLoader />}>
                  <Switch>
                    <Route path="/login">{() => (
                      <Login
                        onLogin={login}
                        onForgotPassword={() => setLocation('/forgot-password')}
                        isLoading={isLoading}
                        error={error || null}
                      />
                    )}</Route>
                    <Route path="/signup" component={Signup} />
                    <Route path="/forgot-password">{() => (
                      <ForgotPassword onBackToLogin={() => setLocation('/login')} />
                    )}</Route>
                    <Route path="/reset-password">{() => {
                      const token = typeof window !== 'undefined' ? (new URLSearchParams(window.location.search).get('token') || '') : '';
                      return (
                        <ResetPassword
                          token={token}
                          onSuccess={() => setLocation('/login')}
                        />
                      );
                    }}</Route>
                    <Route path="/" component={Landing} />
                    <Route component={NotFound} />
                  </Switch>
                </Suspense>
              )}
            </TooltipProvider>
        </AIChatProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;

import React, { Suspense, lazy } from 'react';
import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/use-auth";
import { AIChatProvider } from "@/hooks/use-ai-chat";
import { ScannerProvider } from "@/hooks/use-barcode-scanner";
import { ErrorBoundary } from "@/components/error-boundary";
import { PageLoading } from "@/components/ui/loading";
import Login from "@/components/auth/login";
import Signup from "@/components/auth/signup";
import ForgotPassword from "@/components/auth/forgot-password";
import ResetPassword from "@/components/auth/reset-password";
import MainLayout from "@/components/layout/main-layout";
import { useState } from "react";

// Lazy load pages for better performance
const Landing = lazy(() => import("@/pages/landing"));
const PaymentCallback = lazy(() => import("@/pages/payment-callback"));
const POS = lazy(() => import("@/pages/pos"));
const Inventory = lazy(() => import("@/pages/inventory"));
const Analytics = lazy(() => import("@/pages/analytics"));  
const Loyalty = lazy(() => import("@/pages/loyalty"));
const Alerts = lazy(() => import("@/pages/alerts"));
const DataImport = lazy(() => import("@/pages/data-import"));
const MultiStore = lazy(() => import("@/pages/multi-store"));
const Settings = lazy(() => import("@/pages/settings"));
const NotFound = lazy(() => import("@/pages/not-found"));

// Loading component for lazy-loaded pages
const PageLoader = () => (
  <div className="flex items-center justify-center min-h-screen">
    <PageLoading />
  </div>
);

// Dashboard component for different user roles
function Dashboard({ userRole }: { userRole: string }) {
  // Ensure userRole is always a valid string, default to "cashier" if undefined/null
  const role = userRole || "cashier";
  console.log("Dashboard rendering with role:", role);
  
  if (role === "admin") {
    return (
      <MainLayout userRole={role}>
        <Suspense fallback={<PageLoader />}>
          <Switch>
            <Route path="/" component={Analytics} /> {/* Admin sees analytics as default */}
            <Route path="/login" component={Analytics} /> {/* Redirect login to default */}
            <Route path="/inventory" component={Inventory} />
            <Route path="/analytics" component={Analytics} />
            <Route path="/loyalty" component={Loyalty} />
            <Route path="/alerts" component={Alerts} />
            <Route path="/data-import" component={DataImport} />
            <Route path="/multi-store" component={MultiStore} />
            <Route path="/settings" component={Settings} />
            <Route path="/pos" component={POS} />
            <Route component={NotFound} />
          </Switch>
        </Suspense>
      </MainLayout>
    );
  }
  
  if (role === "manager") {
    return (
      <MainLayout userRole={role}>
        <Suspense fallback={<PageLoader />}>
          <Switch>
            <Route path="/" component={Inventory} /> {/* Manager sees inventory as default */}
            <Route path="/login" component={Inventory} /> {/* Redirect login to default */}
            <Route path="/inventory" component={Inventory} />
            <Route path="/analytics" component={Analytics} />
            <Route path="/loyalty" component={Loyalty} />
            <Route path="/alerts" component={Alerts} />
            <Route path="/data-import" component={DataImport} />
            <Route path="/settings" component={Settings} />
            <Route path="/pos" component={POS} />
            <Route component={NotFound} />
          </Switch>
        </Suspense>
      </MainLayout>
    );
  }
  
  // Cashier role (default) - redirect directly to POS
  return (
    <MainLayout userRole={role}>
      <Suspense fallback={<PageLoader />}>
        <Switch>
          <Route path="/" component={POS} />
          <Route path="/login" component={POS} /> {/* Redirect login to default */}
          <Route path="/pos" component={POS} />
          <Route path="/inventory" component={Inventory} />
          <Route path="/analytics" component={Analytics} />
          <Route path="/loyalty" component={Loyalty} />
          <Route path="/alerts" component={Alerts} />
          <Route path="/data-import" component={DataImport} />
          <Route path="/settings" component={Settings} />
          <Route component={POS} /> {/* All other routes redirect to POS */}
        </Switch>
      </Suspense>
    </MainLayout>
  );
}

function Router() {
  const { user, isLoading, isAuthenticated, login, logout, error } = useAuth();
  const [showForgotPassword, setShowForgotPassword] = useState(false);

  if (isLoading) {
    return <PageLoading />;
  }

  if (!isAuthenticated) {
    return (
      <Suspense fallback={<PageLoader />}>
        <Switch>
          <Route path="/" component={Landing} />
          <Route path="/login" component={() => 
            showForgotPassword ? (
              <ForgotPassword onBackToLogin={() => setShowForgotPassword(false)} />
            ) : (
              <Login 
                onLogin={login} 
                onForgotPassword={() => setShowForgotPassword(true)}
                isLoading={isLoading} 
                error={error} 
              />
            )
          } />
          <Route path="/signup" component={Signup} />
          <Route path="/reset-password" component={({ params }: any) => {
            const urlParams = new URLSearchParams(window.location.search);
            const token = urlParams.get('token');
            return token ? (
              <ResetPassword 
                token={token} 
                onSuccess={() => window.location.href = '/login'} 
              />
            ) : (
              <Login 
                onLogin={login} 
                onForgotPassword={() => setShowForgotPassword(true)}
                isLoading={isLoading} 
                error={error} 
              />
            );
          }} />
          <Route path="/payment/callback" component={PaymentCallback} />
          <Route component={() => 
            showForgotPassword ? (
              <ForgotPassword onBackToLogin={() => setShowForgotPassword(false)} />
            ) : (
              <Login 
                onLogin={login} 
                onForgotPassword={() => setShowForgotPassword(true)}
                isLoading={isLoading} 
                error={error} 
              />
            )
          } />
        </Switch>
      </Suspense>
    );
  }

  // Ensure we have a valid user role, default to "cashier" if undefined
  const userRole = user?.role || "cashier";
  console.log("User role:", userRole, "User:", user); // Debug logging
  console.log("Current URL:", window.location.href);
  console.log("Current pathname:", window.location.pathname);
  
  return <Dashboard userRole={userRole} />;
}

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AIChatProvider>
          <ScannerProvider>
            <TooltipProvider>
              <Toaster />
              <Router />
            </TooltipProvider>
          </ScannerProvider>
        </AIChatProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;

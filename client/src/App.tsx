import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/use-auth";
import { AIChatProvider } from "@/hooks/use-ai-chat";
import Login from "@/components/auth/login";
import Signup from "@/components/auth/signup";
import MainLayout from "@/components/layout/main-layout";

// Pages
import Landing from "@/pages/landing";
import PaymentCallback from "@/pages/payment-callback";
import POS from "@/pages/pos";
import Inventory from "@/pages/inventory";
import Analytics from "@/pages/analytics";  
import Loyalty from "@/pages/loyalty";
import Alerts from "@/pages/alerts";
import DataImport from "@/pages/data-import";
import MultiStore from "@/pages/multi-store";
import Settings from "@/pages/settings";
import NotFound from "@/pages/not-found";

// Dashboard component for different user roles
function Dashboard({ userRole }: { userRole: string }) {
  // Ensure userRole is always a valid string, default to "cashier" if undefined/null
  const role = userRole || "cashier";
  console.log("Dashboard rendering with role:", role);
  
  if (role === "admin") {
    return (
      <MainLayout userRole={role}>
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
      </MainLayout>
    );
  }
  
  if (role === "manager") {
    return (
      <MainLayout userRole={role}>
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
      </MainLayout>
    );
  }
  
  // Cashier role (default) - redirect directly to POS
  return (
    <MainLayout userRole={role}>
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
    </MainLayout>
  );
}

function Router() {
  const { user, isLoading, isAuthenticated, login, logout, error } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-slate-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <Switch>
        <Route path="/" component={Landing} />
        <Route path="/login" component={() => <Login onLogin={login} isLoading={isLoading} error={error} />} />
        <Route path="/signup" component={Signup} />
        <Route path="/payment/callback" component={PaymentCallback} />
        <Route component={() => <Login onLogin={login} isLoading={isLoading} error={error} />} />
      </Switch>
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
    <QueryClientProvider client={queryClient}>
      <AIChatProvider>
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </AIChatProvider>
    </QueryClientProvider>
  );
}

export default App;

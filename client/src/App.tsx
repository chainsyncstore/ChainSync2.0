import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/use-auth";
import Login from "@/components/auth/login";

// Pages
import POS from "@/pages/pos";
import Inventory from "@/pages/inventory";
import Analytics from "@/pages/analytics";  
import Alerts from "@/pages/alerts";
import DataImport from "@/pages/data-import";
import MultiStore from "@/pages/multi-store";
import Settings from "@/pages/settings";
import NotFound from "@/pages/not-found";

// Dashboard component for different user roles
function Dashboard({ userRole }: { userRole: string }) {
  if (userRole === "admin") {
    return (
      <Switch>
        <Route path="/" component={Analytics} /> {/* Admin sees analytics as default */}
        <Route path="/inventory" component={Inventory} />
        <Route path="/analytics" component={Analytics} />
        <Route path="/alerts" component={Alerts} />
        <Route path="/data-import" component={DataImport} />
        <Route path="/multi-store" component={MultiStore} />
        <Route path="/settings" component={Settings} />
        <Route path="/pos" component={POS} />
        <Route component={NotFound} />
      </Switch>
    );
  }
  
  if (userRole === "manager") {
    return (
      <Switch>
        <Route path="/" component={Inventory} /> {/* Manager sees inventory as default */}
        <Route path="/inventory" component={Inventory} />
        <Route path="/analytics" component={Analytics} />
        <Route path="/alerts" component={Alerts} />
        <Route path="/data-import" component={DataImport} />
        <Route path="/settings" component={Settings} />
        <Route path="/pos" component={POS} />
        <Route component={NotFound} />
      </Switch>
    );
  }
  
  // Cashier role - redirect directly to POS
  return (
    <Switch>
      <Route path="/" component={POS} />
      <Route component={POS} /> {/* All other routes redirect to POS */}
    </Switch>
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
    return <Login onLogin={login} isLoading={isLoading} error={error} />;
  }

  return <Dashboard userRole={user?.role || "cashier"} />;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;

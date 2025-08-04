import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import POS from "@/pages/pos";
import Inventory from "@/pages/inventory";
import Analytics from "@/pages/analytics";
import Alerts from "@/pages/alerts";
import DataImport from "@/pages/data-import";
import MultiStore from "@/pages/multi-store";
import Settings from "@/pages/settings";

function Router() {
  return (
    <Switch>
      <Route path="/" component={POS} />
      <Route path="/inventory" component={Inventory} />
      <Route path="/analytics" component={Analytics} />
      <Route path="/alerts" component={Alerts} />
      <Route path="/data-import" component={DataImport} />
      <Route path="/multi-store" component={MultiStore} />
      <Route path="/settings" component={Settings} />
      <Route component={NotFound} />
    </Switch>
  );
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

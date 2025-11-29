import { useMemo, useState, useEffect, Suspense, lazy } from "react";
import { useLocation } from "wouter";

import TrialAutopayBanner from "@/components/billing/TrialAutopayBanner";
import { useAuth } from "@/hooks/use-auth";
import { LayoutContext } from "@/hooks/use-layout";
import { useNotificationBridge } from "@/hooks/use-notification-bridge";

const Sidebar = lazy(() => import("./sidebar"));
const TopBar = lazy(() => import("./topbar"));
const FloatingChat = lazy(() => import("../ai/floating-chat"));

interface MainLayoutProps {
  children: React.ReactNode;
  userRole: string;
}

export default function MainLayout({ children, userRole }: MainLayoutProps) {
  const [location] = useLocation();
  const { user, logout } = useAuth();
  const [currentDateTime, setCurrentDateTime] = useState(new Date());
  const [managerStoreId, setManagerStoreId] = useState<string | null>(null);
  const [alertCount, setAlertCount] = useState(0);
  const [sidebarFooter, setSidebarFooter] = useState<React.ReactNode | null>(null);

  useNotificationBridge();

  const subscription = (user as any)?.subscription;

  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);
  const showTrialBanner = useMemo(() => {
    if (!subscription) return false;
    const status = typeof subscription.status === 'string' ? subscription.status.toUpperCase() : '';
    const autopayEnabled = Boolean(subscription.autopayEnabled);
    return status === 'TRIAL' && !autopayEnabled && userRole === 'admin';
  }, [subscription, userRole]);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentDateTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (userRole === "manager") {
      setManagerStoreId(user?.storeId ?? null);
    } else {
      setManagerStoreId(null);
    }
  }, [userRole, user?.storeId]);

  // Load alert count for manager store (admins handled per-page)
  useEffect(() => {
    let cancelled = false;
    const loadAlerts = async () => {
      if (userRole !== "manager" || !managerStoreId) { setAlertCount(0); return; }
      try {
        const res = await fetch(`/api/stores/${managerStoreId}/alerts`, { credentials: 'include' });
        if (!res.ok) throw new Error('Failed to load alerts');
        const data = await res.json();
        if (!cancelled) {
          const normalized = Array.isArray(data) ? data : (data?.data || []);
          setAlertCount(normalized.length || 0);
        }
      } catch (error) {
        console.error('Error loading alerts:', error);
        if (!cancelled) setAlertCount(0);
      }
    };
    void loadAlerts();

    return () => { cancelled = true; };
  }, [managerStoreId, userRole]);

  // Get page title and subtitle based on current route
  const getPageInfo = () => {
    switch (location) {
      case "/":
        return {
          title: userRole === "admin" ? "Analytics Dashboard" : 
                 userRole === "manager" ? "Inventory Management" : "Point of Sale",
          subtitle: userRole === "admin" ? "Multi-store overview and insights" :
                   userRole === "manager" ? "Stock levels and product management" : "Process sales and transactions"
        };
      case "/inventory":
        return {
          title: "Inventory Management",
          subtitle: "Stock levels, products, and inventory tracking"
        };
      case "/analytics":
        return {
          title: "Analytics Dashboard",
          subtitle: "Sales reports, trends, and performance metrics"
        };
      case "/alerts":
        return {
          title: "Alerts & Notifications",
          subtitle: "Low stock alerts and system notifications"
        };
      case "/data-import":
        return {
          title: "Data Import",
          subtitle: "Import products, inventory, and customer data"
        };
      case "/multi-store":
        return {
          title: "Multi-Store Management",
          subtitle: "Manage multiple store locations and settings"
        };
      case "/settings":
        return {
          title: "Settings",
          subtitle: "System configuration and user preferences"
        };
      default:
        return {
          title: "ChainSync",
          subtitle: "POS & Analytics System"
        };
    }
  };

  const pageInfo = getPageInfo();
  const userName = user?.firstName && user?.lastName 
    ? `${user.firstName} ${user.lastName}` 
    : user?.username || "User";
  const userInitials = user?.firstName && user?.lastName
    ? `${user.firstName[0]}${user.lastName[0]}`
    : user?.username?.substring(0, 2).toUpperCase() || "U";

  const sidebarProps = userRole === "cashier" ? null : {
    userRole,
    userName,
    userInitials,
    alertCount,
    managerStoreId: managerStoreId ?? undefined,
  } as const;

  return (
    <LayoutContext.Provider value={{ sidebarFooter, setSidebarFooter }}>
      <div className="flex h-screen bg-slate-50 overflow-hidden">
        {/* Sidebar */}
        {sidebarProps ? (
          <Suspense fallback={null}>
            <Sidebar {...sidebarProps} />
          </Suspense>
        ) : null}

        {/* Main Content */}
        <div className="flex-1 flex flex-col min-h-0">
          {/* Top Bar */}
          <Suspense fallback={null}>
            <TopBar
              title={pageInfo.title}
              subtitle={pageInfo.subtitle}
              currentDateTime={currentDateTime}
              onLogout={logout}
              userRole={userRole}
              userName={userName}
              userInitials={userInitials}
              alertCount={alertCount}
              managerStoreId={managerStoreId ?? undefined}
            />
          </Suspense>
          
          {/* Page Content */}
          <main className="flex-1 overflow-y-auto p-3 sm:p-4 lg:p-6">
            {showTrialBanner ? (
              <div className="mb-4">
                <TrialAutopayBanner subscription={subscription} />
              </div>
            ) : null}
            {children}
          </main>
        </div>
        
        {/* Floating AI Chat (lazy) */}
        {userRole !== "cashier" ? (
          <Suspense fallback={null}>
            <FloatingChat storeId={managerStoreId ?? undefined} />
          </Suspense>
        ) : null}
      </div>
    </LayoutContext.Provider>
  );
}
import { useMemo, useState, useEffect, Suspense, lazy } from "react";
import { useLocation } from "wouter";
const Sidebar = lazy(() => import("./sidebar"));
const TopBar = lazy(() => import("./topbar"));
const FloatingChat = lazy(() => import("../ai/floating-chat"));
import { useAuth } from "@/hooks/use-auth";

interface MainLayoutProps {
  children: React.ReactNode;
  userRole: string;
}

export default function MainLayout({ children, userRole }: MainLayoutProps) {
  const [location] = useLocation();
  const { user, logout } = useAuth();
  const [currentDateTime, setCurrentDateTime] = useState(new Date());
  const [selectedStore, setSelectedStore] = useState("");
  const [stores, setStores] = useState<Array<{ id: string; name: string }>>([]);
  const [alertCount, setAlertCount] = useState(0);

  // Update current time
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentDateTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Load stores from API
  useEffect(() => {
    let cancelled = false;
    const loadStores = async () => {
      if (userRole === "cashier") {
        const assignedStoreId = user?.storeId || "";
        setStores(assignedStoreId ? [{ id: assignedStoreId, name: "Assigned Store" }] : []);
        setSelectedStore(assignedStoreId);
        return;
      }

      try {
        const res = await fetch('/api/stores', { credentials: 'include' });
        if (!res.ok) throw new Error('Failed to load stores');
        const data = await res.json();
        if (!cancelled) {
          const normalized = Array.isArray(data) ? data : (data?.data || []);
          let scopedStores = normalized;

          if (userRole === "manager") {
            const assignedStoreId = user?.storeId;
            scopedStores = assignedStoreId
              ? normalized.filter((store) => store.id === assignedStoreId)
              : [];
            if (scopedStores.length === 0 && assignedStoreId) {
              scopedStores = [{ id: assignedStoreId, name: "Assigned Store" }];
            }
          }

          setStores(scopedStores);

          if (scopedStores.length > 0) {
            const effectiveStoreId = userRole === "manager"
              ? (user?.storeId || scopedStores[0].id)
              : scopedStores[0].id;
            setSelectedStore(effectiveStoreId);
          } else {
            setSelectedStore(userRole === "manager" ? (user?.storeId || "") : "");
          }
        }
      } catch (error) {
        console.error('Error loading stores:', error);
        if (!cancelled) {
          const fallbackStoreId = userRole === "manager" ? (user?.storeId || "") : "";
          setStores(fallbackStoreId ? [{ id: fallbackStoreId, name: "Assigned Store" }] : []);
          setSelectedStore(fallbackStoreId);
        }
      }
    };

    void loadStores();

    return () => { cancelled = true; };
  }, [userRole, user?.storeId]);

  // Load alert count for selected store
  useEffect(() => {
    let cancelled = false;
    const loadAlerts = async () => {
      if (!selectedStore) { setAlertCount(0); return; }
      try {
        const res = await fetch(`/api/stores/${selectedStore}/alerts`, { credentials: 'include' });
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
  }, [selectedStore]);

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

  const hideStoreSelector = useMemo(() => userRole !== "admin", [userRole]);

  const topBarStores = userRole === "cashier" ? [] : stores;

  const sidebarProps = userRole === "cashier" ? null : {
    userRole,
    userName,
    userInitials,
    selectedStore,
    stores,
    onStoreChange: (storeId: string) => {
      if (userRole === "manager") return; // manager store fixed
      setSelectedStore(storeId);
    },
    alertCount,
    hideStoreSelector,
  } as const;

  return (
    <div className="flex h-screen bg-slate-50">
      {/* Sidebar */}
      {sidebarProps ? (
        <Suspense fallback={null}>
          <Sidebar {...sidebarProps} />
        </Suspense>
      ) : null}

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
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
            selectedStore={selectedStore}
            stores={topBarStores}
            onStoreChange={userRole === "cashier" ? undefined : setSelectedStore}
            alertCount={alertCount}
            hideStoreSelector={hideStoreSelector}
          />
        </Suspense>
        
        {/* Page Content */}
        <main className="flex-1 overflow-auto p-3 sm:p-4 lg:p-6">
          {children}
        </main>
      </div>
      
      {/* Floating AI Chat (lazy) */}
      <Suspense fallback={null}>
        <FloatingChat storeId={selectedStore} />
      </Suspense>
    </div>
  );
}
import {
	ScanBarcode,
	Package,
	TrendingUp,
	AlertTriangle,
	Upload,
	Building2,
	Settings,
	Link as LinkIcon,
	Crown,
	ListChecks,
	CreditCard,
	Users,
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useLayout } from "@/hooks/use-layout";

/* eslint-disable no-unused-vars -- prop parameter names document external contract */
interface SidebarProps {
	userRole: string;
	userName: string;
	userInitials: string;
	selectedStore: string;
	stores: Array<{ id: string; name: string }>;
	onStoreChange: (storeId: string) => void;
	alertCount: number;
	isMobile?: boolean; // Add prop to indicate if it's in mobile menu
	hideStoreSelector?: boolean;
}
/* eslint-enable no-unused-vars */

type NavigationItem = {
	path: string;
	icon: typeof ScanBarcode;
	label: string;
	hasAlert?: boolean;
	disabled?: boolean;
};

const getNavigationItems = (
	userRole: string,
	options: { selectedStore?: string } = {}
): NavigationItem[] => {
	if (userRole === "cashier") {
		return [
			{ path: "/pos", icon: ScanBarcode, label: "POS" },
			{ path: "/settings", icon: Settings, label: "Settings" },
		];
	}

	const items: NavigationItem[] = [
		{ path: "/inventory", icon: Package, label: "Inventory" },
		{ path: "/analytics", icon: TrendingUp, label: "Analytics" },
		{ path: "/loyalty", icon: Crown, label: "Loyalty" },
		{ path: "/alerts", icon: AlertTriangle, label: "Alerts", hasAlert: true },
		{ path: "/data-import", icon: Upload, label: "Data Import" },
		{ path: "/settings", icon: Settings, label: "Settings" },
	];

	if (userRole === "manager") {
		const manageStaffPath = options.selectedStore
			? `/stores/${options.selectedStore}/staff`
			: "";
		items.splice(1, 0, {
			path: manageStaffPath,
			icon: Users,
			label: "Manage Staff",
			disabled: !options.selectedStore,
		});
	}

	if (userRole === "admin") {
		items.splice(-1, 0, { path: "/multi-store", icon: Building2, label: "Multi-Store" });
		items.splice(-1, 0, { path: "/admin/audit", icon: ListChecks, label: "Audit" });
		items.splice(-1, 0, { path: "/admin/billing", icon: CreditCard, label: "Billing" });
	}

	return items;
};

export default function Sidebar({
	userRole,
	userName,
	userInitials,
	selectedStore,
	stores,
	onStoreChange,
	alertCount,
	isMobile = false,
	hideStoreSelector = false,
}: SidebarProps) {
	const [location] = useLocation();
	const { sidebarFooter } = useLayout();

	return (
		<div className={cn(
			"bg-white shadow-lg border-r border-slate-200 flex flex-col h-full transition-all duration-300",
			isMobile ? "w-full" : "hidden lg:flex lg:w-64"
		)}>
			{/* Logo and Brand */}
			<div className="p-4 sm:p-6 border-b border-slate-200">
				<div className="flex items-center space-x-3">
					<div className="w-8 h-8 sm:w-10 sm:h-10 bg-primary rounded-lg flex items-center justify-center flex-shrink-0">
						<LinkIcon className="text-white text-lg sm:text-xl" />
					</div>
					<div className="block">
						<h1 className="text-lg sm:text-xl font-bold text-slate-800">ChainSync</h1>
						<p className="text-xs sm:text-sm text-slate-500">POS & Analytics</p>
					</div>
				</div>
			</div>

			{/* User Role Indicator */}
			<div className="px-3 sm:px-6 py-3 sm:py-4 bg-blue-50 border-b border-slate-200">
				<div className="flex items-center space-x-3">
					<div className="w-7 h-7 sm:w-8 sm:h-8 bg-primary rounded-full flex items-center justify-center flex-shrink-0">
						<span className="text-white text-xs sm:text-sm font-medium">{userInitials}</span>
					</div>
					<div className="min-w-0 flex-1">
						<p className="text-sm font-medium text-slate-800 truncate">{userName}</p>
						<p className="text-xs text-primary font-medium capitalize">{userRole}</p>
					</div>
				</div>
			</div>

			{/* Navigation */}
			<nav className="flex-1 px-2 md:px-4 py-4 sm:py-6 space-y-1 sm:space-y-2">
				{getNavigationItems(userRole, { selectedStore }).map((item) => {
					const Icon = item.icon;
					const isActive = location === item.path;
					const showAlert = (item as any).hasAlert && alertCount > 0;
					const isDisabled = Boolean(item.disabled || !item.path);

					const content = (
						<div
							className={cn(
								"flex items-center space-x-3 px-3 py-2.5 sm:py-2 rounded-lg transition-colors min-h-[44px] sm:min-h-[40px]",
								isActive ? "bg-primary text-white" : "text-slate-600 hover:bg-slate-100",
								isDisabled && !isActive ? "opacity-60 cursor-not-allowed hover:bg-transparent" : "cursor-pointer"
							)}
						>
							<Icon className="w-5 h-5 flex-shrink-0" />
							<span className="truncate min-w-0 text-sm sm:text-base">
								{item.label}
							</span>
							{showAlert && (
								<Badge variant="destructive" className="ml-auto text-xs flex-shrink-0 min-w-[20px] h-5">
									{alertCount}
								</Badge>
							)}
						</div>
					);

					return item.path && !isDisabled ? (
						<Link key={item.path} href={item.path}>
							{content}
						</Link>
					) : (
						<div key={item.label}>{content}</div>
					);
				})}
			</nav>

			{/* Store Selector */}
			{!hideStoreSelector && (
				<div className="p-2 md:p-4 border-t border-slate-200">
					<select
						value={selectedStore}
						onChange={(e) => onStoreChange(e.target.value)}
						className="w-full px-2 md:px-3 py-2.5 sm:py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent min-h-[40px]"
					>
						{stores.map((store) => (
							<option key={store.id} value={store.id}>
								{store.name}
							</option>
						))}
					</select>
				</div>
			)}

			{sidebarFooter ? (
				<div className="p-3 md:p-4 border-t border-slate-200 space-y-3">
					{sidebarFooter}
				</div>
			) : null}
		</div>
	);
}

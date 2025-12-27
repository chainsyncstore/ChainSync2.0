import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Users, TrendingUp, Search, Edit, UserPlus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { getCsrfToken } from "@/lib/csrf";
import type { Store } from "@shared/schema";

type LoyaltySettingsResponse = {
  earnRate: number;
  redeemValue: number;
  scope: "org" | "store";
  storeId: string | null;
};

type LoyaltyCustomer = {
  id: string;
  firstName: string;
  lastName: string;
  email?: string | null;
  phone?: string | null;
  loyaltyNumber: string;
  currentPoints: number;
  lifetimePoints: number;
  isActive: boolean;
  createdAt: string;
};

type LoyaltyCustomersResponse = {
  data: LoyaltyCustomer[];
  page: number;
  pageSize: number;
  total: number;
};

type LoyaltyTransaction = {
  id: string;
  customerId: string;
  transactionId: string;
  customerFirstName?: string | null;
  customerLastName?: string | null;
  loyaltyNumber?: string | null;
  pointsEarned: number;
  pointsRedeemed: number;
  pointsBefore: number;
  pointsAfter: number;
  createdAt: string;
};

type LoyaltyTransactionsResponse = {
  data: LoyaltyTransaction[];
  page: number;
  pageSize: number;
  total: number;
};

const PAGE_SIZE = 25;

export default function LoyaltyPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const isAdmin = Boolean(user?.isAdmin);
  const managerStoreId = !isAdmin ? (user?.storeId ?? null) : null;
  const canManageCustomers = !isAdmin && Boolean(managerStoreId);

  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(managerStoreId);
  const [showAddCustomer, setShowAddCustomer] = useState(false);
  const [showEditSettings, setShowEditSettings] = useState(false);
  const [settingsScope, setSettingsScope] = useState<"org" | "store">(isAdmin ? "store" : "org");
  const [includeInactive, setIncludeInactive] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchFilter, setSearchFilter] = useState("");
  const [customerPage, setCustomerPage] = useState(1);
  const [transactionPage, setTransactionPage] = useState(1);

  const [newCustomer, setNewCustomer] = useState({ firstName: "", lastName: "", email: "", phone: "" });
  const [customerErrors, setCustomerErrors] = useState<Partial<typeof newCustomer>>({});

  useEffect(() => {
    const handle = setTimeout(() => setSearchFilter(searchTerm.trim()), 300);
    return () => clearTimeout(handle);
  }, [searchTerm]);

  useEffect(() => {
    setCustomerPage(1);
  }, [searchFilter, includeInactive, selectedStoreId]);

  const { data: stores = [], isLoading: storesLoading } = useQuery<Store[]>({
    enabled: isAdmin,
    queryKey: ["/api/stores"],
    queryFn: async () => {
      const res = await fetch("/api/stores", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load stores");
      return res.json();
    },
  });

  useEffect(() => {
    if (isAdmin && !selectedStoreId && stores.length > 0) {
      setSelectedStoreId(stores[0].id);
    }
  }, [isAdmin, stores, selectedStoreId]);

  useEffect(() => {
    if (!isAdmin && managerStoreId) {
      setSelectedStoreId(managerStoreId);
    }
  }, [isAdmin, managerStoreId]);

  useEffect(() => {
    if (!showEditSettings) {
      setSettingsScope(isAdmin ? (selectedStoreId ? "store" : "org") : "org");
    }
  }, [showEditSettings, isAdmin, selectedStoreId]);

  const activeStoreId = isAdmin ? selectedStoreId : managerStoreId;
  const storeReady = isAdmin ? Boolean(selectedStoreId) : Boolean(managerStoreId);

  const { data: loyaltySettings, isLoading: settingsLoading, error: loyaltySettingsError } = useQuery<LoyaltySettingsResponse | null>({
    enabled: !isAdmin || Boolean(activeStoreId) || Boolean(stores.length === 0),
    queryKey: ["/api/loyalty/settings", isAdmin ? activeStoreId ?? "org" : "scoped"],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (isAdmin && activeStoreId) {
        params.append("storeId", activeStoreId);
      }
      const qs = params.toString();
      const res = await fetch(`/api/loyalty/settings${qs ? `?${qs}` : ""}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load loyalty settings");
      return res.json() as Promise<LoyaltySettingsResponse>;
    },
    retry: 1,
  });

  useEffect(() => {
    if (loyaltySettingsError) {
      toast({ title: "Error", description: loyaltySettingsError.message, variant: "destructive" });
    }
  }, [loyaltySettingsError, toast]);

  const settingsForm = useMemo(() => ({
    earnRate: loyaltySettings ? Number(loyaltySettings.earnRate.toFixed(4)) : 1,
    redeemValue: loyaltySettings ? Number(loyaltySettings.redeemValue.toFixed(4)) : 0.01,
  }), [loyaltySettings]);

  const [settingsDraft, setSettingsDraft] = useState(settingsForm);
  useEffect(() => {
    setSettingsDraft(settingsForm);
  }, [settingsForm, showEditSettings]);

  const customersQuery = useQuery<LoyaltyCustomersResponse>({
    enabled: storeReady,
    queryKey: [
      "loyalty-customers",
      activeStoreId,
      customerPage,
      searchFilter,
      includeInactive,
    ],
    queryFn: async () => {
      if (!activeStoreId) throw new Error("Store is required");
      const params = new URLSearchParams({
        storeId: activeStoreId,
        page: String(customerPage),
        pageSize: String(PAGE_SIZE),
        includeInactive: includeInactive ? "true" : "false",
      });
      if (searchFilter) params.append("search", searchFilter);
      const res = await fetch(`/api/loyalty/customers?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load customers");
      return res.json() as Promise<LoyaltyCustomersResponse>;
    },
  });

  const transactionsQuery = useQuery<LoyaltyTransactionsResponse>({
    enabled: storeReady,
    queryKey: ["loyalty-transactions", activeStoreId, transactionPage],
    queryFn: async () => {
      if (!activeStoreId) throw new Error("Store is required");
      const params = new URLSearchParams({
        storeId: activeStoreId,
        page: String(transactionPage),
        pageSize: String(PAGE_SIZE),
      });
      const res = await fetch(`/api/loyalty/transactions?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load transactions");
      return res.json() as Promise<LoyaltyTransactionsResponse>;
    },
  });

  const customersData = customersQuery.data;
  const transactionsData = transactionsQuery.data;

  const totalCustomers = customersData?.total ?? 0;
  const customersList = useMemo(() => customersData?.data ?? [], [customersData]);
  const customerPages = Math.max(1, Math.ceil(totalCustomers / PAGE_SIZE));
  const transactionsList = useMemo(() => transactionsData?.data ?? [], [transactionsData]);
  const totalTransactions = transactionsData?.total ?? 0;
  const transactionPages = Math.max(1, Math.ceil(totalTransactions / PAGE_SIZE));

  const totalPointsIssued = useMemo(
    () => customersList.reduce((sum, c) => sum + c.lifetimePoints, 0),
    [customersList]
  );

  const averagePoints = customersList.length
    ? Math.round(customersList.reduce((sum, c) => sum + c.currentPoints, 0) / customersList.length)
    : 0;

  const validateCustomerForm = () => {
    const errors: Partial<typeof newCustomer> = {};
    if (!newCustomer.firstName.trim()) {
      errors.firstName = "First name is required";
    } else if (!/^[a-zA-Z\s'-]+$/.test(newCustomer.firstName.trim())) {
      errors.firstName = "Use letters, spaces, hyphens, apostrophes";
    }
    if (!newCustomer.lastName.trim()) {
      errors.lastName = "Last name is required";
    } else if (!/^[a-zA-Z\s'-]+$/.test(newCustomer.lastName.trim())) {
      errors.lastName = "Use letters, spaces, hyphens, apostrophes";
    }
    if (!newCustomer.email.trim() && !newCustomer.phone.trim()) {
      errors.email = "Email or phone required";
    }
    if (newCustomer.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newCustomer.email.trim())) {
      errors.email = "Invalid email";
    }
    if (newCustomer.phone.trim()) {
      const normalized = newCustomer.phone.replace(/\s+/g, "");
      if (!/^[+]?\d{9,16}$/.test(normalized)) {
        errors.phone = "Invalid phone";
      }
    }
    setCustomerErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const createCustomerMutation = useMutation({
    mutationFn: async () => {
      const csrf = await getCsrfToken();
      const res = await fetch("/api/loyalty/customers", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrf,
        },
        body: JSON.stringify({
          firstName: newCustomer.firstName.trim(),
          lastName: newCustomer.lastName.trim(),
          email: newCustomer.email.trim() || null,
          phone: newCustomer.phone.trim() || null,
        }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(payload?.error || "Failed to add customer");
      }
      return payload;
    },
    onSuccess: () => {
      toast({ title: "Customer added" });
      setShowAddCustomer(false);
      setNewCustomer({ firstName: "", lastName: "", email: "", phone: "" });
      setCustomerErrors({});
      void queryClient.invalidateQueries({ queryKey: ["loyalty-customers"] });
    },
    onError: (error: Error) => {
      toast({ title: "Add failed", description: error.message, variant: "destructive" });
    },
  });

  const handleAddCustomer = () => {
    if (!validateCustomerForm()) {
      toast({ title: "Fix validation errors", variant: "destructive" });
      return;
    }
    createCustomerMutation.mutate();
  };

  const customerStatusMutation = useMutation({
    mutationFn: async ({ customerId, action }: { customerId: string; action: "deactivate" | "reactivate" }) => {
      const csrf = await getCsrfToken();
      const res = await fetch(`/api/loyalty/customers/${customerId}/${action}`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrf,
        },
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) throw new Error(payload?.error || "Failed to update customer");
      return payload;
    },
    onSuccess: (_data, variables) => {
      toast({
        title: variables.action === "deactivate" ? "Customer deactivated" : "Customer reactivated",
      });
      void queryClient.invalidateQueries({ queryKey: ["loyalty-customers"] });
    },
    onError: (error: Error) => {
      toast({ title: "Update failed", description: error.message, variant: "destructive" });
    },
  });

  const updateSettingsMutation = useMutation({
    mutationFn: async () => {
      const csrf = await getCsrfToken();
      const payload: Record<string, unknown> = {
        earnRate: settingsDraft.earnRate,
        redeemValue: settingsDraft.redeemValue,
      };
      if (isAdmin && settingsScope === "store") {
        if (!activeStoreId) throw new Error("Select a store to override");
        payload.storeId = activeStoreId;
      }
      const res = await fetch("/api/loyalty/settings", {
        method: "PUT",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrf,
        },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || "Failed to update settings");
      return body as LoyaltySettingsResponse;
    },
    onSuccess: () => {
      toast({ title: "Settings updated" });
      setShowEditSettings(false);
      void queryClient.invalidateQueries({ queryKey: ["/api/loyalty/settings"] });
    },
    onError: (error: Error) => {
      toast({ title: "Update failed", description: error.message, variant: "destructive" });
    },
  });

  if (!isAdmin && !managerStoreId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Store assignment required</CardTitle>
          <CardDescription>
            Ask an administrator to assign you to a store before managing loyalty data.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (isAdmin && !storesLoading && stores.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No stores found</CardTitle>
          <CardDescription>Create a store to start tracking loyalty data.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Loyalty Program</h1>
          <p className="text-slate-600 mt-1">Manage members, balances, and point rules</p>
        </div>
        {isAdmin ? (
          <Select value={selectedStoreId ?? ""} onValueChange={setSelectedStoreId}>
            <SelectTrigger className="w-56">
              <SelectValue placeholder="Select a store" />
            </SelectTrigger>
            <SelectContent>
              {stores.map((store) => (
                <SelectItem key={store.id} value={store.id}>
                  {store.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <Badge variant="secondary">{stores.find((s) => s.id === managerStoreId)?.name ?? "Assigned store"}</Badge>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Members</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalCustomers.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">Total customers in this store</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Lifetime points</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalPointsIssued.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">Sum of lifetime balances on this page</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg points per member</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{averagePoints.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">Current balance average (page scope)</p>
          </CardContent>
        </Card>
      </div>

      {!storeReady ? (
        <Card>
          <CardHeader>
            <CardTitle>Select a store</CardTitle>
            <CardDescription>Choose a store to view loyalty customers and transactions.</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <Tabs defaultValue="customers" className="space-y-6">
          <TabsList>
            <TabsTrigger value="customers">Customers</TabsTrigger>
            <TabsTrigger value="settings">Earn & Redeem</TabsTrigger>
            <TabsTrigger value="transactions">Transactions</TabsTrigger>
          </TabsList>

          <TabsContent value="customers" className="space-y-6">
            <Card>
              <CardHeader className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <CardTitle>Customers</CardTitle>
                    <CardDescription>Search, review, and manage loyalty members for this store.</CardDescription>
                  </div>
                  {canManageCustomers && (
                    <Dialog open={showAddCustomer} onOpenChange={setShowAddCustomer}>
                      <DialogTrigger asChild>
                        <Button>
                          <UserPlus className="h-4 w-4 mr-2" />
                          Add customer
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Add loyalty customer</DialogTitle>
                          <DialogDescription>Capture at least one contact so staff can find them quickly.</DialogDescription>
                        </DialogHeader>
                        <div className="grid gap-4 py-4">
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label htmlFor="firstName">First name</Label>
                              <Input
                                id="firstName"
                                value={newCustomer.firstName}
                                onChange={(e) => setNewCustomer((prev) => ({ ...prev, firstName: e.target.value }))}
                                className={customerErrors.firstName ? "border-red-500" : undefined}
                              />
                              {customerErrors.firstName && <p className="text-xs text-red-500">{customerErrors.firstName}</p>}
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="lastName">Last name</Label>
                              <Input
                                id="lastName"
                                value={newCustomer.lastName}
                                onChange={(e) => setNewCustomer((prev) => ({ ...prev, lastName: e.target.value }))}
                                className={customerErrors.lastName ? "border-red-500" : undefined}
                              />
                              {customerErrors.lastName && <p className="text-xs text-red-500">{customerErrors.lastName}</p>}
                            </div>
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="email">Email</Label>
                            <Input
                              id="email"
                              type="email"
                              value={newCustomer.email}
                              onChange={(e) => setNewCustomer((prev) => ({ ...prev, email: e.target.value }))}
                              className={customerErrors.email ? "border-red-500" : undefined}
                            />
                            {customerErrors.email && <p className="text-xs text-red-500">{customerErrors.email}</p>}
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="phone">Phone</Label>
                            <Input
                              id="phone"
                              value={newCustomer.phone}
                              onChange={(e) => setNewCustomer((prev) => ({ ...prev, phone: e.target.value }))}
                              className={customerErrors.phone ? "border-red-500" : undefined}
                            />
                            {customerErrors.phone && <p className="text-xs text-red-500">{customerErrors.phone}</p>}
                          </div>
                        </div>
                        <DialogFooter>
                          <Button variant="outline" onClick={() => setShowAddCustomer(false)}>
                            Cancel
                          </Button>
                          <Button onClick={handleAddCustomer} disabled={createCustomerMutation.isPending}>
                            {createCustomerMutation.isPending ? "Saving..." : "Save"}
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-4">
                  <div className="flex items-center space-x-2">
                    <Search className="h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search by name, loyalty #, phone, or email"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-72"
                    />
                  </div>
                  <div className="flex items-center space-x-2">
                    <Switch id="include-inactive" checked={includeInactive} onCheckedChange={setIncludeInactive} />
                    <Label htmlFor="include-inactive" className="text-sm text-muted-foreground">
                      Show inactive
                    </Label>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-lg border border-slate-200">
                  <div className="overflow-x-auto">
                    <div className="max-h-[60vh] overflow-y-auto">
                      <Table>
                        <TableHeader className="sticky top-0 bg-white shadow-sm">
                          <TableRow>
                            <TableHead>Customer</TableHead>
                            <TableHead>Loyalty #</TableHead>
                            <TableHead>Contact</TableHead>
                            <TableHead className="text-right">Current points</TableHead>
                            <TableHead className="text-right">Lifetime points</TableHead>
                            <TableHead>Status</TableHead>
                            {canManageCustomers && <TableHead>Actions</TableHead>}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {customersList.map((customer) => (
                            <TableRow key={customer.id}>
                              <TableCell>
                                <div className="font-medium">
                                  {customer.firstName} {customer.lastName}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  Joined {new Date(customer.createdAt).toLocaleDateString()}
                                </div>
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline">{customer.loyaltyNumber}</Badge>
                              </TableCell>
                              <TableCell>
                                <div className="text-sm">
                                  {customer.email && <div>{customer.email}</div>}
                                  {customer.phone && <div className="text-muted-foreground">{customer.phone}</div>}
                                </div>
                              </TableCell>
                              <TableCell className="text-right font-medium">{customer.currentPoints.toLocaleString()}</TableCell>
                              <TableCell className="text-right">{customer.lifetimePoints.toLocaleString()}</TableCell>
                              <TableCell>
                                <Badge variant={customer.isActive ? "default" : "secondary"}>
                                  {customer.isActive ? "Active" : "Inactive"}
                                </Badge>
                              </TableCell>
                              {canManageCustomers && (
                                <TableCell>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    disabled={customerStatusMutation.isPending}
                                    onClick={() =>
                                      customerStatusMutation.mutate({
                                        customerId: customer.id,
                                        action: customer.isActive ? "deactivate" : "reactivate",
                                      })
                                    }
                                  >
                                    {customer.isActive ? "Deactivate" : "Reactivate"}
                                  </Button>
                                </TableCell>
                              )}
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-2 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between">
                  <div>
                    Showing page {customerPage.toLocaleString()} of {customerPages.toLocaleString()} — displaying{" "}
                    {customersList.length.toLocaleString()} customer
                    {customersList.length === 1 ? "" : "s"} (total {totalCustomers.toLocaleString()}).
                  </div>
                  <div className="space-x-2 text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCustomerPage((page) => Math.max(1, page - 1))}
                      disabled={customerPage === 1 || customersQuery.isLoading}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCustomerPage((page) => Math.min(customerPages, page + 1))}
                      disabled={customerPage >= customerPages || customersQuery.isLoading}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="settings">
            <Card>
              <CardHeader className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <CardTitle>Earn & redeem rules</CardTitle>
                  <CardDescription>
                    Current conversion rules for {loyaltySettings?.scope === "store" ? "this store" : "the organization"}.
                  </CardDescription>
                </div>
                {isAdmin && (
                  <Button onClick={() => setShowEditSettings(true)} disabled={settingsLoading || !loyaltySettings}>
                    <Edit className="h-4 w-4 mr-2" />
                    Edit
                  </Button>
                )}
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                <div className="rounded-lg border p-4">
                  <p className="text-sm text-muted-foreground">Earn rate (points per currency unit)</p>
                  <p className="text-2xl font-semibold">{loyaltySettings ? loyaltySettings.earnRate.toFixed(4) : "—"}</p>
                </div>
                <div className="rounded-lg border p-4">
                  <p className="text-sm text-muted-foreground">Redeem value (currency per point)</p>
                  <p className="text-2xl font-semibold">{loyaltySettings ? loyaltySettings.redeemValue.toFixed(4) : "—"}</p>
                </div>
              </CardContent>
            </Card>

            <Dialog open={showEditSettings} onOpenChange={setShowEditSettings}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Update loyalty math</DialogTitle>
                  <DialogDescription>Adjust how quickly members earn or redeem points.</DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  {isAdmin && (
                    <div className="space-y-2">
                      <Label htmlFor="settings-scope">Apply changes to</Label>
                      <Select value={settingsScope} onValueChange={(value: "org" | "store") => setSettingsScope(value)}>
                        <SelectTrigger id="settings-scope">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="org">Organization default</SelectItem>
                          <SelectItem value="store" disabled={!activeStoreId}>
                            Selected store
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      {settingsScope === "store" && !activeStoreId && (
                        <p className="text-xs text-red-500">Select a store to override its rules.</p>
                      )}
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label htmlFor="earnRate">Earn rate (points per currency unit)</Label>
                    <Input
                      id="earnRate"
                      type="number"
                      min="0.0001"
                      step="0.0001"
                      value={settingsDraft.earnRate}
                      onChange={(e) => setSettingsDraft((prev) => ({ ...prev, earnRate: Number(e.target.value) || 0 }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="redeemValue">Redeem value (currency per point)</Label>
                    <Input
                      id="redeemValue"
                      type="number"
                      min="0.0001"
                      step="0.0001"
                      value={settingsDraft.redeemValue}
                      onChange={(e) => setSettingsDraft((prev) => ({ ...prev, redeemValue: Number(e.target.value) || 0 }))}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setShowEditSettings(false)}>
                    Cancel
                  </Button>
                  <Button onClick={() => updateSettingsMutation.mutate()} disabled={updateSettingsMutation.isPending}>
                    {updateSettingsMutation.isPending ? "Saving..." : "Save changes"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </TabsContent>

          <TabsContent value="transactions">
            <Card>
              <CardHeader>
                <CardTitle>Loyalty transactions</CardTitle>
                <CardDescription>Credits and redemptions recorded for this store.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Customer</TableHead>
                        <TableHead>Loyalty #</TableHead>
                        <TableHead className="text-right">Earned</TableHead>
                        <TableHead className="text-right">Redeemed</TableHead>
                        <TableHead className="text-right">Before</TableHead>
                        <TableHead className="text-right">After</TableHead>
                        <TableHead>Date</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {transactionsList.map((tx) => (
                        <TableRow key={tx.id}>
                          <TableCell>
                            <div className="font-medium">
                              {tx.customerFirstName || tx.customerLastName
                                ? `${tx.customerFirstName ?? ""} ${tx.customerLastName ?? ""}`.trim()
                                : "Unknown"}
                            </div>
                          </TableCell>
                          <TableCell>
                            {tx.loyaltyNumber ? <Badge variant="outline">{tx.loyaltyNumber}</Badge> : "—"}
                          </TableCell>
                          <TableCell className="text-right text-green-600 font-semibold">
                            {tx.pointsEarned > 0 ? `+${tx.pointsEarned}` : "0"}
                          </TableCell>
                          <TableCell className="text-right text-red-600 font-semibold">
                            {tx.pointsRedeemed > 0 ? `-${tx.pointsRedeemed}` : "0"}
                          </TableCell>
                          <TableCell className="text-right">{tx.pointsBefore.toLocaleString()}</TableCell>
                          <TableCell className="text-right">{tx.pointsAfter.toLocaleString()}</TableCell>
                          <TableCell>{new Date(tx.createdAt).toLocaleString()}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <div>
                    Showing page {transactionPage} of {transactionPages}
                  </div>
                  <div className="space-x-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setTransactionPage((p) => Math.max(1, p - 1))}
                      disabled={transactionPage === 1}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setTransactionPage((p) => Math.min(transactionPages, p + 1))}
                      disabled={transactionPage >= transactionPages}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
 
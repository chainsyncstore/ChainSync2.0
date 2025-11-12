import {
  Users,
  Crown,
  Plus,
  Search,
  Edit,
  Trash2,
  Award,
  TrendingUp,
  UserPlus,
  Coins,
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { getCsrfToken } from "@/lib/csrf";

interface Customer {
  id: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  loyaltyNumber: string;
  currentPoints: number;
  lifetimePoints: number;
  tier?: {
    id: string;
    name: string;
    color: string;
  };
  createdAt: string;
}

interface LoyaltyTier {
  id: string;
  name: string;
  description?: string;
  pointsRequired: number;
  discountPercentage: number;
  color: string;
  isActive: boolean;
}

interface LoyaltyTransaction {
  id: string;
  customer: {
    firstName: string;
    lastName: string;
  };
  pointsEarned: number;
  pointsRedeemed: number;
  pointsBefore: number;
  pointsAfter: number;
  tierBefore?: {
    name: string;
  };
  tierAfter?: {
    name: string;
  };
  createdAt: string;
}

export default function Loyalty() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [tiers, setTiers] = useState<LoyaltyTier[]>([]);
  const [transactions, setTransactions] = useState<LoyaltyTransaction[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [showAddCustomer, setShowAddCustomer] = useState(false);
  const [showAddTier, setShowAddTier] = useState(false);
  const [showEditSettings, setShowEditSettings] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Form states
  const [newCustomer, setNewCustomer] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
  });

  const [customerErrors, setCustomerErrors] = useState<Partial<typeof newCustomer>>({});

  const [newTier, setNewTier] = useState({
    name: "",
    description: "",
    pointsRequired: 0,
    discountPercentage: 0,
    color: "#6B7280",
  });

  const [settingsForm, setSettingsForm] = useState({
    earnRate: 1,
    redeemValue: 0.01,
  });

  type LoyaltySettings = { earnRate: number; redeemValue: number };

  const { data: loyaltySettings, isLoading: settingsLoading, error: loyaltySettingsError } = useQuery<LoyaltySettings>({
    queryKey: ["/api/loyalty/settings"],
    queryFn: async () => {
      const res = await fetch("/api/loyalty/settings", { credentials: "include" });
      if (!res.ok) {
        throw new Error("Failed to load loyalty settings");
      }
      return res.json() as Promise<LoyaltySettings>;
    },
  });

  useEffect(() => {
    if (loyaltySettings) {
      const resolved = loyaltySettings as LoyaltySettings;
      setSettingsForm({
        earnRate: Number(resolved.earnRate.toFixed(4)),
        redeemValue: Number(resolved.redeemValue.toFixed(4)),
      });
    }
  }, [loyaltySettings]);

  useEffect(() => {
    if (loyaltySettingsError) {
      toast({ title: "Error", description: loyaltySettingsError.message || "Unable to load loyalty settings", variant: "destructive" });
    }
  }, [loyaltySettingsError, toast]);

  const updateSettingsMutation = useMutation<LoyaltySettings, Error, LoyaltySettings>({
    mutationFn: async (payload) => {
      const csrfToken = await getCsrfToken();
      const res = await fetch("/api/loyalty/settings", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken,
        },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || "Failed to update loyalty settings");
      }
      return res.json() as Promise<LoyaltySettings>;
    },
    onSuccess: async (data) => {
      toast({ title: "Settings updated", description: "Loyalty earn and redeem values saved." });
      setShowEditSettings(false);
      setSettingsForm({
        earnRate: Number(data.earnRate.toFixed(4)),
        redeemValue: Number(data.redeemValue.toFixed(4)),
      });
      await queryClient.invalidateQueries({ queryKey: ["/api/loyalty/settings"] });
    },
    onError: (error: Error) => {
      toast({ title: "Update failed", description: error.message, variant: "destructive" });
    },
  });

  const isSavingSettings = updateSettingsMutation.isPending;

  const fetchLoyaltyData = useCallback(async () => {
    try {
      setIsLoading(true);
      // In a real app, these would be API calls
      // For now, we'll use mock data
      const mockCustomers: Customer[] = [
        {
          id: "1",
          firstName: "John",
          lastName: "Doe",
          email: "john.doe@email.com",
          phone: "+1-555-0123",
          loyaltyNumber: "LOY001",
          currentPoints: 1250,
          lifetimePoints: 2500,
          tier: { id: "1", name: "Silver", color: "#C0C0C0" },
          createdAt: "2024-01-15",
        },
        {
          id: "2",
          firstName: "Jane",
          lastName: "Smith",
          email: "jane.smith@email.com",
          phone: "+1-555-0456",
          loyaltyNumber: "LOY002",
          currentPoints: 3200,
          lifetimePoints: 5000,
          tier: { id: "2", name: "Gold", color: "#FFD700" },
          createdAt: "2024-01-10",
        },
        {
          id: "3",
          firstName: "Bob",
          lastName: "Johnson",
          email: "bob.johnson@email.com",
          phone: "+1-555-0789",
          loyaltyNumber: "LOY003",
          currentPoints: 450,
          lifetimePoints: 800,
          tier: { id: "1", name: "Silver", color: "#C0C0C0" },
          createdAt: "2024-02-01",
        },
      ];

      const mockTiers: LoyaltyTier[] = [
        {
          id: "1",
          name: "Bronze",
          description: "New customers start here",
          pointsRequired: 0,
          discountPercentage: 0,
          color: "#CD7F32",
          isActive: true,
        },
        {
          id: "2",
          name: "Silver",
          description: "Earn 5% discount on purchases",
          pointsRequired: 1000,
          discountPercentage: 5,
          color: "#C0C0C0",
          isActive: true,
        },
        {
          id: "3",
          name: "Gold",
          description: "Earn 10% discount on purchases",
          pointsRequired: 3000,
          discountPercentage: 10,
          color: "#FFD700",
          isActive: true,
        },
        {
          id: "4",
          name: "Platinum",
          description: "Earn 15% discount on purchases",
          pointsRequired: 10000,
          discountPercentage: 15,
          color: "#E5E4E2",
          isActive: true,
        },
      ];

      const mockTransactions: LoyaltyTransaction[] = [
        {
          id: "1",
          customer: { firstName: "John", lastName: "Doe" },
          pointsEarned: 150,
          pointsRedeemed: 0,
          pointsBefore: 1100,
          pointsAfter: 1250,
          tierBefore: { name: "Silver" },
          tierAfter: { name: "Silver" },
          createdAt: "2024-03-15T10:30:00Z",
        },
        {
          id: "2",
          customer: { firstName: "Jane", lastName: "Smith" },
          pointsEarned: 200,
          pointsRedeemed: 0,
          pointsBefore: 3000,
          pointsAfter: 3200,
          tierBefore: { name: "Gold" },
          tierAfter: { name: "Gold" },
          createdAt: "2024-03-14T15:45:00Z",
        },
      ];

      setCustomers(mockCustomers);
      setTiers(mockTiers);
      setTransactions(mockTransactions);
    } catch (error) {
      console.error("Failed to load loyalty program data", error);
      toast({
        title: "Error",
        description: "Failed to load loyalty program data",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void fetchLoyaltyData();
  }, [fetchLoyaltyData]);

  const filteredCustomers = customers.filter(
    (customer) =>
      customer.firstName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      customer.lastName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      customer.loyaltyNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      customer.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const validateCustomerForm = (): boolean => {
    const errors: Partial<typeof newCustomer> = {};

    // First name validation
    if (!newCustomer.firstName.trim()) {
      errors.firstName = "First name is required";
    } else if (newCustomer.firstName.length > 100) {
      errors.firstName = "First name must be less than 100 characters";
    } else if (!/^[a-zA-Z\s'-]+$/.test(newCustomer.firstName)) {
      errors.firstName = "First name can only contain letters, spaces, hyphens, and apostrophes";
    }

    // Last name validation
    if (!newCustomer.lastName.trim()) {
      errors.lastName = "Last name is required";
    } else if (newCustomer.lastName.length > 100) {
      errors.lastName = "Last name must be less than 100 characters";
    } else if (!/^[a-zA-Z\s'-]+$/.test(newCustomer.lastName)) {
      errors.lastName = "Last name can only contain letters, spaces, hyphens, and apostrophes";
    }

    // Email validation (optional but must be valid if provided)
    if (newCustomer.email.trim()) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newCustomer.email)) {
        errors.email = "Invalid email format";
      } else if (newCustomer.email.length > 255) {
        errors.email = "Email must be less than 255 characters";
      }
    }

    // Phone validation (optional but must be valid if provided)
    if (newCustomer.phone.trim()) {
      if (!/^[+]?\d{9,16}$/.test(newCustomer.phone.replace(/\s/g, ''))) {
        errors.phone = "Invalid phone number format";
      }
    }

    setCustomerErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleAddCustomer = async () => {
    if (!validateCustomerForm()) {
      toast({
        title: "Validation Error",
        description: "Please fix the errors in the form",
        variant: "destructive",
      });
      return;
    }

    try {
      // In a real app, this would be an API call
      const newCustomerData: Customer = {
        id: Date.now().toString(),
        ...newCustomer,
        loyaltyNumber: `LOY${String(customers.length + 1).padStart(3, "0")}`,
        currentPoints: 0,
        lifetimePoints: 0,
        tier: tiers.find(t => t.pointsRequired === 0),
        createdAt: new Date().toISOString().split("T")[0],
      };

      setCustomers([...customers, newCustomerData]);
      setNewCustomer({ firstName: "", lastName: "", email: "", phone: "" });
      setCustomerErrors({});
      setShowAddCustomer(false);
      toast({
        title: "Success",
        description: "Customer added successfully",
      });
    } catch (error) {
      console.error("Failed to add customer", error);
      toast({
        title: "Error",
        description: "Failed to add customer",
        variant: "destructive",
      });
    }
  };

  const handleAddTier = async () => {
    try {
      // In a real app, this would be an API call
      const newTierData: LoyaltyTier = {
        id: Date.now().toString(),
        ...newTier,
        isActive: true,
      };

      setTiers([...tiers, newTierData]);
      setNewTier({ name: "", description: "", pointsRequired: 0, discountPercentage: 0, color: "#6B7280" });
      setShowAddTier(false);
      toast({
        title: "Success",
        description: "Tier added successfully",
      });
    } catch (error) {
      console.error("Failed to add loyalty tier", error);
      toast({
        title: "Error",
        description: "Failed to add tier",
        variant: "destructive",
      });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Loyalty Program</h1>
          <p className="text-slate-600 mt-1">Manage customers, tiers, and loyalty points</p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Customers</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{customers.length}</div>
            <p className="text-xs text-muted-foreground">
              +12% from last month
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Tiers</CardTitle>
            <Crown className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{tiers.filter(t => t.isActive).length}</div>
            <p className="text-xs text-muted-foreground">
              {tiers.length} total tiers
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Points Issued</CardTitle>
            <Award className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {customers.reduce((sum, customer) => sum + customer.lifetimePoints, 0).toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground">
              Lifetime points across all customers
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Points/Customer</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {customers.length > 0 
                ? Math.round(customers.reduce((sum, customer) => sum + customer.currentPoints, 0) / customers.length)
                : 0
              }
            </div>
            <p className="text-xs text-muted-foreground">
              Current points average
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <Tabs defaultValue="customers" className="space-y-6">
        <TabsList>
          <TabsTrigger value="customers">Customers</TabsTrigger>
          <TabsTrigger value="tiers">Point Rules</TabsTrigger>
          <TabsTrigger value="transactions">Transactions</TabsTrigger>
        </TabsList>

        {/* Customers Tab */}
        <TabsContent value="customers" className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Customers</CardTitle>
                  <CardDescription>
                    Manage your loyalty program customers
                  </CardDescription>
                </div>
                <Dialog open={showAddCustomer} onOpenChange={setShowAddCustomer}>
                  <DialogTrigger asChild>
                    <Button>
                      <UserPlus className="h-4 w-4 mr-2" />
                      Add Customer
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Add New Customer</DialogTitle>
                      <DialogDescription>
                        Add a new customer to the loyalty program
                      </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="firstName">First Name</Label>
                          <Input
                            id="firstName"
                            value={newCustomer.firstName}
                            onChange={(e) => setNewCustomer({ ...newCustomer, firstName: e.target.value })}
                            className={customerErrors.firstName ? "border-red-500" : ""}
                          />
                          {customerErrors.firstName && (
                            <p className="text-red-500 text-xs">{customerErrors.firstName}</p>
                          )}
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="lastName">Last Name</Label>
                          <Input
                            id="lastName"
                            value={newCustomer.lastName}
                            onChange={(e) => setNewCustomer({ ...newCustomer, lastName: e.target.value })}
                            className={customerErrors.lastName ? "border-red-500" : ""}
                          />
                          {customerErrors.lastName && (
                            <p className="text-red-500 text-xs">{customerErrors.lastName}</p>
                          )}
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="email">Email</Label>
                        <Input
                          id="email"
                          type="email"
                          value={newCustomer.email}
                          onChange={(e) => setNewCustomer({ ...newCustomer, email: e.target.value })}
                          className={customerErrors.email ? "border-red-500" : ""}
                        />
                        {customerErrors.email && (
                          <p className="text-red-500 text-xs">{customerErrors.email}</p>
                        )}
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="phone">Phone</Label>
                        <Input
                          id="phone"
                          value={newCustomer.phone}
                          onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })}
                          className={customerErrors.phone ? "border-red-500" : ""}
                        />
                        {customerErrors.phone && (
                          <p className="text-red-500 text-xs">{customerErrors.phone}</p>
                        )}
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setShowAddCustomer(false)}>
                        Cancel
                      </Button>
                      <Button onClick={handleAddCustomer}>Add Customer</Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
              <div className="flex items-center space-x-2">
                <Search className="h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search customers..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="max-w-sm"
                />
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Customer</TableHead>
                    <TableHead>Loyalty #</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Current Points</TableHead>
                    <TableHead>Tier</TableHead>
                    <TableHead>Member Since</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredCustomers.map((customer) => (
                    <TableRow key={customer.id}>
                      <TableCell>
                        <div>
                          <div className="font-medium">
                            {customer.firstName} {customer.lastName}
                          </div>
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
                      <TableCell>
                        <div className="font-medium">{customer.currentPoints.toLocaleString()}</div>
                        <div className="text-sm text-muted-foreground">
                          {customer.lifetimePoints.toLocaleString()} lifetime
                        </div>
                      </TableCell>
                      <TableCell>
                        {customer.tier && (
                          <Badge 
                            style={{ backgroundColor: customer.tier.color, color: 'white' }}
                          >
                            {customer.tier.name}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {new Date(customer.createdAt).toLocaleDateString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Point Rules Tab */}
        <TabsContent value="tiers" className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Loyalty Point Rules</CardTitle>
                  <CardDescription>
                    Configure how points are earned and redeemed across the organization
                  </CardDescription>
                </div>
                <Button onClick={() => setShowEditSettings(true)} disabled={settingsLoading || !loyaltySettings}>
                  <Edit className="h-4 w-4 mr-2" />
                  Edit
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2">
                <Card className="border-primary/20 bg-primary/5">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-primary flex items-center gap-2">
                      <Coins className="h-4 w-4" /> Earn Rate
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-3xl font-semibold">
                      {settingsLoading ? "…" : `${settingsForm.earnRate.toFixed(4)} pts / currency unit`}
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Points awarded per unit of net spend (after discounts and redemptions)
                    </p>
                  </CardContent>
                </Card>
                <Card className="border-emerald-200 bg-emerald-50">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-emerald-700 flex items-center gap-2">
                      <Badge variant="secondary" className="bg-emerald-200 text-emerald-900">Redeem</Badge>
                      Redemption Value
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-3xl font-semibold text-emerald-800">
                      {settingsLoading ? "…" : `${settingsForm.redeemValue.toFixed(4)} currency / point`}
                    </p>
                    <p className="text-sm text-emerald-700 mt-1">
                      Multiplying points by this value determines the discount applied at checkout
                    </p>
                  </CardContent>
                </Card>
              </div>
            </CardContent>
          </Card>

          <Dialog open={showEditSettings} onOpenChange={setShowEditSettings}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Edit Loyalty Point Rules</DialogTitle>
                <DialogDescription>
                  Update how many points customers earn per currency unit and the redemption value per point.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="earnRate">Earn Rate (points per currency unit)</Label>
                  <Input
                    id="earnRate"
                    type="number"
                    step="0.0001"
                    min="0.0001"
                    value={settingsForm.earnRate}
                    onChange={(e) => setSettingsForm({ ...settingsForm, earnRate: Number(e.target.value) || 0 })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="redeemValue">Redeem Value (currency per point)</Label>
                  <Input
                    id="redeemValue"
                    type="number"
                    step="0.0001"
                    min="0.0001"
                    value={settingsForm.redeemValue}
                    onChange={(e) => setSettingsForm({ ...settingsForm, redeemValue: Number(e.target.value) || 0 })}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowEditSettings(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={() => updateSettingsMutation.mutate({
                    earnRate: settingsForm.earnRate,
                    redeemValue: settingsForm.redeemValue,
                  })}
                  disabled={isSavingSettings}
                >
                  {isSavingSettings ? "Saving..." : "Save Changes"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </TabsContent>

        {/* Transactions Tab */}
        <TabsContent value="transactions" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Loyalty Transactions</CardTitle>
              <CardDescription>
                Track points earned and redeemed by customers
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Customer</TableHead>
                    <TableHead>Points Earned</TableHead>
                    <TableHead>Points Redeemed</TableHead>
                    <TableHead>Points Before</TableHead>
                    <TableHead>Points After</TableHead>
                    <TableHead>Tier Change</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.map((transaction) => (
                    <TableRow key={transaction.id}>
                      <TableCell>
                        <div className="font-medium">
                          {transaction.customer.firstName} {transaction.customer.lastName}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-green-600 font-medium">
                          +{transaction.pointsEarned}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-red-600 font-medium">
                          {transaction.pointsRedeemed > 0 ? `-${transaction.pointsRedeemed}` : "0"}
                        </div>
                      </TableCell>
                      <TableCell>{transaction.pointsBefore.toLocaleString()}</TableCell>
                      <TableCell>{transaction.pointsAfter.toLocaleString()}</TableCell>
                      <TableCell>
                        {transaction.tierBefore?.name !== transaction.tierAfter?.name ? (
                          <div className="text-sm">
                            <div className="text-muted-foreground">{transaction.tierBefore?.name}</div>
                            <div className="font-medium">→ {transaction.tierAfter?.name}</div>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">No change</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {new Date(transaction.createdAt).toLocaleDateString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
} 
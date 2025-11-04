import { Loader2, Plus, ArrowLeft, ShieldAlert } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface StaffMember {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  role: string | null;
  createdAt?: string;
  createdBy: {
    id: string;
    name: string;
  } | null;
  canDelete: boolean;
}

interface StaffResponse {
  store: {
    id: string;
    name: string;
  };
  staff: StaffMember[];
}

interface CreateStaffPayload {
  firstName: string;
  lastName: string;
  email: string;
  role: "manager" | "cashier";
}

export default function StoreStaff() {
  const [, setLocation] = useLocation();
  const routeResult = useRoute<{ storeId: string }>("/stores/:storeId/staff");
  const { user } = useAuth();
  const { toast } = useToast();

  const storeId = Array.isArray(routeResult) && routeResult[0] ? routeResult[1].storeId : undefined;

  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [storeName, setStoreName] = useState<string>("");
  const [credentials, setCredentials] = useState<{ email: string; password: string } | null>(null);
  const [form, setForm] = useState<CreateStaffPayload>({
    firstName: "",
    lastName: "",
    email: "",
    role: "cashier",
  });

  const effectiveRole = useMemo(() => {
    if (!user) return "";
    if (user.isAdmin) return "admin";
    return (user.role || "").toLowerCase();
  }, [user]);

  const allowedRoles = useMemo<ReadonlyArray<{ label: string; value: CreateStaffPayload["role"] }>>(() => {
    if (effectiveRole === "admin") {
      return [
        { label: "Manager", value: "manager" },
        { label: "Cashier", value: "cashier" },
      ];
    }
    if (effectiveRole === "manager") {
      return [{ label: "Cashier", value: "cashier" }];
    }
    return [];
  }, [effectiveRole]);

  const canCreate = allowedRoles.length > 0;

  const loadStaff = useCallback(async () => {
    if (!storeId) {
      return;
    }
    setIsLoading(true);
    try {
      const response = await fetch(`/api/stores/${storeId}/staff`, { credentials: "include" });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      const payload: StaffResponse = await response.json();
      setStaff(payload.staff);
      setStoreName(payload.store.name);
    } catch (error) {
      console.error("Failed to load staff", error);
      toast({
        title: "Failed to load staff",
        description: "Check your permissions or try again later.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [storeId, toast]);

  useEffect(() => {
    void loadStaff();
  }, [loadStaff]);

  const handleInputChange = (field: keyof CreateStaffPayload, value: string) => {
    setForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const resetForm = () => {
    const defaultRole: CreateStaffPayload["role"] = allowedRoles[0]?.value ?? "cashier";
    setForm({
      firstName: "",
      lastName: "",
      email: "",
      role: defaultRole,
    });
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!storeId) return;
    setIsSubmitting(true);
    setCredentials(null);
    try {
      const response = await fetch(`/api/stores/${storeId}/staff`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(form),
      });

      if (!response.ok) {
        const detail = await response.json().catch(() => ({}));
        const message = detail?.error || detail?.message || "Failed to create staff member";
        throw new Error(message);
      }

      const payload = await response.json();
      setStaff((prev) => [payload.staff, ...prev]);
      if (payload.credentials) {
        setCredentials(payload.credentials);
      }
      toast({ title: "Staff member created", description: `${payload.staff.email} can now sign in.` });
      resetForm();
    } catch (error: any) {
      console.error('Failed to create staff member', error);
      toast({
        title: "Creation failed",
        description: error.message || "Unable to create staff member",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (member: StaffMember) => {
    if (!storeId) return;
    const confirmation = window.confirm(
      `Are you sure you want to remove ${member.email || "this staff member"}? This will deactivate their access.`
    );
    if (!confirmation) return;

    try {
      const response = await fetch(`/api/stores/${storeId}/staff/${member.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!response.ok) {
        const detail = await response.json().catch(() => ({}));
        const message = detail?.error || detail?.message || "Failed to delete staff member";
        throw new Error(message);
      }
      toast({ title: "Staff member removed" });
      setStaff((prev) => prev.filter((item) => item.id !== member.id));
    } catch (error: any) {
      console.error('Failed to delete staff member', member.id, error);
      toast({
        title: "Removal failed",
        description: error.message || "Unable to delete staff member",
        variant: "destructive",
      });
    }
  };

  const renderRoleBadge = (role: string | null) => {
    const normalized = (role || "").toLowerCase();
    const base = "px-2 py-1 text-xs font-medium rounded-full";
    switch (normalized) {
      case "manager":
        return <span className={cn(base, "bg-blue-100 text-blue-700")}>Manager</span>;
      case "cashier":
        return <span className={cn(base, "bg-emerald-100 text-emerald-700")}>Cashier</span>;
      default:
        return <span className={cn(base, "bg-gray-100 text-gray-700")}>{normalized || "staff"}</span>;
    }
  };

  const canViewCredentials = credentials !== null;

  return (
    <div className="container mx-auto p-6 space-y-6">
      <Button variant="ghost" className="flex items-center gap-2 pl-0" onClick={() => setLocation("/multi-store")}>
        <ArrowLeft className="h-4 w-4" /> Back to Multi-Store
      </Button>

      <div className="space-y-1">
        <h1 className="text-3xl font-bold">Store Staff</h1>
        <p className="text-muted-foreground">
          Manage team members assigned to {storeName || "this store"}. Admins can create managers or cashiers, while managers can only
          create cashiers.
        </p>
      </div>

      {canCreate ? (
        <Card>
          <CardHeader>
            <CardTitle>Add Staff Member</CardTitle>
            <CardDescription>Invite a new team member. Credentials will be generated automatically.</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="grid gap-4 md:grid-cols-2" onSubmit={handleSubmit}>
              <div className="space-y-2">
                <Label htmlFor="firstName">First name</Label>
                <Input
                  id="firstName"
                  value={form.firstName}
                  onChange={(e) => handleInputChange("firstName", e.target.value)}
                  placeholder="Ada"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">Last name</Label>
                <Input
                  id="lastName"
                  value={form.lastName}
                  onChange={(e) => handleInputChange("lastName", e.target.value)}
                  placeholder="Obi"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={form.email}
                  onChange={(e) => handleInputChange("email", e.target.value)}
                  placeholder="ada@example.com"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="role">Role</Label>
                <Select value={form.role} onValueChange={(value) => handleInputChange("role", value)}>
                  <SelectTrigger id="role">
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent>
                    {allowedRoles.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="md:col-span-2 flex items-center justify-between">
                <Button type="submit" disabled={isSubmitting} className="flex items-center gap-2">
                  {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  {isSubmitting ? "Creating..." : "Create Staff"}
                </Button>
                <p className="text-xs text-muted-foreground">
                  Passwords are randomly generated. Share credentials securely with the new staff member.
                </p>
              </div>
            </form>

            {canViewCredentials && credentials && (
              <Card className="mt-6 border-dashed">
                <CardHeader>
                  <CardTitle className="text-base">Temporary Credentials</CardTitle>
                  <CardDescription>Save these credentials securely. They will not be shown again.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex flex-col md:flex-row md:items-center md:gap-4">
                    <div>
                      <Label>Email</Label>
                      <p className="font-medium">{credentials.email}</p>
                    </div>
                    <div>
                      <Label>Password</Label>
                      <p className="font-mono">{credentials.password}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card className="border-dashed">
          <CardHeader className="flex flex-row items-start justify-between">
            <div>
              <CardTitle>Staff creation restricted</CardTitle>
              <CardDescription>Your role does not permit inviting staff members. Contact an administrator.</CardDescription>
            </div>
            <ShieldAlert className="h-6 w-6 text-amber-500" />
          </CardHeader>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Team Members</CardTitle>
          <CardDescription>Staff linked to this store with their roles and creators.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading staff...
            </div>
          ) : staff.length === 0 ? (
            <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              No staff members yet. {canCreate ? "Invite your first team member using the form above." : "Staff will appear here when added."}
            </div>
          ) : (
            <div className="space-y-4">
              <Tabs defaultValue="list" className="space-y-4">
                <TabsList>
                  <TabsTrigger value="list">List View</TabsTrigger>
                </TabsList>
                <TabsContent value="list">
                  <div className="overflow-x-auto rounded-lg border">
                    <table className="min-w-full divide-y divide-border">
                      <thead className="bg-muted/30">
                        <tr>
                          <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Name</th>
                          <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Email</th>
                          <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Role</th>
                          <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Invited By</th>
                          <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {staff.map((member) => {
                          const fullName = [member.firstName, member.lastName].filter(Boolean).join(" ") || "—";
                          return (
                            <tr key={member.id}>
                              <td className="px-4 py-3 text-sm font-medium text-foreground">{fullName}</td>
                              <td className="px-4 py-3 text-sm text-muted-foreground">{member.email || "—"}</td>
                              <td className="px-4 py-3 text-sm">{renderRoleBadge(member.role)}</td>
                              <td className="px-4 py-3 text-sm text-muted-foreground">
                                {member.createdBy ? member.createdBy.name : "—"}
                              </td>
                              <td className="px-4 py-3 text-sm">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  disabled={!member.canDelete}
                                  onClick={() => handleDelete(member)}
                                >
                                  Remove
                                </Button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

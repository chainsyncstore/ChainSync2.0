import { useQuery } from "@tanstack/react-query";
import { Tag } from "lucide-react";
import { useState } from "react";

import { PromotionManagement } from "@/components/inventory/promotion-management";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/use-auth";
import type { Store } from "@shared/schema";

export default function Promotions() {
    const { user } = useAuth();
    // Roles are normalized to lowercase in useAuth
    const isAdmin = user?.role === "admin";
    const isManager = user?.role === "manager";
    const userStoreId = user?.storeId;

    const [selectedStoreId, setSelectedStoreId] = useState<string | undefined>(
        isManager && userStoreId ? userStoreId : undefined
    );

    // Fetch stores for admin users
    const { data: stores = [] } = useQuery<Store[]>({
        queryKey: ["/api/stores"],
        enabled: isAdmin,
    });

    // Determine effective store ID
    const effectiveStoreId = isManager && userStoreId ? userStoreId : selectedStoreId;

    // Don't allow access for cashiers
    if (!isAdmin && !isManager) {
        return (
            <div className="space-y-6">
                <Card>
                    <CardContent className="py-12 text-center">
                        <Tag className="mx-auto h-12 w-12 text-muted-foreground/50" />
                        <h3 className="mt-4 text-lg font-medium">Access Denied</h3>
                        <p className="text-sm text-muted-foreground">
                            You don&apos;t have permission to access promotions management.
                        </p>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Page Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
                        <Tag className="h-6 w-6 text-primary" />
                        Promotions
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        Create and manage discounts and bundle deals for your products
                    </p>
                </div>

                {/* Store Selector for Admins */}
                {isAdmin && stores.length > 0 && (
                    <div className="w-full sm:w-64">
                        <Select
                            value={selectedStoreId || "all"}
                            onValueChange={(v) => setSelectedStoreId(v === "all" ? undefined : v)}
                        >
                            <SelectTrigger>
                                <SelectValue placeholder="All stores" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All stores (organization-wide)</SelectItem>
                                {stores.map((store) => (
                                    <SelectItem key={store.id} value={store.id}>
                                        {store.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                )}
            </div>

            {/* Manager without store assignment */}
            {isManager && !userStoreId && (
                <Card>
                    <CardContent className="py-8 text-center">
                        <p className="text-muted-foreground">
                            You need to be assigned to a store to manage promotions.
                        </p>
                    </CardContent>
                </Card>
            )}

            {/* Promotion Management Component */}
            {(isAdmin || (isManager && userStoreId)) && (
                <PromotionManagement
                    storeId={effectiveStoreId}
                    stores={isAdmin ? stores : []}
                    isAdmin={isAdmin}
                />
            )}
        </div>
    );
}

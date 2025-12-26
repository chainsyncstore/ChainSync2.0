import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
    Calendar,
    ChevronDown,
    ChevronUp,
    Edit,
    Gift,
    Percent,
    Plus,
    Search,
    Tag,
    Trash2,
} from "lucide-react";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { getCsrfToken } from "@/lib/csrf";
import type { Promotion, Product, Store } from "@shared/schema";

type PromotionScope = "all_products" | "category" | "specific_products";
type PromotionType = "percentage" | "bundle";
type PromotionStatus = "draft" | "scheduled" | "active" | "expired" | "cancelled";

interface PromotionWithProducts extends Promotion {
    products?: Array<{
        id: string;
        productId: string;
        customDiscountPercent?: string | null;
        productName: string;
        productSku?: string | null;
        productBarcode?: string | null;
        productCategory?: string | null;
    }>;
}

interface PromotionManagementProps {
    storeId?: string;
    stores?: Store[];
    isAdmin?: boolean;
}

const STATUS_COLORS: Record<PromotionStatus, "default" | "secondary" | "destructive" | "outline"> = {
    draft: "outline",
    scheduled: "secondary",
    active: "default",
    expired: "destructive",
    cancelled: "destructive",
};

const STATUS_LABELS: Record<PromotionStatus, string> = {
    draft: "Draft",
    scheduled: "Scheduled",
    active: "Active",
    expired: "Expired",
    cancelled: "Cancelled",
};

export function PromotionManagement({ storeId, stores = [], isAdmin = false }: PromotionManagementProps) {
    const queryClient = useQueryClient();
    const { toast } = useToast();

    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingPromotion, setEditingPromotion] = useState<PromotionWithProducts | null>(null);
    const [expandedPromotions, setExpandedPromotions] = useState<Set<string>>(new Set());

    // Form state
    const [formData, setFormData] = useState({
        name: "",
        description: "",
        promotionType: "percentage" as PromotionType,
        scope: "all_products" as PromotionScope,
        categoryFilter: "",
        discountPercent: "",
        bundleBuyQuantity: "",
        bundleGetQuantity: "",
        perProductPricing: false,
        startsAt: "",
        endsAt: "",
        storeId: storeId || "",
        productIds: [] as string[],
        productDiscounts: {} as Record<string, string>,
    });

    const [productSearchQuery, setProductSearchQuery] = useState("");
    const [showProductSelector, setShowProductSelector] = useState(false);

    // Fetch promotions
    const { data: promotions = [], isLoading } = useQuery<PromotionWithProducts[]>({
        queryKey: ["/api/promotions", storeId],
        queryFn: async () => {
            const params = new URLSearchParams();
            if (storeId) params.set("storeId", storeId);
            params.set("includeExpired", "true");
            const res = await fetch(`/api/promotions?${params.toString()}`, { credentials: "include" });
            if (!res.ok) throw new Error("Failed to fetch promotions");
            return res.json();
        },
    });

    // Fetch categories
    const { data: categories = [] } = useQuery<string[]>({
        queryKey: ["/api/products/categories"],
    });

    // Fetch products for selection
    const { data: allProducts = [] } = useQuery<Product[]>({
        queryKey: ["/api/products"],
        enabled: showProductSelector || formData.scope === "specific_products",
    });

    // Create/Update mutation
    const saveMutation = useMutation({
        mutationFn: async (data: typeof formData) => {
            const csrfToken = await getCsrfToken();
            const url = editingPromotion ? `/api/promotions/${editingPromotion.id}` : "/api/promotions";
            const method = editingPromotion ? "PUT" : "POST";

            const payload = {
                ...data,
                discountPercent: data.discountPercent ? Number(data.discountPercent) : null,
                bundleBuyQuantity: data.bundleBuyQuantity ? Number(data.bundleBuyQuantity) : null,
                bundleGetQuantity: data.bundleGetQuantity ? Number(data.bundleGetQuantity) : null,
                storeId: data.storeId || null,
                productDiscounts: Object.fromEntries(
                    Object.entries(data.productDiscounts)
                        .filter(([, v]) => v)
                        .map(([k, v]) => [k, Number(v)])
                ),
            };

            const res = await fetch(url, {
                method,
                credentials: "include",
                headers: {
                    "Content-Type": "application/json",
                    "X-CSRF-Token": csrfToken,
                },
                body: JSON.stringify(payload),
            });

            if (!res.ok) {
                const error = await res.json().catch(() => ({ error: "Failed to save promotion" }));
                throw new Error(error.error || "Failed to save promotion");
            }

            return res.json();
        },
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ["/api/promotions"] });
            setIsDialogOpen(false);
            resetForm();
            toast({
                title: editingPromotion ? "Promotion updated" : "Promotion created",
                description: `The promotion has been ${editingPromotion ? "updated" : "created"} successfully.`,
            });
        },
        onError: (error: Error) => {
            toast({
                title: "Error",
                description: error.message,
                variant: "destructive",
            });
        },
    });

    // Delete mutation
    const deleteMutation = useMutation({
        mutationFn: async (promotionId: string) => {
            const csrfToken = await getCsrfToken();
            const res = await fetch(`/api/promotions/${promotionId}`, {
                method: "DELETE",
                credentials: "include",
                headers: { "X-CSRF-Token": csrfToken },
            });
            if (!res.ok) throw new Error("Failed to cancel promotion");
            return res.json();
        },
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ["/api/promotions"] });
            toast({
                title: "Promotion cancelled",
                description: "The promotion has been cancelled.",
            });
        },
        onError: () => {
            toast({
                title: "Error",
                description: "Failed to cancel promotion",
                variant: "destructive",
            });
        },
    });

    const resetForm = () => {
        setFormData({
            name: "",
            description: "",
            promotionType: "percentage",
            scope: "all_products",
            categoryFilter: "",
            discountPercent: "",
            bundleBuyQuantity: "",
            bundleGetQuantity: "",
            perProductPricing: false,
            startsAt: "",
            endsAt: "",
            storeId: storeId || "",
            productIds: [],
            productDiscounts: {},
        });
        setEditingPromotion(null);
        setShowProductSelector(false);
        setProductSearchQuery("");
    };

    const openCreateDialog = () => {
        resetForm();
        // Set default dates (today + 7 days)
        const now = new Date();
        const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
        setFormData((prev) => ({
            ...prev,
            startsAt: now.toISOString().slice(0, 16),
            endsAt: nextWeek.toISOString().slice(0, 16),
        }));
        setIsDialogOpen(true);
    };

    const openEditDialog = async (promotion: Promotion) => {
        // Fetch full promotion with products
        try {
            const res = await fetch(`/api/promotions/${promotion.id}`, { credentials: "include" });
            if (!res.ok) throw new Error("Failed to fetch promotion details");
            const fullPromotion: PromotionWithProducts = await res.json();

            setEditingPromotion(fullPromotion);
            setFormData({
                name: fullPromotion.name,
                description: fullPromotion.description || "",
                promotionType: fullPromotion.promotionType as PromotionType,
                scope: fullPromotion.scope as PromotionScope,
                categoryFilter: fullPromotion.categoryFilter || "",
                discountPercent: fullPromotion.discountPercent || "",
                bundleBuyQuantity: fullPromotion.bundleBuyQuantity?.toString() || "",
                bundleGetQuantity: fullPromotion.bundleGetQuantity?.toString() || "",
                perProductPricing: fullPromotion.perProductPricing,
                startsAt: new Date(fullPromotion.startsAt).toISOString().slice(0, 16),
                endsAt: new Date(fullPromotion.endsAt).toISOString().slice(0, 16),
                storeId: fullPromotion.storeId || "",
                productIds: fullPromotion.products?.map((p) => p.productId) || [],
                productDiscounts: Object.fromEntries(
                    fullPromotion.products?.map((p) => [p.productId, p.customDiscountPercent || ""]) || []
                ),
            });
            setIsDialogOpen(true);
        } catch {
            toast({
                title: "Error",
                description: "Failed to load promotion details",
                variant: "destructive",
            });
        }
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        saveMutation.mutate(formData);
    };

    const toggleProductSelection = (productId: string) => {
        setFormData((prev) => {
            const isSelected = prev.productIds.includes(productId);
            return {
                ...prev,
                productIds: isSelected
                    ? prev.productIds.filter((id) => id !== productId)
                    : [...prev.productIds, productId],
            };
        });
    };

    const filteredProducts = useMemo(() => {
        if (!productSearchQuery.trim()) return allProducts;
        const query = productSearchQuery.toLowerCase();
        return allProducts.filter(
            (p) =>
                p.name.toLowerCase().includes(query) ||
                p.sku?.toLowerCase().includes(query) ||
                p.barcode?.toLowerCase().includes(query)
        );
    }, [allProducts, productSearchQuery]);

    const categoryProducts = useMemo(() => {
        if (formData.scope !== "category" || !formData.categoryFilter) return [];
        return allProducts.filter((p) => p.category === formData.categoryFilter);
    }, [allProducts, formData.scope, formData.categoryFilter]);

    const toggleExpanded = (id: string) => {
        setExpandedPromotions((prev) => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };

    // Group promotions by status
    const groupedPromotions = useMemo(() => {
        const groups: Record<PromotionStatus, PromotionWithProducts[]> = {
            active: [],
            scheduled: [],
            draft: [],
            expired: [],
            cancelled: [],
        };
        for (const promo of promotions) {
            const status = promo.status as PromotionStatus;
            if (groups[status]) {
                groups[status].push(promo);
            }
        }
        return groups;
    }, [promotions]);

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-semibold">Promotions</h2>
                    <p className="text-sm text-muted-foreground">
                        Create and manage discounts and bundle deals for your products
                    </p>
                </div>
                <Button onClick={openCreateDialog}>
                    <Plus className="mr-2 h-4 w-4" />
                    Create Promotion
                </Button>
            </div>

            {/* Active Promotions */}
            {groupedPromotions.active.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Tag className="h-5 w-5 text-green-500" />
                            Active Promotions
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        {groupedPromotions.active.map((promo) => (
                            <PromotionCard
                                key={promo.id}
                                promotion={promo}
                                isExpanded={expandedPromotions.has(promo.id)}
                                onToggle={() => toggleExpanded(promo.id)}
                                onEdit={() => openEditDialog(promo)}
                                onDelete={() => deleteMutation.mutate(promo.id)}
                            />
                        ))}
                    </CardContent>
                </Card>
            )}

            {/* Scheduled Promotions */}
            {groupedPromotions.scheduled.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Calendar className="h-5 w-5 text-blue-500" />
                            Scheduled Promotions
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        {groupedPromotions.scheduled.map((promo) => (
                            <PromotionCard
                                key={promo.id}
                                promotion={promo}
                                isExpanded={expandedPromotions.has(promo.id)}
                                onToggle={() => toggleExpanded(promo.id)}
                                onEdit={() => openEditDialog(promo)}
                                onDelete={() => deleteMutation.mutate(promo.id)}
                            />
                        ))}
                    </CardContent>
                </Card>
            )}

            {/* No active promotions */}
            {groupedPromotions.active.length === 0 && groupedPromotions.scheduled.length === 0 && !isLoading && (
                <Card>
                    <CardContent className="py-12 text-center">
                        <Tag className="mx-auto h-12 w-12 text-muted-foreground/50" />
                        <h3 className="mt-4 text-lg font-medium">No active promotions</h3>
                        <p className="text-sm text-muted-foreground">
                            Create your first promotion to start offering discounts to customers.
                        </p>
                        <Button onClick={openCreateDialog} className="mt-4">
                            <Plus className="mr-2 h-4 w-4" />
                            Create Promotion
                        </Button>
                    </CardContent>
                </Card>
            )}

            {/* Expired/Cancelled Promotions (collapsed by default) */}
            {(groupedPromotions.expired.length > 0 || groupedPromotions.cancelled.length > 0) && (
                <details className="group">
                    <summary className="cursor-pointer list-none">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
                            <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
                            Past promotions ({groupedPromotions.expired.length + groupedPromotions.cancelled.length})
                        </div>
                    </summary>
                    <div className="mt-3 space-y-3">
                        {[...groupedPromotions.expired, ...groupedPromotions.cancelled].map((promo) => (
                            <PromotionCard
                                key={promo.id}
                                promotion={promo}
                                isExpanded={expandedPromotions.has(promo.id)}
                                onToggle={() => toggleExpanded(promo.id)}
                                onEdit={() => openEditDialog(promo)}
                                onDelete={() => deleteMutation.mutate(promo.id)}
                                disabled
                            />
                        ))}
                    </div>
                </details>
            )}

            {/* Create/Edit Dialog */}
            <Dialog open={isDialogOpen} onOpenChange={(open) => { if (!open) resetForm(); setIsDialogOpen(open); }}>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>{editingPromotion ? "Edit Promotion" : "Create Promotion"}</DialogTitle>
                        <DialogDescription>
                            {editingPromotion
                                ? "Update the promotion details below."
                                : "Set up a new promotion with discounts or bundle deals."}
                        </DialogDescription>
                    </DialogHeader>

                    <form onSubmit={handleSubmit} className="space-y-6">
                        {/* Basic Info */}
                        <div className="space-y-4">
                            <div className="grid gap-4 sm:grid-cols-2">
                                <div className="space-y-2">
                                    <Label htmlFor="name">Promotion Name *</Label>
                                    <Input
                                        id="name"
                                        value={formData.name}
                                        onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))}
                                        placeholder="e.g., Summer Sale 20% Off"
                                        required
                                    />
                                </div>

                                {isAdmin && stores.length > 0 && (
                                    <div className="space-y-2">
                                        <Label htmlFor="store">Store</Label>
                                        <Select
                                            value={formData.storeId || "all"}
                                            onValueChange={(v) => setFormData((p) => ({ ...p, storeId: v === "all" ? "" : v }))}
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

                            <div className="space-y-2">
                                <Label htmlFor="description">Description</Label>
                                <Textarea
                                    id="description"
                                    value={formData.description}
                                    onChange={(e) => setFormData((p) => ({ ...p, description: e.target.value }))}
                                    placeholder="Brief description of the promotion..."
                                    rows={2}
                                />
                            </div>
                        </div>

                        {/* Promotion Type */}
                        <div className="space-y-4">
                            <Label>Promotion Type *</Label>
                            <div className="grid gap-3 sm:grid-cols-2">
                                <button
                                    type="button"
                                    className={`flex items-center gap-3 rounded-lg border p-4 text-left transition-colors hover:bg-accent ${formData.promotionType === "percentage" ? "border-primary bg-primary/5" : ""
                                        }`}
                                    onClick={() => setFormData((p) => ({ ...p, promotionType: "percentage" }))}
                                >
                                    <Percent className="h-8 w-8 text-primary" />
                                    <div>
                                        <div className="font-medium">Percentage Off</div>
                                        <div className="text-sm text-muted-foreground">Discount by a percentage</div>
                                    </div>
                                </button>

                                <button
                                    type="button"
                                    className={`flex items-center gap-3 rounded-lg border p-4 text-left transition-colors hover:bg-accent ${formData.promotionType === "bundle" ? "border-primary bg-primary/5" : ""
                                        }`}
                                    onClick={() => setFormData((p) => ({ ...p, promotionType: "bundle" }))}
                                >
                                    <Gift className="h-8 w-8 text-primary" />
                                    <div>
                                        <div className="font-medium">Bundle Deal</div>
                                        <div className="text-sm text-muted-foreground">Buy X get Y free</div>
                                    </div>
                                </button>
                            </div>
                        </div>

                        {/* Discount Configuration */}
                        <div className="space-y-4">
                            {formData.promotionType === "percentage" && (
                                <div className="space-y-2">
                                    <Label htmlFor="discount">Discount Percentage *</Label>
                                    <div className="flex items-center gap-2">
                                        <Input
                                            id="discount"
                                            type="number"
                                            min="0.01"
                                            max="100"
                                            step="0.01"
                                            value={formData.discountPercent}
                                            onChange={(e) => setFormData((p) => ({ ...p, discountPercent: e.target.value }))}
                                            placeholder="e.g., 20"
                                            className="w-32"
                                            required={formData.promotionType === "percentage"}
                                        />
                                        <span className="text-muted-foreground">%</span>
                                    </div>
                                </div>
                            )}

                            {formData.promotionType === "bundle" && (
                                <div className="grid gap-4 sm:grid-cols-2">
                                    <div className="space-y-2">
                                        <Label htmlFor="buyQty">Buy Quantity *</Label>
                                        <Input
                                            id="buyQty"
                                            type="number"
                                            min="1"
                                            value={formData.bundleBuyQuantity}
                                            onChange={(e) => setFormData((p) => ({ ...p, bundleBuyQuantity: e.target.value }))}
                                            placeholder="e.g., 2"
                                            required={formData.promotionType === "bundle"}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="getQty">Get Free Quantity *</Label>
                                        <Input
                                            id="getQty"
                                            type="number"
                                            min="1"
                                            value={formData.bundleGetQuantity}
                                            onChange={(e) => setFormData((p) => ({ ...p, bundleGetQuantity: e.target.value }))}
                                            placeholder="e.g., 1"
                                            required={formData.promotionType === "bundle"}
                                        />
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Product Selection Scope */}
                        <div className="space-y-4">
                            <Label>Apply To *</Label>
                            <Select
                                value={formData.scope}
                                onValueChange={(v) => setFormData((p) => ({ ...p, scope: v as PromotionScope, productIds: [], categoryFilter: "" }))}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all_products">All Products</SelectItem>
                                    <SelectItem value="category">Specific Category</SelectItem>
                                    <SelectItem value="specific_products">Select Products</SelectItem>
                                </SelectContent>
                            </Select>

                            {/* Category Selection */}
                            {formData.scope === "category" && (
                                <div className="space-y-2">
                                    <Label>Category *</Label>
                                    <Select
                                        value={formData.categoryFilter}
                                        onValueChange={(v) => setFormData((p) => ({ ...p, categoryFilter: v, productIds: [] }))}
                                    >
                                        <SelectTrigger>
                                            <SelectValue placeholder="Select a category" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {categories.map((cat) => (
                                                <SelectItem key={cat} value={cat}>
                                                    {cat}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>

                                    {formData.categoryFilter && (
                                        <div className="mt-4">
                                            <div className="flex items-center justify-between">
                                                <Label className="text-sm">Select specific products (optional)</Label>
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => setShowProductSelector(!showProductSelector)}
                                                >
                                                    {showProductSelector ? "Hide" : "Show"} products
                                                </Button>
                                            </div>
                                            {showProductSelector && (
                                                <div className="mt-2 max-h-48 space-y-1 overflow-y-auto rounded border p-2">
                                                    {categoryProducts.map((product) => (
                                                        <label
                                                            key={product.id}
                                                            className="flex cursor-pointer items-center gap-2 rounded p-1 hover:bg-accent"
                                                        >
                                                            <Checkbox
                                                                checked={formData.productIds.includes(product.id)}
                                                                onCheckedChange={() => toggleProductSelection(product.id)}
                                                            />
                                                            <span className="text-sm">{product.name}</span>
                                                            {product.sku && (
                                                                <span className="text-xs text-muted-foreground">({product.sku})</span>
                                                            )}
                                                        </label>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Specific Products Selection */}
                            {formData.scope === "specific_products" && (
                                <div className="space-y-2">
                                    <div className="flex items-center gap-2">
                                        <Search className="h-4 w-4 text-muted-foreground" />
                                        <Input
                                            placeholder="Search products..."
                                            value={productSearchQuery}
                                            onChange={(e) => setProductSearchQuery(e.target.value)}
                                            className="flex-1"
                                        />
                                    </div>
                                    <div className="max-h-60 space-y-1 overflow-y-auto rounded border p-2">
                                        {filteredProducts.map((product) => (
                                            <label
                                                key={product.id}
                                                className="flex cursor-pointer items-center gap-2 rounded p-1 hover:bg-accent"
                                            >
                                                <Checkbox
                                                    checked={formData.productIds.includes(product.id)}
                                                    onCheckedChange={() => toggleProductSelection(product.id)}
                                                />
                                                <span className="text-sm">{product.name}</span>
                                                {product.sku && (
                                                    <span className="text-xs text-muted-foreground">({product.sku})</span>
                                                )}
                                            </label>
                                        ))}
                                        {filteredProducts.length === 0 && (
                                            <div className="py-4 text-center text-sm text-muted-foreground">
                                                No products found
                                            </div>
                                        )}
                                    </div>
                                    {formData.productIds.length > 0 && (
                                        <p className="text-sm text-muted-foreground">
                                            {formData.productIds.length} product(s) selected
                                        </p>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Per-product pricing toggle */}
                        {formData.promotionType === "percentage" && formData.productIds.length > 0 && (
                            <div className="space-y-4">
                                <div className="flex items-center gap-2">
                                    <Checkbox
                                        id="perProduct"
                                        checked={formData.perProductPricing}
                                        onCheckedChange={(checked) =>
                                            setFormData((p) => ({ ...p, perProductPricing: !!checked }))
                                        }
                                    />
                                    <Label htmlFor="perProduct" className="cursor-pointer">
                                        Set different discount per product
                                    </Label>
                                </div>

                                {formData.perProductPricing && (
                                    <div className="max-h-40 space-y-2 overflow-y-auto rounded border p-3">
                                        {formData.productIds.map((productId) => {
                                            const product = allProducts.find((p) => p.id === productId);
                                            return (
                                                <div key={productId} className="flex items-center gap-2">
                                                    <span className="min-w-0 flex-1 truncate text-sm">
                                                        {product?.name || productId}
                                                    </span>
                                                    <Input
                                                        type="number"
                                                        min="0.01"
                                                        max="100"
                                                        step="0.01"
                                                        value={formData.productDiscounts[productId] || ""}
                                                        onChange={(e) =>
                                                            setFormData((p) => ({
                                                                ...p,
                                                                productDiscounts: {
                                                                    ...p.productDiscounts,
                                                                    [productId]: e.target.value,
                                                                },
                                                            }))
                                                        }
                                                        placeholder={formData.discountPercent || "Discount %"}
                                                        className="w-24"
                                                    />
                                                    <span className="text-sm text-muted-foreground">%</span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Date Range */}
                        <div className="grid gap-4 sm:grid-cols-2">
                            <div className="space-y-2">
                                <Label htmlFor="startsAt">Start Date *</Label>
                                <Input
                                    id="startsAt"
                                    type="datetime-local"
                                    value={formData.startsAt}
                                    onChange={(e) => setFormData((p) => ({ ...p, startsAt: e.target.value }))}
                                    required
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="endsAt">End Date *</Label>
                                <Input
                                    id="endsAt"
                                    type="datetime-local"
                                    value={formData.endsAt}
                                    onChange={(e) => setFormData((p) => ({ ...p, endsAt: e.target.value }))}
                                    required
                                />
                            </div>
                        </div>

                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                                Cancel
                            </Button>
                            <Button type="submit" disabled={saveMutation.isPending}>
                                {saveMutation.isPending ? "Saving..." : editingPromotion ? "Update" : "Create"}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </div>
    );
}

// Promotion Card Component
function PromotionCard({
    promotion,
    isExpanded,
    onToggle,
    onEdit,
    onDelete,
    disabled = false,
}: {
    promotion: PromotionWithProducts;
    isExpanded: boolean;
    onToggle: () => void;
    onEdit: () => void;
    onDelete: () => void;
    disabled?: boolean;
}) {
    const status = promotion.status as PromotionStatus;
    const isPercentage = promotion.promotionType === "percentage";
    const startsAt = new Date(promotion.startsAt);
    const endsAt = new Date(promotion.endsAt);

    return (
        <div
            className={`rounded-lg border p-4 transition-colors ${disabled ? "opacity-60" : "hover:bg-accent/50"}`}
        >
            <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                        {isPercentage ? (
                            <Percent className="h-4 w-4 text-primary" />
                        ) : (
                            <Gift className="h-4 w-4 text-primary" />
                        )}
                        <span className="font-medium">{promotion.name}</span>
                        <Badge variant={STATUS_COLORS[status]}>{STATUS_LABELS[status]}</Badge>
                    </div>

                    <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                        {isPercentage ? (
                            <span>{promotion.discountPercent}% off</span>
                        ) : (
                            <span>
                                Buy {promotion.bundleBuyQuantity} get {promotion.bundleGetQuantity} free
                            </span>
                        )}
                        <span>•</span>
                        <span>
                            {format(startsAt, "MMM d")} - {format(endsAt, "MMM d, yyyy")}
                        </span>
                        {promotion.scope !== "all_products" && (
                            <>
                                <span>•</span>
                                <span>
                                    {promotion.scope === "category"
                                        ? `Category: ${promotion.categoryFilter}${promotion.products && promotion.products.length > 0 ? ` (Filtered to ${promotion.products.length})` : ""}`
                                        : `Selected products (${promotion.products?.length || 0})`}
                                </span>
                            </>
                        )}
                    </div>

                    {isExpanded && (
                        <div className="mt-4 space-y-4">
                            {promotion.description && (
                                <p className="text-sm text-muted-foreground">{promotion.description}</p>
                            )}

                            {/* Show products list if available */}
                            {promotion.products && promotion.products.length > 0 && (
                                <div className="space-y-2">
                                    <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                        Included Products
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        {promotion.products.map((p) => (
                                            <Badge key={p.id || p.productId} variant="secondary" className="font-normal">
                                                {p.productName}
                                                {p.customDiscountPercent && (
                                                    <span className="ml-1 text-xs text-muted-foreground">
                                                        ({p.customDiscountPercent}% off)
                                                    </span>
                                                )}
                                            </Badge>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <div className="flex items-center gap-1">
                    {!disabled && (
                        <>
                            <Button variant="ghost" size="icon" onClick={onEdit}>
                                <Edit className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={onDelete}>
                                <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                        </>
                    )}
                    <Button variant="ghost" size="icon" onClick={onToggle}>
                        {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </Button>
                </div>
            </div>
        </div>
    );
}

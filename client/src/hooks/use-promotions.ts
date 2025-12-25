import { useState, useCallback, useRef } from "react";
import { getCsrfToken } from "@/lib/csrf";
import type { Promotion } from "@shared/schema";

interface ProductPromotion extends Promotion {
    effectiveDiscount: number;
    customDiscountPercent?: string | null;
}

interface PromotionCache {
    [productId: string]: {
        promotion: ProductPromotion | null;
        fetchedAt: number;
    };
}

const CACHE_TTL_MS = 60 * 1000; // 1 minute cache TTL

/**
 * Hook to manage promotion lookups for POS
 * Provides batch fetching and caching of active promotions for products
 */
export function usePromotions(storeId: string | undefined) {
    const [promotionCache, setPromotionCache] = useState<PromotionCache>({});
    const [isLoading, setIsLoading] = useState(false);
    const pendingBatchRef = useRef<Set<string>>(new Set());
    const batchTimeoutRef = useRef<number | null>(null);

    /**
     * Get cached promotion for a product (returns null if not cached or expired)
     */
    const getCachedPromotion = useCallback((productId: string): ProductPromotion | null | undefined => {
        const cached = promotionCache[productId];
        if (!cached) return undefined; // Not in cache
        if (Date.now() - cached.fetchedAt > CACHE_TTL_MS) return undefined; // Expired
        return cached.promotion;
    }, [promotionCache]);

    /**
     * Fetch promotions for multiple products at once
     */
    const fetchPromotions = useCallback(async (productIds: string[]): Promise<Record<string, ProductPromotion | null>> => {
        if (!storeId || productIds.length === 0) return {};

        // Filter out already cached (and not expired) products
        const uncachedIds = productIds.filter((id) => {
            const cached = promotionCache[id];
            if (!cached) return true;
            return Date.now() - cached.fetchedAt > CACHE_TTL_MS;
        });

        if (uncachedIds.length === 0) {
            // All products are cached, return cached values
            const result: Record<string, ProductPromotion | null> = {};
            for (const id of productIds) {
                result[id] = promotionCache[id]?.promotion ?? null;
            }
            return result;
        }

        setIsLoading(true);
        try {
            const csrfToken = await getCsrfToken().catch(() => null);
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);

            const res = await fetch("/api/promotions/batch-check", {
                method: "POST",
                credentials: "include",
                headers: {
                    "Content-Type": "application/json",
                    ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {}),
                },
                body: JSON.stringify({ productIds: uncachedIds, storeId }),
                signal: controller.signal,
            });
            clearTimeout(timeoutId);

            if (!res.ok) {
                console.warn("Failed to fetch promotions");
                return {};
            }

            const data = await res.json();
            const promotions: Record<string, ProductPromotion> = data.promotions || {};
            const now = Date.now();

            // Update cache with fetched promotions
            setPromotionCache((prev) => {
                const next = { ...prev };
                for (const id of uncachedIds) {
                    next[id] = {
                        promotion: promotions[id] || null,
                        fetchedAt: now,
                    };
                }
                return next;
            });

            // Build result including already cached items
            const result: Record<string, ProductPromotion | null> = {};
            for (const id of productIds) {
                if (promotions[id]) {
                    result[id] = promotions[id];
                } else if (promotionCache[id]?.promotion) {
                    result[id] = promotionCache[id].promotion;
                } else {
                    result[id] = null;
                }
            }

            return result;
        } catch (err) {
            console.warn("Failed to fetch promotions", err);
            return {};
        } finally {
            setIsLoading(false);
        }
    }, [storeId, promotionCache]);

    /**
     * Queue a product ID for batch fetching (debounced)
     */
    const queuePromotionFetch = useCallback((productId: string) => {
        pendingBatchRef.current.add(productId);

        // Debounce batch fetch
        if (batchTimeoutRef.current) {
            clearTimeout(batchTimeoutRef.current);
        }

        batchTimeoutRef.current = window.setTimeout(() => {
            const ids = Array.from(pendingBatchRef.current);
            pendingBatchRef.current.clear();
            if (ids.length > 0) {
                void fetchPromotions(ids);
            }
        }, 100);
    }, [fetchPromotions]);

    /**
     * Get the effective price for a product with promotion applied
     */
    const getEffectivePrice = useCallback((productId: string, originalPrice: number): {
        price: number;
        promotion: ProductPromotion | null;
        hasDiscount: boolean;
        discountAmount: number;
    } => {
        const cached = getCachedPromotion(productId);

        if (!cached || cached.promotionType === 'bundle') {
            return {
                price: originalPrice,
                promotion: null,
                hasDiscount: false,
                discountAmount: 0
            };
        }

        const discountPercent = Number(cached.customDiscountPercent || cached.discountPercent || cached.effectiveDiscount || 0);
        if (discountPercent <= 0) {
            return {
                price: originalPrice,
                promotion: cached,
                hasDiscount: false,
                discountAmount: 0
            };
        }

        const discountAmount = originalPrice * (discountPercent / 100);
        const discountedPrice = originalPrice - discountAmount;

        return {
            price: Math.max(0, discountedPrice),
            promotion: cached,
            hasDiscount: true,
            discountAmount,
        };
    }, [getCachedPromotion]);

    /**
     * Clear the promotion cache (useful when switching stores)
     */
    const clearCache = useCallback(() => {
        setPromotionCache({});
    }, []);

    return {
        fetchPromotions,
        queuePromotionFetch,
        getCachedPromotion,
        getEffectivePrice,
        clearCache,
        isLoading,
        promotionCache,
    };
}

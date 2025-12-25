import { and, eq, gte, lte, or, sql, inArray, isNull } from 'drizzle-orm';
import type { Express, Request, Response } from 'express';
import { z } from 'zod';
import {
    promotions,
    promotionProducts,
    products,
    users,
    type Promotion,
    type PromotionProduct,
} from '@shared/schema';
import { db } from '../db';
import { logger, extractLogContext } from '../lib/logger';
import { requireAuth, enforceIpWhitelist, requireRole } from '../middleware/authz';
import { resolveStoreAccess } from '../middleware/store-access';

// Base schema for promotion fields (without refinements for use with partial)
const BasePromotionSchema = z.object({
    name: z.string().trim().min(1, 'Name is required').max(255),
    description: z.string().trim().max(1000).optional().nullable(),
    promotionType: z.enum(['percentage', 'bundle']),
    scope: z.enum(['all_products', 'category', 'specific_products']),
    categoryFilter: z.string().trim().max(255).optional().nullable(),
    discountPercent: z.coerce.number().min(0.01).max(100).optional().nullable(),
    bundleBuyQuantity: z.coerce.number().int().min(1).optional().nullable(),
    bundleGetQuantity: z.coerce.number().int().min(1).optional().nullable(),
    perProductPricing: z.boolean().default(false),
    startsAt: z.string().datetime({ offset: true }).or(z.coerce.date()),
    endsAt: z.string().datetime({ offset: true }).or(z.coerce.date()),
    storeId: z.string().uuid().optional().nullable(),
    productIds: z.array(z.string().uuid()).optional(),
    productDiscounts: z.record(z.string(), z.coerce.number().min(0.01).max(100)).optional(),
});

// Create schema with refinements
const CreatePromotionSchema = BasePromotionSchema.refine(
    (data) => {
        if (data.promotionType === 'percentage' && !data.discountPercent) {
            return false;
        }
        return true;
    },
    { message: 'Discount percent is required for percentage promotions', path: ['discountPercent'] }
).refine(
    (data) => {
        if (data.promotionType === 'bundle' && (!data.bundleBuyQuantity || !data.bundleGetQuantity)) {
            return false;
        }
        return true;
    },
    { message: 'Bundle quantities are required for bundle promotions', path: ['bundleBuyQuantity'] }
).refine(
    (data) => {
        if (data.scope === 'category' && !data.categoryFilter) {
            return false;
        }
        return true;
    },
    { message: 'Category filter is required for category scope', path: ['categoryFilter'] }
).refine(
    (data) => {
        const startsAt = new Date(data.startsAt);
        const endsAt = new Date(data.endsAt);
        return endsAt > startsAt;
    },
    { message: 'End date must be after start date', path: ['endsAt'] }
);

// Update schema - use partial of base schema plus status
const UpdatePromotionSchema = BasePromotionSchema.partial().extend({
    status: z.enum(['draft', 'scheduled', 'active', 'expired', 'cancelled']).optional(),
});

// Helper to compute promotion status based on dates
function computePromotionStatus(startsAt: Date, endsAt: Date, currentStatus?: string): 'draft' | 'scheduled' | 'active' | 'expired' | 'cancelled' {
    const now = new Date();

    // If cancelled, keep it cancelled
    if (currentStatus === 'cancelled') {
        return 'cancelled';
    }

    if (now < startsAt) {
        return 'scheduled';
    }

    if (now >= startsAt && now <= endsAt) {
        return 'active';
    }

    return 'expired';
}

export async function registerPromotionRoutes(app: Express) {
    // Create a new promotion
    app.post('/api/promotions', requireAuth, requireRole('MANAGER'), enforceIpWhitelist, async (req: Request, res: Response) => {
        const userId = req.session?.userId as string | undefined;
        if (!userId) {
            return res.status(401).json({ error: 'Not authenticated' });
        }

        const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
        if (!user || !user.orgId) {
            return res.status(400).json({ error: 'Organization not set for user' });
        }

        const parsed = CreatePromotionSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ error: 'Invalid payload', details: parsed.error.flatten() });
        }

        const data = parsed.data;
        const startsAt = new Date(data.startsAt);
        const endsAt = new Date(data.endsAt);

        // Check store access if store-specific
        if (data.storeId) {
            const access = await resolveStoreAccess(req, data.storeId, { allowCashier: false });
            if ('error' in access) {
                return res.status(access.error.status).json({ error: access.error.message });
            }
        }

        try {
            // Start transaction
            const result = await db.transaction(async (tx) => {
                // Create promotion - cast to any to satisfy strict typing
                const insertValues = {
                    orgId: user.orgId!,
                    storeId: data.storeId || null,
                    name: data.name,
                    description: data.description || null,
                    promotionType: data.promotionType,
                    scope: data.scope,
                    categoryFilter: data.categoryFilter || null,
                    discountPercent: data.discountPercent?.toString() || null,
                    bundleBuyQuantity: data.bundleBuyQuantity || null,
                    bundleGetQuantity: data.bundleGetQuantity || null,
                    perProductPricing: data.perProductPricing,
                    startsAt,
                    endsAt,
                    status: computePromotionStatus(startsAt, endsAt),
                    createdBy: userId,
                } as any;

                const [promotion] = await tx.insert(promotions).values(insertValues).returning();

                // Add product associations if specific products or category with selected products
                if (data.productIds && data.productIds.length > 0) {
                    const productInserts = data.productIds.map((productId) => ({
                        promotionId: promotion.id,
                        productId,
                        customDiscountPercent: data.productDiscounts?.[productId]?.toString() || null,
                    }));

                    await tx.insert(promotionProducts).values(productInserts);
                }

                return promotion;
            });

            logger.info('Promotion created', {
                ...extractLogContext(req, { userId }),
                promotionId: result.id,
                name: result.name,
                scope: result.scope,
            });

            return res.status(201).json(result);
        } catch (error) {
            logger.error('Failed to create promotion', {
                error: error instanceof Error ? error.message : String(error),
            });
            return res.status(500).json({ error: 'Failed to create promotion' });
        }
    });

    // List promotions for organization/store
    app.get('/api/promotions', requireAuth, async (req: Request, res: Response) => {
        const userId = req.session?.userId as string | undefined;
        if (!userId) {
            return res.status(401).json({ error: 'Not authenticated' });
        }

        const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
        if (!user || !user.orgId) {
            return res.status(400).json({ error: 'Organization not set for user' });
        }

        const storeId = typeof req.query.storeId === 'string' ? req.query.storeId.trim() : undefined;
        const status = typeof req.query.status === 'string' ? req.query.status.trim() : undefined;
        const includeExpired = String(req.query.includeExpired ?? '').toLowerCase() === 'true';

        try {
            // Build query conditions
            const conditions = [eq(promotions.orgId, user.orgId)];

            if (storeId) {
                // Include org-wide promotions (storeId is null) and store-specific ones
                conditions.push(or(
                    eq(promotions.storeId, storeId),
                    isNull(promotions.storeId)
                )!);
            }

            if (status && ['draft', 'scheduled', 'active', 'expired', 'cancelled'].includes(status)) {
                conditions.push(eq(promotions.status, status as any));
            } else if (!includeExpired) {
                // By default, exclude expired promotions
                conditions.push(
                    or(
                        eq(promotions.status, 'draft'),
                        eq(promotions.status, 'scheduled'),
                        eq(promotions.status, 'active')
                    )!
                );
            }

            const rows = await db
                .select()
                .from(promotions)
                .where(and(...conditions))
                .orderBy(promotions.startsAt);

            // Update status based on current time for returned data
            const updatedRows = rows.map((promo) => ({
                ...promo,
                status: computePromotionStatus(new Date(promo.startsAt), new Date(promo.endsAt), promo.status),
            }));

            return res.json(updatedRows);
        } catch (error) {
            logger.error('Failed to fetch promotions', {
                error: error instanceof Error ? error.message : String(error),
            });
            return res.status(500).json({ error: 'Failed to fetch promotions' });
        }
    });

    // Get single promotion with associated products
    app.get('/api/promotions/:id', requireAuth, async (req: Request, res: Response) => {
        const promotionId = String(req.params.id ?? '').trim();
        if (!promotionId) {
            return res.status(400).json({ error: 'Promotion ID is required' });
        }

        const userId = req.session?.userId as string | undefined;
        if (!userId) {
            return res.status(401).json({ error: 'Not authenticated' });
        }

        const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
        if (!user || !user.orgId) {
            return res.status(400).json({ error: 'Organization not set for user' });
        }

        try {
            const [promotion] = await db
                .select()
                .from(promotions)
                .where(and(
                    eq(promotions.id, promotionId),
                    eq(promotions.orgId, user.orgId)
                ))
                .limit(1);

            if (!promotion) {
                return res.status(404).json({ error: 'Promotion not found' });
            }

            // Fetch associated products
            const associatedProducts = await db
                .select({
                    id: promotionProducts.id,
                    productId: promotionProducts.productId,
                    customDiscountPercent: promotionProducts.customDiscountPercent,
                    productName: products.name,
                    productSku: products.sku,
                    productBarcode: products.barcode,
                    productCategory: products.category,
                })
                .from(promotionProducts)
                .innerJoin(products, eq(promotionProducts.productId, products.id))
                .where(eq(promotionProducts.promotionId, promotionId));

            const result = {
                ...promotion,
                status: computePromotionStatus(new Date(promotion.startsAt), new Date(promotion.endsAt), promotion.status),
                products: associatedProducts,
            };

            return res.json(result);
        } catch (error) {
            logger.error('Failed to fetch promotion', {
                promotionId,
                error: error instanceof Error ? error.message : String(error),
            });
            return res.status(500).json({ error: 'Failed to fetch promotion' });
        }
    });

    // Update promotion
    app.put('/api/promotions/:id', requireAuth, requireRole('MANAGER'), enforceIpWhitelist, async (req: Request, res: Response) => {
        const promotionId = String(req.params.id ?? '').trim();
        if (!promotionId) {
            return res.status(400).json({ error: 'Promotion ID is required' });
        }

        const userId = req.session?.userId as string | undefined;
        if (!userId) {
            return res.status(401).json({ error: 'Not authenticated' });
        }

        const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
        if (!user || !user.orgId) {
            return res.status(400).json({ error: 'Organization not set for user' });
        }

        const parsed = UpdatePromotionSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ error: 'Invalid payload', details: parsed.error.flatten() });
        }

        try {
            // Check existing promotion
            const [existing] = await db
                .select()
                .from(promotions)
                .where(and(
                    eq(promotions.id, promotionId),
                    eq(promotions.orgId, user.orgId)
                ))
                .limit(1);

            if (!existing) {
                return res.status(404).json({ error: 'Promotion not found' });
            }

            const data = parsed.data;

            // Build update object
            const updateData: Record<string, any> = {
                updatedAt: new Date(),
            };

            if (data.name !== undefined) updateData.name = data.name;
            if (data.description !== undefined) updateData.description = data.description;
            if (data.promotionType !== undefined) updateData.promotionType = data.promotionType;
            if (data.scope !== undefined) updateData.scope = data.scope;
            if (data.categoryFilter !== undefined) updateData.categoryFilter = data.categoryFilter;
            if (data.discountPercent !== undefined) updateData.discountPercent = data.discountPercent?.toString() || null;
            if (data.bundleBuyQuantity !== undefined) updateData.bundleBuyQuantity = data.bundleBuyQuantity;
            if (data.bundleGetQuantity !== undefined) updateData.bundleGetQuantity = data.bundleGetQuantity;
            if (data.perProductPricing !== undefined) updateData.perProductPricing = data.perProductPricing;
            if (data.storeId !== undefined) updateData.storeId = data.storeId || null;

            // Handle status - allow manual cancellation
            if (data.status === 'cancelled') {
                updateData.status = 'cancelled';
            } else if (data.startsAt || data.endsAt) {
                // Recompute status if dates changed
                const startsAt = data.startsAt ? new Date(data.startsAt) : new Date(existing.startsAt);
                const endsAt = data.endsAt ? new Date(data.endsAt) : new Date(existing.endsAt);
                updateData.startsAt = startsAt;
                updateData.endsAt = endsAt;
                updateData.status = computePromotionStatus(startsAt, endsAt);
            }

            const result = await db.transaction(async (tx) => {
                // Update promotion
                const [updated] = await tx
                    .update(promotions)
                    .set(updateData)
                    .where(eq(promotions.id, promotionId))
                    .returning();

                // Update product associations if provided
                if (data.productIds !== undefined) {
                    // Remove existing associations
                    await tx.delete(promotionProducts).where(eq(promotionProducts.promotionId, promotionId));

                    // Add new associations
                    if (data.productIds.length > 0) {
                        const productInserts = data.productIds.map((productId) => ({
                            promotionId,
                            productId,
                            customDiscountPercent: data.productDiscounts?.[productId]?.toString() || null,
                        }));
                        await tx.insert(promotionProducts).values(productInserts);
                    }
                }

                return updated;
            });

            logger.info('Promotion updated', {
                ...extractLogContext(req, { userId }),
                promotionId,
                changes: Object.keys(data),
            });

            return res.json(result);
        } catch (error) {
            logger.error('Failed to update promotion', {
                promotionId,
                error: error instanceof Error ? error.message : String(error),
            });
            return res.status(500).json({ error: 'Failed to update promotion' });
        }
    });

    // Delete (cancel) promotion
    app.delete('/api/promotions/:id', requireAuth, requireRole('MANAGER'), enforceIpWhitelist, async (req: Request, res: Response) => {
        const promotionId = String(req.params.id ?? '').trim();
        if (!promotionId) {
            return res.status(400).json({ error: 'Promotion ID is required' });
        }

        const userId = req.session?.userId as string | undefined;
        if (!userId) {
            return res.status(401).json({ error: 'Not authenticated' });
        }

        const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
        if (!user || !user.orgId) {
            return res.status(400).json({ error: 'Organization not set for user' });
        }

        try {
            const [existing] = await db
                .select()
                .from(promotions)
                .where(and(
                    eq(promotions.id, promotionId),
                    eq(promotions.orgId, user.orgId)
                ))
                .limit(1);

            if (!existing) {
                return res.status(404).json({ error: 'Promotion not found' });
            }

            // Soft delete - set status to cancelled
            await db
                .update(promotions)
                .set({ status: 'cancelled', updatedAt: new Date() } as any)
                .where(eq(promotions.id, promotionId));

            logger.info('Promotion cancelled', {
                ...extractLogContext(req, { userId }),
                promotionId,
            });

            return res.json({ status: 'cancelled', id: promotionId });
        } catch (error) {
            logger.error('Failed to cancel promotion', {
                promotionId,
                error: error instanceof Error ? error.message : String(error),
            });
            return res.status(500).json({ error: 'Failed to cancel promotion' });
        }
    });

    // Get active promotions for a product in a store
    app.get('/api/products/:productId/promotions', requireAuth, async (req: Request, res: Response) => {
        const productId = String(req.params.productId ?? '').trim();
        const storeId = typeof req.query.storeId === 'string' ? req.query.storeId.trim() : undefined;

        if (!productId) {
            return res.status(400).json({ error: 'Product ID is required' });
        }

        const userId = req.session?.userId as string | undefined;
        if (!userId) {
            return res.status(401).json({ error: 'Not authenticated' });
        }

        const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
        if (!user || !user.orgId) {
            return res.status(400).json({ error: 'Organization not set for user' });
        }

        try {
            // Get product info for category matching
            const [product] = await db
                .select({ id: products.id, category: products.category })
                .from(products)
                .where(eq(products.id, productId))
                .limit(1);

            if (!product) {
                return res.status(404).json({ error: 'Product not found' });
            }

            const now = new Date();

            // Find active promotions that apply to this product
            const baseConditions = [
                eq(promotions.orgId, user.orgId),
                eq(promotions.status, 'active'),
                lte(promotions.startsAt, now),
                gte(promotions.endsAt, now),
            ];

            // Add store filter if provided
            if (storeId) {
                baseConditions.push(
                    or(
                        eq(promotions.storeId, storeId),
                        isNull(promotions.storeId)
                    )!
                );
            }

            // Get all potentially matching promotions
            const allPromotions = await db
                .select()
                .from(promotions)
                .where(and(...baseConditions));

            // Filter by scope
            const matchingPromotions: (Promotion & { customDiscountPercent?: string | null })[] = [];

            for (const promo of allPromotions) {
                if (promo.scope === 'all_products') {
                    matchingPromotions.push(promo);
                } else if (promo.scope === 'category' && product.category === promo.categoryFilter) {
                    // Check if specific products selected for category scope
                    const [specificProduct] = await db
                        .select()
                        .from(promotionProducts)
                        .where(and(
                            eq(promotionProducts.promotionId, promo.id),
                            eq(promotionProducts.productId, productId)
                        ))
                        .limit(1);

                    // If promotion has specific products and this product is in the list, or no specific products selected
                    const hasAnyProducts = await db
                        .select({ count: sql<number>`count(*)` })
                        .from(promotionProducts)
                        .where(eq(promotionProducts.promotionId, promo.id));

                    if (hasAnyProducts[0]?.count === 0 || specificProduct) {
                        matchingPromotions.push({
                            ...promo,
                            customDiscountPercent: specificProduct?.customDiscountPercent,
                        });
                    }
                } else if (promo.scope === 'specific_products') {
                    const [specificProduct] = await db
                        .select()
                        .from(promotionProducts)
                        .where(and(
                            eq(promotionProducts.promotionId, promo.id),
                            eq(promotionProducts.productId, productId)
                        ))
                        .limit(1);

                    if (specificProduct) {
                        matchingPromotions.push({
                            ...promo,
                            customDiscountPercent: specificProduct.customDiscountPercent,
                        });
                    }
                }
            }

            // Return the best promotion (highest discount)
            if (matchingPromotions.length === 0) {
                return res.json({ activePromotion: null, allPromotions: [] });
            }

            // Sort by effective discount (custom or default)
            const sortedPromotions = matchingPromotions.sort((a, b) => {
                const discountA = Number(a.customDiscountPercent || a.discountPercent || 0);
                const discountB = Number(b.customDiscountPercent || b.discountPercent || 0);
                return discountB - discountA; // Descending - highest discount first
            });

            return res.json({
                activePromotion: sortedPromotions[0],
                allPromotions: sortedPromotions,
            });
        } catch (error) {
            logger.error('Failed to fetch product promotions', {
                productId,
                storeId,
                error: error instanceof Error ? error.message : String(error),
            });
            return res.status(500).json({ error: 'Failed to fetch product promotions' });
        }
    });

    // Batch endpoint to get promotions for multiple products (for POS)
    app.post('/api/promotions/batch-check', requireAuth, async (req: Request, res: Response) => {
        const { productIds, storeId } = req.body as { productIds?: string[]; storeId?: string };

        if (!productIds || !Array.isArray(productIds) || productIds.length === 0) {
            return res.status(400).json({ error: 'productIds array is required' });
        }

        const userId = req.session?.userId as string | undefined;
        if (!userId) {
            return res.status(401).json({ error: 'Not authenticated' });
        }

        const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
        if (!user || !user.orgId) {
            return res.status(400).json({ error: 'Organization not set for user' });
        }

        try {
            const now = new Date();

            // Get all active promotions for the org/store
            const baseConditions = [
                eq(promotions.orgId, user.orgId),
                eq(promotions.status, 'active'),
                lte(promotions.startsAt, now),
                gte(promotions.endsAt, now),
            ];

            if (storeId) {
                baseConditions.push(
                    or(
                        eq(promotions.storeId, storeId),
                        isNull(promotions.storeId)
                    )!
                );
            }

            const activePromotions = await db
                .select()
                .from(promotions)
                .where(and(...baseConditions));

            if (activePromotions.length === 0) {
                return res.json({ promotions: {} });
            }

            // Get products info for category matching
            const productsData = await db
                .select({ id: products.id, category: products.category })
                .from(products)
                .where(inArray(products.id, productIds));

            const productCategoryMap = new Map(productsData.map(p => [p.id, p.category]));

            // Get all promotion_products associations
            const promoProductAssocs = await db
                .select()
                .from(promotionProducts)
                .where(inArray(promotionProducts.promotionId, activePromotions.map(p => p.id)));

            const promoProductMap = new Map<string, PromotionProduct[]>();
            for (const assoc of promoProductAssocs) {
                const existing = promoProductMap.get(assoc.promotionId) || [];
                existing.push(assoc);
                promoProductMap.set(assoc.promotionId, existing);
            }

            // Build result: productId -> best promotion
            const result: Record<string, Promotion & { effectiveDiscount: number; customDiscountPercent?: string | null }> = {};

            for (const productId of productIds) {
                const category = productCategoryMap.get(productId);
                let bestPromotion: (Promotion & { effectiveDiscount: number; customDiscountPercent?: string | null }) | null = null;
                let bestDiscount = 0;

                for (const promo of activePromotions) {
                    let applies = false;
                    let customDiscount: string | null = null;

                    if (promo.scope === 'all_products') {
                        applies = true;
                    } else if (promo.scope === 'category') {
                        // Case-insensitive category check
                        const productCat = category?.toLowerCase();
                        const promoCat = promo.categoryFilter?.toLowerCase();

                        if (productCat === promoCat) {
                            const promoProducts = promoProductMap.get(promo.id) || [];

                            // If specific products are selected, ONLY apply to those (filtering behavior)
                            // If no specific products, apply to ALL in category
                            if (promoProducts.length === 0) {
                                applies = true;
                            } else {
                                const match = promoProducts.find(pp => pp.productId === productId);
                                if (match) {
                                    applies = true;
                                    customDiscount = match.customDiscountPercent;
                                }
                            }
                        }
                    } else if (promo.scope === 'specific_products') {
                        const promoProducts = promoProductMap.get(promo.id) || [];
                        const match = promoProducts.find(pp => pp.productId === productId);
                        if (match) {
                            applies = true;
                            customDiscount = match.customDiscountPercent;
                        }
                    }

                    if (applies) {
                        const effectiveDiscount = Number(customDiscount || promo.discountPercent || 0);
                        if (effectiveDiscount > bestDiscount) {
                            bestDiscount = effectiveDiscount;
                            bestPromotion = {
                                ...promo,
                                effectiveDiscount,
                                customDiscountPercent: customDiscount,
                            };
                        }
                    }
                }

                if (bestPromotion) {
                    result[productId] = bestPromotion;
                }
            }

            return res.json({ promotions: result });
        } catch (error) {
            logger.error('Failed to batch check promotions', {
                error: error instanceof Error ? error.message : String(error),
            });
            return res.status(500).json({ error: 'Failed to check promotions' });
        }
    });
}

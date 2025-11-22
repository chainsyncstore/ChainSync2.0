import { eq } from 'drizzle-orm';
import type { Request } from 'express';
import { stores, users as sharedUsers } from '@shared/schema';
import { db } from '../db';
import { storage } from '../storage';

export type StoreRecord = Pick<typeof stores.$inferSelect, 'id' | 'orgId' | 'name' | 'isActive'>;
export type AuthUserRecord = Pick<
  typeof sharedUsers.$inferSelect,
  'id' | 'orgId' | 'isAdmin' | 'role' | 'storeId' | 'firstName' | 'lastName' | 'email'
>;

export type StoreAccessError = { error: { status: number; message: string } };
export type StoreAccessSuccess = { currentUser: AuthUserRecord; store: StoreRecord };

export type StoreAccessOptions = {
  /** Allow requests to proceed even when the store is inactive. */
  allowInactive?: boolean;
  /** Permit admins to bypass the inactive check even if allowInactive is false. */
  allowAdminOverride?: boolean;
  /** Allow cashiers to access their assigned store. Defaults to false (only managers/admins). */
  allowCashier?: boolean;
};

export async function fetchStoreRecord(storeId: string): Promise<StoreRecord | undefined> {
  const [store] = await db
    .select({ id: stores.id, orgId: stores.orgId, name: stores.name, isActive: stores.isActive })
    .from(stores)
    .where(eq(stores.id, storeId))
    .limit(1);
  if (store) return store;

  if (process.env.NODE_ENV === 'test') {
    const fallback = await storage.getStore(storeId);
    if (fallback) {
      return {
        id: fallback.id,
        orgId: (fallback as any).orgId ?? null,
        name: fallback.name,
        isActive: fallback.isActive ?? true,
      } as StoreRecord;
    }
  }
  return undefined;
}

export async function ensureStoreIsActive(
  storeId: string,
  allowInactive = false
): Promise<{ store: StoreRecord } | StoreAccessError> {
  const store = await fetchStoreRecord(storeId);
  if (!store) {
    return { error: { status: 404, message: 'Store not found' } };
  }
  if (store.isActive === false && !allowInactive) {
    return { error: { status: 423, message: 'Store is inactive' } };
  }
  return { store };
}

export async function resolveStoreAccess(
  req: Request,
  storeId: string,
  options: StoreAccessOptions = {}
): Promise<StoreAccessSuccess | StoreAccessError> {
  const currentUserId = req.session?.userId as string | undefined;
  if (!currentUserId) {
    return { error: { status: 401, message: 'Not authenticated' } };
  }

  let [currentUser] = await db
    .select({
      id: sharedUsers.id,
      orgId: sharedUsers.orgId,
      isAdmin: sharedUsers.isAdmin,
      role: sharedUsers.role,
      storeId: sharedUsers.storeId,
      firstName: sharedUsers.firstName,
      lastName: sharedUsers.lastName,
      email: sharedUsers.email,
    })
    .from(sharedUsers)
    .where(eq(sharedUsers.id, currentUserId));

  if (!currentUser && process.env.NODE_ENV === 'test') {
    const fallbackUser = await storage.getUser(currentUserId);
    if (fallbackUser) {
      currentUser = {
        id: fallbackUser.id,
        orgId: (fallbackUser as any).orgId ?? null,
        isAdmin: Boolean((fallbackUser as any).isAdmin),
        role: (fallbackUser as any).role ?? null,
        storeId: (fallbackUser as any).storeId ?? null,
        firstName: fallbackUser.firstName ?? null,
        lastName: fallbackUser.lastName ?? null,
        email: fallbackUser.email ?? null,
      } as AuthUserRecord;
    }
  }

  if (!currentUser) {
    return { error: { status: 401, message: 'Not authenticated' } };
  }

  if (currentUser.isAdmin) {
    const storeResult = await ensureStoreIsActive(
      storeId,
      options.allowInactive || options.allowAdminOverride || false
    );
    if ('error' in storeResult) {
      return storeResult;
    }
    return { currentUser, store: storeResult.store };
  }

  const storeResult = await ensureStoreIsActive(storeId, options.allowInactive || false);
  if ('error' in storeResult) {
    return storeResult;
  }
  const store = storeResult.store;

  if (!currentUser.orgId || currentUser.orgId !== store.orgId) {
    return { error: { status: 403, message: 'Forbidden' } };
  }

  const role = (currentUser.role || '').toLowerCase();

  if (role === 'manager') {
    if (currentUser.storeId === storeId) {
      return { currentUser, store };
    }
    const permissions = await storage.getUserStorePermissions(currentUser.id);
    const hasAccess = permissions.some((permission) => permission.storeId === storeId);
    if (!hasAccess) {
      return { error: { status: 403, message: 'Forbidden' } };
    }
    return { currentUser, store };
  }

  if (role === 'cashier' && options.allowCashier && currentUser.storeId === storeId) {
    return { currentUser, store };
  }

  return { error: { status: 403, message: 'Forbidden' } };
}

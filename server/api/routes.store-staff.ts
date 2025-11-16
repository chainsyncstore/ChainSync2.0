import { and, eq, inArray } from 'drizzle-orm';
import type { Express, Request, Response } from 'express';
import { z } from 'zod';
import { stores as prdStores } from '@shared/schema';
import { users as sharedUsers, userRoles, userStorePermissions } from '@shared/schema';
import { AuthService } from '../auth';
import { db } from '../db';
import { generateStaffCredentialsEmail, sendEmail } from '../email';
import { requireAuth } from '../middleware/authz';
import { storage } from '../storage';

const StaffCreateSchema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  email: z.string().email(),
  role: z.enum(['manager', 'cashier']),
});

type PermissionUser = {
  id: string;
  isAdmin: boolean;
  role?: string | null;
};

type PermissionResult = {
  allowed: boolean;
  status?: number;
  message?: string;
};

export function evaluateCreationPermission(user: PermissionUser, desiredRole: string): PermissionResult {
  if (user.isAdmin) {
    return { allowed: true };
  }

  const normalizedCreatorRole = (user.role || '').toLowerCase();
  if (normalizedCreatorRole !== 'manager') {
    return { allowed: false, status: 403, message: 'Forbidden' };
  }

  if (desiredRole !== 'cashier') {
    return { allowed: false, status: 403, message: 'Managers can only create cashiers' };
  }

  return { allowed: true };
}

export function evaluateDeletionPermission(
  user: PermissionUser,
  staff: { id: string; isAdmin?: boolean; role?: string | null },
  grantedBy: string | null
): PermissionResult {
  if (staff.isAdmin) {
    return { allowed: false, status: 400, message: 'Cannot delete an admin user' };
  }

  if (user.isAdmin) {
    return { allowed: true };
  }

  const normalizedUserRole = (user.role || '').toLowerCase();
  if (normalizedUserRole !== 'manager') {
    return { allowed: false, status: 403, message: 'Forbidden' };
  }

  if ((staff.role || '').toLowerCase() !== 'cashier') {
    return { allowed: false, status: 403, message: 'Forbidden' };
  }

  if (!grantedBy || grantedBy !== user.id) {
    return { allowed: false, status: 403, message: 'Forbidden' };
  }

  return { allowed: true };
}

async function resolveStoreAccess(req: Request, storeId: string) {
  const currentUserId = req.session?.userId as string | undefined;
  if (!currentUserId) {
    return { error: { status: 401, message: 'Not authenticated' } };
  }

  const [currentUser] = await db
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

  if (!currentUser) {
    return { error: { status: 401, message: 'Not authenticated' } };
  }

  const [store] = await db
    .select({ id: prdStores.id, orgId: prdStores.orgId, name: prdStores.name })
    .from(prdStores)
    .where(eq(prdStores.id, storeId));

  if (!store) {
    return { error: { status: 404, message: 'Store not found' } };
  }

  if (currentUser.isAdmin) {
    return { currentUser, store };
  }

  if (!currentUser.orgId || currentUser.orgId !== store.orgId) {
    return { error: { status: 403, message: 'Forbidden' } };
  }

  const role = (currentUser.role || '').toLowerCase();

  if (role === 'cashier') {
    return { error: { status: 403, message: 'Forbidden' } };
  }

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

  return { error: { status: 403, message: 'Forbidden' } };
}

export async function registerStoreStaffRoutes(app: Express) {
  app.get('/api/stores/:storeId/staff', requireAuth, async (req: Request, res: Response) => {
    const storeId = req.params.storeId;
    const access = await resolveStoreAccess(req, storeId);
    if ('error' in access) {
      return res.status(access.error.status).json({ error: access.error.message });
    }

    const { currentUser } = access;

    const staff = await db
      .select({
        id: sharedUsers.id,
        firstName: sharedUsers.firstName,
        lastName: sharedUsers.lastName,
        email: sharedUsers.email,
        role: sharedUsers.role,
        isActive: sharedUsers.isActive,
        createdAt: sharedUsers.createdAt,
      })
      .from(sharedUsers)
      .where(and(eq(sharedUsers.storeId, storeId), eq(sharedUsers.isAdmin, false)));

    const permissions = await db
      .select({
        userId: userStorePermissions.userId,
        grantedBy: userStorePermissions.grantedBy,
      })
      .from(userStorePermissions)
      .where(eq(userStorePermissions.storeId, storeId));

    const creatorMap = new Map<string, string | null>();
    const creatorNameMap = new Map<string, string>();

    for (const permission of permissions) {
      creatorMap.set(permission.userId, permission.grantedBy ?? null);
    }

    if (creatorMap.size > 0) {
      const creatorIds = Array.from(new Set(Array.from(creatorMap.values()).filter((id): id is string => !!id)));
      if (creatorIds.length > 0) {
        const creators = await db
          .select({
            id: sharedUsers.id,
            firstName: sharedUsers.firstName,
            lastName: sharedUsers.lastName,
            email: sharedUsers.email,
          })
          .from(sharedUsers)
          .where(inArray(sharedUsers.id, creatorIds));

        for (const creator of creators) {
          const fullName = [creator.firstName, creator.lastName].filter(Boolean).join(' ').trim();
          creatorNameMap.set(creator.id, fullName || creator.email || 'Unknown');
        }
      }
    }

    const response = staff
      .filter((member) => member.isActive !== false)
      .map((member) => {
        const grantedBy = creatorMap.get(member.id) ?? null;
        const canDelete = Boolean(currentUser.isAdmin) || (grantedBy && grantedBy === currentUser.id);
        return {
          ...member,
          role: (member.role || '').toLowerCase(),
          createdBy: grantedBy
            ? {
                id: grantedBy,
                name: creatorNameMap.get(grantedBy) || 'Unknown',
              }
            : null,
          canDelete,
        };
      });

    res.json({
      store: access.store,
      staff: response,
    });
  });

  app.post('/api/stores/:storeId/staff', requireAuth, async (req: Request, res: Response) => {
    const storeId = req.params.storeId;
    const access = await resolveStoreAccess(req, storeId);
    if ('error' in access) {
      return res.status(access.error.status).json({ error: access.error.message });
    }

    const { currentUser, store } = access;

    const parse = StaffCreateSchema.safeParse(req.body);
    if (!parse.success) {
      return res.status(400).json({ error: 'Invalid payload', details: parse.error.flatten() });
    }

    const { firstName, lastName, email, role } = parse.data;
    const normalizedRole = role.toLowerCase();

    const creationEvaluation = evaluateCreationPermission(currentUser, normalizedRole);
    if (!creationEvaluation.allowed) {
      return res
        .status(creationEvaluation.status ?? 403)
        .json({ error: creationEvaluation.message ?? 'Forbidden' });
    }

    const existingUser = await storage.getUserByEmail(email);
    if (existingUser) {
      return res.status(409).json({ error: 'A user with this email already exists' });
    }

    const tempPassword = AuthService.generateSecurePassword(12);

    const newUser = await storage.createUser({
      firstName,
      lastName,
      email,
      role: normalizedRole,
      orgId: store.orgId,
      storeId,
      isAdmin: false as any,
      isActive: true,
      password: tempPassword,
      emailVerified: false,
      signupCompleted: true,
      requiresPasswordChange: true,
    } as any);

    await db
      .update(sharedUsers)
      .set({
        signupCompleted: true,
        signupCompletedAt: new Date(),
        storeId,
        role: normalizedRole,
        isActive: true,
        requiresPasswordChange: true,
      } as any)
      .where(eq(sharedUsers.id, (newUser as any).id));

    await db.insert(userRoles).values({
      userId: (newUser as any).id,
      orgId: store.orgId,
      storeId,
      role: normalizedRole.toUpperCase() as any,
    } as any);

    await storage.grantStoreAccess((newUser as any).id, storeId, currentUser.id as string);

    const inviterName = [currentUser.firstName, currentUser.lastName].filter(Boolean).join(' ').trim() || currentUser.email;
    try {
      const emailPayload = generateStaffCredentialsEmail({
        staffEmail: email,
        staffName: [firstName, lastName].filter(Boolean).join(' ').trim() || null,
        temporaryPassword: tempPassword,
        storeName: store.name,
        assignedRole: normalizedRole,
        invitedBy: inviterName,
      });
      await sendEmail(emailPayload);
    } catch (err) {
      console.error('Failed to send staff credentials email', err);
    }

    res.status(201).json({
      staff: {
        id: (newUser as any).id,
        firstName,
        lastName,
        email,
        role: normalizedRole,
        createdAt: (newUser as any).createdAt ?? new Date(),
        createdBy: {
          id: currentUser.id,
          name: [currentUser.firstName, currentUser.lastName].filter(Boolean).join(' ').trim() || currentUser.email,
        },
        canDelete: true,
      },
      credentials: {
        email,
        password: tempPassword,
      },
    });
  });

  app.delete('/api/stores/:storeId/staff/:staffId', requireAuth, async (req: Request, res: Response) => {
    const { storeId, staffId } = req.params;
    const access = await resolveStoreAccess(req, storeId);
    if ('error' in access) {
      return res.status(access.error.status).json({ error: access.error.message });
    }

    const { currentUser, store } = access;

    const [staffMember] = await db
      .select({
        id: sharedUsers.id,
        orgId: sharedUsers.orgId,
        storeId: sharedUsers.storeId,
        role: sharedUsers.role,
        isAdmin: sharedUsers.isAdmin,
      })
      .from(sharedUsers)
      .where(eq(sharedUsers.id, staffId));

    if (!staffMember || staffMember.storeId !== storeId || staffMember.orgId !== store.orgId) {
      return res.status(404).json({ error: 'Staff member not found' });
    }

    let grantedBy: string | null = null;
    if (!currentUser.isAdmin) {
      const [permission] = await db
        .select({ grantedBy: userStorePermissions.grantedBy })
        .from(userStorePermissions)
        .where(and(eq(userStorePermissions.userId, staffId), eq(userStorePermissions.storeId, storeId)));
      grantedBy = permission?.grantedBy ?? null;
    }

    const deletionEvaluation = evaluateDeletionPermission(currentUser, staffMember, grantedBy);
    if (!deletionEvaluation.allowed) {
      return res
        .status(deletionEvaluation.status ?? 403)
        .json({ error: deletionEvaluation.message ?? 'Forbidden' });
    }

    await db.delete(userRoles).where(eq(userRoles.userId, staffId));
    await db.delete(userStorePermissions).where(eq(userStorePermissions.userId, staffId));

    await db
      .update(sharedUsers)
      .set({
        isActive: false,
        role: null,
        storeId: null,
      } as any)
      .where(eq(sharedUsers.id, staffId));

    res.status(204).send();
  });
}

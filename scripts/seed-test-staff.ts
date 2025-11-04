import { and, eq } from "drizzle-orm";
import { AuthService } from "../server/auth";
import { db } from "../server/db";
import { stores, userRoles, userStorePermissions, users } from "../shared/schema";

interface StaffProfile {
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  role: "manager" | "cashier";
  password: string;
}

async function getPrimaryStore() {
  const existingStores = await db.select().from(stores).limit(1);

  if (existingStores.length === 0) {
    const [created] = await db
      .insert(stores)
      .values({
        name: "Default Test Store",
        address: "Seeded automatically for staff testing",
        isActive: true,
      } as typeof stores.$inferInsert)
      .returning();

    return created;
  }

  return existingStores[0];
}

async function upsertUser(profile: StaffProfile, storeId: string | null, orgId: string | null) {
  const hashedPassword = await AuthService.hashPassword(profile.password);
  const now = new Date();

  const existing = await db
    .select()
    .from(users)
    .where(eq(users.email, profile.email))
    .limit(1);

  const mergedSettings = (() => {
    const currentSettings = existing[0]?.settings;
    if (currentSettings && typeof currentSettings === "object") {
      return { ...currentSettings, bypassIpWhitelist: true };
    }
    return { bypassIpWhitelist: true };
  })();

  const resolvedOrgId =
    orgId ??
    existing[0]?.orgId ??
    (existing[0] as any)?.org_id ??
    null;

  const baseData = {
    username: profile.username,
    email: profile.email,
    firstName: profile.firstName,
    lastName: profile.lastName,
    role: profile.role.toUpperCase(),
    storeId,
    orgId: resolvedOrgId,
    passwordHash: hashedPassword,
    password: hashedPassword,
    isActive: true,
    isAdmin: false,
    emailVerified: true,
    signupCompleted: true,
    signupAttempts: 1,
    signupStartedAt: now,
    signupCompletedAt: now,
    requiresPasswordChange: false,
    settings: mergedSettings,
  } satisfies typeof users.$inferInsert;

  if (existing.length > 0) {
    const [user] = existing;
    await db.update(users).set(baseData).where(eq(users.id, user.id));
    return { ...user, ...baseData };
  }

  const [created] = await db.insert(users).values(baseData).returning();
  return created;
}

async function ensureManagerStorePermission(userId: string, storeId: string) {
  const existingPermission = await db
    .select()
    .from(userStorePermissions)
    .where(
      and(
        eq(userStorePermissions.userId, userId),
        eq(userStorePermissions.storeId, storeId)
      )
    )
    .limit(1);

  if (existingPermission.length === 0) {
    await db.insert(userStorePermissions).values({
      userId,
      storeId,
    });
  }
}

async function ensureUserRole(
  user: typeof users.$inferSelect,
  role: StaffProfile["role"],
  storeId: string,
  orgId: string | null
) {
  const roleUpper = role.toUpperCase() as "MANAGER" | "CASHIER";

  const existingRoles = await db
    .select()
    .from(userRoles)
    .where(eq(userRoles.userId, user.id));

  const resolvedOrgId =
    orgId ??
    user.orgId ??
    (user as any)?.org_id ??
    existingRoles[0]?.orgId ??
    (existingRoles[0] as any)?.org_id ??
    null;

  if (!resolvedOrgId) {
    console.warn(
      `⚠️ Skipping user_roles update for ${user.email ?? user.username}; missing orgId`
    );
    return;
  }

  await db.delete(userRoles).where(eq(userRoles.userId, user.id));

  await db
    .insert(userRoles)
    .values({
      userId: user.id,
      orgId: resolvedOrgId,
      storeId,
      role: roleUpper,
    })
    .onConflictDoNothing();
}

async function main() {
  try {
    let primaryStore = await getPrimaryStore();

    const [adminUser] = await db
      .select()
      .from(users)
      .where(eq(users.email, "admin@chainsync.com"))
      .limit(1);

    const adminOrgId = adminUser?.orgId ?? (adminUser as any)?.org_id ?? null;
    if (!adminOrgId) {
      console.warn("⚠️ Unable to locate admin orgId; staff will remain unassigned to an organization");
    }

    const profiles: StaffProfile[] = [
      {
        username: "manager",
        email: "manager@chainsync.com",
        firstName: "Test",
        lastName: "Manager",
        role: "manager",
        password: "Manager@123",
      },
      {
        username: "cashier",
        email: "cashier@chainsync.com",
        firstName: "Test",
        lastName: "Cashier",
        role: "cashier",
        password: "Cashier@123",
      },
    ];

    const seeded: Array<{ username: string; password: string }> = [];

    const storeOrgId =
      adminOrgId ??
      (primaryStore as any).orgId ??
      (primaryStore as any).org_id ??
      null;

    for (const profile of profiles) {
      const storeId = primaryStore.id;
      const user = await upsertUser(profile, storeId, storeOrgId);

      if (profile.role === "manager") {
        await ensureManagerStorePermission(user.id, primaryStore.id);
      }

      await ensureUserRole(user as any, profile.role, storeId, storeOrgId);

      seeded.push({ username: profile.username, password: profile.password });
    }

    console.log("✅ Seeded staff accounts:");
    for (const entry of seeded) {
      console.log(` - ${entry.username} / ${entry.password}`);
    }

    console.log("Store ID used for assignments:", primaryStore.id);
  } catch (error) {
    console.error("Failed to seed staff profiles:", error);
    process.exitCode = 1;
  }
}

void main().finally(() => {
  void db.$client.end();
});

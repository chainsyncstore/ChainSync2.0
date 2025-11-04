import { and, eq } from "drizzle-orm";
import { db } from "../server/db";
import { users, stores, userStorePermissions } from "../shared/schema";
import { AuthService } from "../server/auth";

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

async function upsertUser(profile: StaffProfile, storeId: string | null) {
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

  const baseData = {
    username: profile.username,
    email: profile.email,
    firstName: profile.firstName,
    lastName: profile.lastName,
    role: profile.role.toUpperCase(),
    storeId,
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

async function main() {
  try {
    const primaryStore = await getPrimaryStore();

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

    for (const profile of profiles) {
      const storeId = profile.role === "cashier" ? primaryStore.id : null;
      const user = await upsertUser(profile, storeId);

      if (profile.role === "manager") {
        await ensureManagerStorePermission(user.id, primaryStore.id);
      }

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

main().finally(() => {
  void db.$client.end();
});

import 'dotenv/config';
import { db } from '../server/db';
import { users } from '../shared/schema';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcrypt';

async function ensureAdmin(): Promise<void> {
  try {
    const username = process.env.ADMIN_TEST_USERNAME || 'admin';
    const passwordPlain = process.env.ADMIN_TEST_PASSWORD || 'admin123';
    const email = process.env.ADMIN_TEST_EMAIL || 'admin@chainsync.com';

    console.log(`🔎 Ensuring admin user exists (username: ${username})...`);

    const existing = await db
      .select()
      .from(users)
      .where(eq(users.username, username))
      .limit(1);

    if (existing && existing.length > 0) {
      console.log(`✅ Admin user '${username}' already exists. No changes made.`);
      return;
    }

    const passwordHash = await bcrypt.hash(passwordPlain, 10);

    await db.insert(users).values({
      username,
      email,
      role: 'admin',
      password: passwordHash,
      firstName: 'System',
      lastName: 'Administrator',
      isActive: true,
      emailVerified: true,
      storeId: null,
    } as any);

    console.log('🎉 Admin user created successfully. Use these credentials to log in:');
    console.log('----------------------------------------------');
    console.log(`Username: ${username}`);
    console.log(`Password: ${passwordPlain}`);
    console.log('----------------------------------------------');
  } catch (error) {
    console.error('❌ Error ensuring admin user:', error);
    process.exit(1);
  }
}

ensureAdmin()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));



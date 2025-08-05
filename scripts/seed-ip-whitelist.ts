import { db } from '../server/db';
import { ipWhitelists, users } from '../shared/schema';
import { eq } from 'drizzle-orm';

async function seedIpWhitelist() {
  console.log('🌱 Seeding IP whitelist data...');

  try {
    // Get actual user IDs from the database
    const adminUser = await db.select().from(users).where(eq(users.username, 'admin')).limit(1);
    const managerUser = await db.select().from(users).where(eq(users.username, 'manager')).limit(1);
    const cashierUser = await db.select().from(users).where(eq(users.username, 'cashier')).limit(1);

    if (!adminUser[0] || !managerUser[0] || !cashierUser[0]) {
      console.error('❌ Required users not found in database');
      return;
    }

    console.log('Found users:', {
      admin: adminUser[0].id,
      manager: managerUser[0].id,
      cashier: cashierUser[0].id
    });

    // Add some test IP whitelist entries
    const testWhitelists = [
      {
        ipAddress: '127.0.0.1',
        whitelistedFor: adminUser[0].id,
        whitelistedBy: adminUser[0].id,
        role: 'admin' as const,
        description: 'Local development',
      },
      {
        ipAddress: '192.168.1.100',
        whitelistedFor: managerUser[0].id,
        whitelistedBy: adminUser[0].id,
        role: 'manager' as const,
        storeId: managerUser[0].storeId,
        description: 'Manager office computer',
      },
      {
        ipAddress: '192.168.1.101',
        whitelistedFor: cashierUser[0].id,
        whitelistedBy: managerUser[0].id,
        role: 'cashier' as const,
        storeId: cashierUser[0].storeId,
        description: 'POS terminal 1',
      },
      {
        ipAddress: '192.168.1.102',
        whitelistedFor: cashierUser[0].id,
        whitelistedBy: managerUser[0].id,
        role: 'cashier' as const,
        storeId: cashierUser[0].storeId,
        description: 'POS terminal 2',
      },
    ];

    for (const whitelist of testWhitelists) {
      await db.insert(ipWhitelists).values(whitelist);
      console.log(`✅ Added IP whitelist: ${whitelist.ipAddress} for ${whitelist.role}`);
    }

    console.log('🎉 IP whitelist seeding completed!');
  } catch (error) {
    console.error('❌ Error seeding IP whitelist:', error);
  } finally {
    process.exit(0);
  }
}

seedIpWhitelist(); 
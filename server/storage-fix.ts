import { sql } from "drizzle-orm";
import { db } from "./db";

export async function getUserByEmailDirect(email: string): Promise<any> {
  try {
    // Use raw SQL to avoid schema issues
    const result = await db.execute(
      sql`SELECT * FROM users WHERE email = ${email}`
    );
    
    if (result.rows && result.rows.length > 0) {
      const user = result.rows[0];
      // Map database fields to what the app expects
      return {
        ...user,
        passwordHash: user.password_hash,
        password_hash: user.password_hash,
        password: user.password_hash,
        emailVerified: user.email_verified,
        email_verified: user.email_verified,
        isAdmin: user.is_admin,
        is_admin: user.is_admin,
      };
    }
    return undefined;
  } catch (error) {
    console.error('getUserByEmailDirect error:', error);
    return undefined;
  }
}

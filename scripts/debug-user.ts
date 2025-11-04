import { eq } from "drizzle-orm";
import { db } from "../server/db";
import { users, userRoles } from "../shared/schema";

async function main(emailOrUsername: string) {
  const email = emailOrUsername.includes("@") ? emailOrUsername : undefined;
  const username = email ? undefined : emailOrUsername;

  const userRows = await db
    .select()
    .from(users)
    .where(email ? eq(users.email, email) : eq((users as any).username, username!))
    .limit(1);

  if (userRows.length === 0) {
    console.log("No user found");
    return;
  }

  const user = userRows[0];
  console.log("User:", {
    id: user.id,
    email: user.email,
    username: user.username,
    role: user.role,
    isAdmin: user.isAdmin,
    storeId: user.storeId,
    orgId: user.orgId,
  });

  const roles = await db
    .select()
    .from(userRoles)
    .where(eq(userRoles.userId, user.id));

  console.log("user_roles entries:", roles);
}

const input = process.argv[2];
if (!input) {
  console.error("Usage: npx tsx scripts/debug-user.ts <email-or-username>");
  process.exit(1);
}

main(input)
  .catch((err) => {
    console.error("Error:", err);
  })
  .finally(() => {
    void db.$client.end();
  });

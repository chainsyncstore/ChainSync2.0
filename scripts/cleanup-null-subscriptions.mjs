import { Client } from "pg";

const targets = [
  { id: "f9e4c7cf-2f0c-4079-9ff3-aa05a66fdadf", userId: null },
  { id: "398788b5-8622-427b-a7a9-35c88a4cc583", userId: null },
  { id: "d0989c4f-a486-4291-ba82-c4998db9339a", userId: null },
];

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  try {
    await client.connect();

    for (const { id, userId } of targets) {
      if (userId) {
        await client.query("UPDATE subscriptions SET user_id = $1 WHERE id = $2;", [
          userId,
          id,
        ]);
        console.log(`Set user_id on subscription ${id}`);
      } else {
        await client.query("DELETE FROM subscriptions WHERE id = $1;", [id]);
        console.log(`Deleted subscription ${id}`);
      }
    }
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("Failed to clean subscriptions:", error);
  process.exit(1);
});
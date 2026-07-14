import { neon } from "@neondatabase/serverless";

async function main() {
  const sql = neon(process.env.DATABASE_URL!);

  await sql`
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id serial PRIMARY KEY,
      endpoint text NOT NULL UNIQUE,
      p256dh text NOT NULL,
      auth text NOT NULL,
      user_agent text DEFAULT '',
      created_by text DEFAULT 'ops',
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `;

  console.log("push_subscriptions ready");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

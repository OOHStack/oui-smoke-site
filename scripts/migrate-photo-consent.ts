import { neon } from "@neondatabase/serverless";

async function main() {
  const sql = neon(process.env.DATABASE_URL!);

  await sql`ALTER TABLE job_photos ADD COLUMN IF NOT EXISTS consent_agreed boolean NOT NULL DEFAULT false`;
  await sql`ALTER TABLE job_photos ADD COLUMN IF NOT EXISTS social_handle text DEFAULT ''`;
  await sql`ALTER TABLE job_photos ADD COLUMN IF NOT EXISTS consented_at timestamptz`;

  console.log("job_photos consent columns ready");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

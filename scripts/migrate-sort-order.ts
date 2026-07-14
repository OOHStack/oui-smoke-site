import { neon } from "@neondatabase/serverless";

async function main() {
  const sql = neon(process.env.DATABASE_URL!);

  await sql`ALTER TABLE job_hookahs ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0`;

  // Seed existing rows so order is stable per job/status
  await sql`
    WITH ranked AS (
      SELECT
        id,
        ROW_NUMBER() OVER (
          PARTITION BY job_id, status
          ORDER BY id
        ) - 1 AS ord
      FROM job_hookahs
    )
    UPDATE job_hookahs j
    SET sort_order = ranked.ord
    FROM ranked
    WHERE j.id = ranked.id
  `;

  console.log("job_hookahs.sort_order ready");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

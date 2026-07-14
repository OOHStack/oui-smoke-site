import { neon } from "@neondatabase/serverless";

async function main() {
  const sql = neon(process.env.DATABASE_URL!);

  await sql`ALTER TABLE job_hookahs ADD COLUMN IF NOT EXISTS guest_token text`;

  // Unique index: multiple NULLs are allowed in Postgres
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS job_hookahs_guest_token_unique
    ON job_hookahs (guest_token)
  `;

  // Enums
  const typeExists = await sql`
    SELECT 1 FROM pg_type WHERE typname = 'service_request_type'
  `;
  if (typeExists.length === 0) {
    await sql`
      CREATE TYPE service_request_type AS ENUM ('coals', 'refill', 'issue', 'other')
    `;
    console.log("created service_request_type");
  }

  const statusExists = await sql`
    SELECT 1 FROM pg_type WHERE typname = 'service_request_status'
  `;
  if (statusExists.length === 0) {
    await sql`
      CREATE TYPE service_request_status AS ENUM ('open', 'acknowledged', 'resolved', 'cancelled')
    `;
    console.log("created service_request_status");
  }

  await sql`
    CREATE TABLE IF NOT EXISTS service_requests (
      id serial PRIMARY KEY,
      job_id integer NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      job_hookah_id integer NOT NULL REFERENCES job_hookahs(id) ON DELETE CASCADE,
      type service_request_type NOT NULL,
      message text DEFAULT '',
      status service_request_status NOT NULL DEFAULT 'open',
      created_at timestamptz NOT NULL DEFAULT now(),
      acknowledged_at timestamptz,
      resolved_at timestamptz,
      acknowledged_by text DEFAULT '',
      resolved_by text DEFAULT ''
    )
  `;

  const tables = await sql`
    SELECT table_name FROM information_schema.tables
    WHERE table_name = 'service_requests'
  `;
  console.log("service_requests exists:", tables.length > 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

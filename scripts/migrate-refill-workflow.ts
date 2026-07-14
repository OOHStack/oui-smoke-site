import { neon } from "@neondatabase/serverless";

async function main() {
  const sql = neon(process.env.DATABASE_URL!);

  await sql`DO $$ BEGIN
    CREATE TYPE return_outcome AS ENUM ('returned', 'not_returned', 'returned_with_issue');
  EXCEPTION WHEN duplicate_object THEN null; END $$`;

  await sql`DO $$ BEGIN
    CREATE TYPE refill_source AS ENUM ('staff', 'guest');
  EXCEPTION WHEN duplicate_object THEN null; END $$`;

  await sql`ALTER TABLE job_hookahs ADD COLUMN IF NOT EXISTS return_outcome return_outcome`;

  await sql`ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS flavour_id integer REFERENCES flavours(id)`;
  await sql`ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS flavour_label text DEFAULT ''`;
  await sql`ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS price_cents integer`;
  await sql`ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS price_agreed boolean NOT NULL DEFAULT false`;

  await sql`CREATE TABLE IF NOT EXISTS hookah_refills (
    id serial PRIMARY KEY,
    job_id integer NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    job_hookah_id integer NOT NULL REFERENCES job_hookahs(id) ON DELETE CASCADE,
    flavour_id integer REFERENCES flavours(id),
    flavour_label text NOT NULL DEFAULT '',
    previous_flavour_label text DEFAULT '',
    price_cents integer NOT NULL DEFAULT 0,
    source refill_source NOT NULL DEFAULT 'staff',
    service_request_id integer REFERENCES service_requests(id) ON DELETE SET NULL,
    note text DEFAULT '',
    created_by text DEFAULT 'ops',
    created_at timestamptz NOT NULL DEFAULT now()
  )`;

  console.log("refill/return schema ready");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

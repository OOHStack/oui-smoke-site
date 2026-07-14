import { neon } from "@neondatabase/serverless";

async function main() {
  const sql = neon(process.env.DATABASE_URL!);

  await sql`CREATE TABLE IF NOT EXISTS job_photos (
    id serial PRIMARY KEY,
    job_id integer NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    job_hookah_id integer REFERENCES job_hookahs(id) ON DELETE SET NULL,
    url text NOT NULL,
    download_url text NOT NULL,
    pathname text NOT NULL,
    content_type text DEFAULT 'image/jpeg',
    size_bytes integer DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now()
  )`;

  await sql`CREATE INDEX IF NOT EXISTS job_photos_job_id_idx ON job_photos (job_id)`;

  console.log("job_photos table ready");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

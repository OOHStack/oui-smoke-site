import { neon } from "@neondatabase/serverless";

/**
 * Idempotent ops schema migrations + verification.
 * Run: npm run db:migrate
 */
async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required");
  }

  const sql = neon(process.env.DATABASE_URL);
  console.log("Running migrations…");

  // --- guest service ---
  await sql`ALTER TABLE job_hookahs ADD COLUMN IF NOT EXISTS guest_token text`;
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS job_hookahs_guest_token_unique
    ON job_hookahs (guest_token)
  `;
  await sql`DO $$ BEGIN
    CREATE TYPE service_request_type AS ENUM ('coals', 'refill', 'issue', 'other');
  EXCEPTION WHEN duplicate_object THEN null; END $$`;
  await sql`DO $$ BEGIN
    ALTER TYPE service_request_type ADD VALUE IF NOT EXISTS 'order_unit';
  EXCEPTION WHEN duplicate_object THEN null; END $$`;
  await sql`DO $$ BEGIN
    CREATE TYPE service_request_status AS ENUM ('open', 'acknowledged', 'resolved', 'cancelled');
  EXCEPTION WHEN duplicate_object THEN null; END $$`;
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
  console.log("✓ guest service");

  // --- refill / return ---
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
  await sql`DO $$ BEGIN
    CREATE TYPE refill_pay_preference AS ENUM ('phone', 'terminal');
  EXCEPTION WHEN duplicate_object THEN null; END $$`;
  await sql`ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS pay_preference refill_pay_preference`;
  await sql`ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS acknowledged_by_user_id integer`;
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
  console.log("✓ refill workflow");

  // --- photos ---
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
  await sql`ALTER TABLE job_photos ADD COLUMN IF NOT EXISTS consent_agreed boolean NOT NULL DEFAULT false`;
  await sql`ALTER TABLE job_photos ADD COLUMN IF NOT EXISTS social_handle text DEFAULT ''`;
  await sql`ALTER TABLE job_photos ADD COLUMN IF NOT EXISTS consented_at timestamptz`;
  console.log("✓ job photos + consent");

  // --- board sort order ---
  await sql`ALTER TABLE job_hookahs ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0`;
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
  console.log("✓ sort_order");

  // --- push subscriptions ---
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
  console.log("✓ push_subscriptions");

  await sql`ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS ops_user_id integer`;
  console.log("✓ push_subscriptions.ops_user_id");

  // --- ops users ---
  await sql`DO $$ BEGIN
    CREATE TYPE ops_role AS ENUM ('admin', 'staff');
  EXCEPTION WHEN duplicate_object THEN null; END $$`;
  await sql`
    CREATE TABLE IF NOT EXISTS ops_users (
      id serial PRIMARY KEY,
      username text NOT NULL UNIQUE,
      display_name text NOT NULL,
      password_hash text NOT NULL,
      role ops_role NOT NULL DEFAULT 'staff',
      active boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `;
  console.log("✓ ops_users");

  await sql`ALTER TABLE ops_users ADD COLUMN IF NOT EXISTS password_reset_token_hash text`;
  await sql`ALTER TABLE ops_users ADD COLUMN IF NOT EXISTS password_reset_expires_at timestamptz`;
  console.log("✓ ops_users password reset columns");

  // --- client portal + UGC moderation ---
  await sql`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS client_token text`;
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS jobs_client_token_unique
    ON jobs (client_token)
  `;
  await sql`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS display_token text`;
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS jobs_display_token_unique
    ON jobs (display_token)
  `;
  await sql`ALTER TABLE job_photos ADD COLUMN IF NOT EXISTS approved_for_social boolean NOT NULL DEFAULT false`;
  await sql`ALTER TABLE job_photos ADD COLUMN IF NOT EXISTS featured boolean NOT NULL DEFAULT false`;
  await sql`ALTER TABLE job_photos ADD COLUMN IF NOT EXISTS reviewed_at timestamptz`;
  await sql`ALTER TABLE job_photos ADD COLUMN IF NOT EXISTS reviewed_by text DEFAULT ''`;
  console.log("✓ client portal + UGC moderation");

  // --- flavour descriptions + Oui menu seed ---
  await sql`ALTER TABLE flavours ADD COLUMN IF NOT EXISTS description text DEFAULT ''`;

  const menu = [
    {
      name: "Tray Day",
      kind: "mix",
      components: "Strawberry, Orange, Ice",
      description: "Bright berry and citrus with a cool finish — easy summer energy.",
    },
    {
      name: "Sky Light",
      kind: "mix",
      components: "Citrus, Peach, Watermelon, Ice",
      description: "Most popular — juicy orchard fruit with a crisp chill.",
    },
    {
      name: "Love on the Beach",
      kind: "mix",
      components: "Mango, Honeydew, Passion fruit, Mint",
      description: "Tropical and breezy — ripe fruit with a soft mint lift.",
    },
    {
      name: "Mint",
      kind: "single",
      components: "",
      description: "Clean, crisp mint.",
    },
    {
      name: "Blueberry Mist",
      kind: "single",
      components: "",
      description: "Soft blueberry with a cool mist finish.",
    },
    {
      name: "Vanilla Cream",
      kind: "single",
      components: "",
      description: "Smooth vanilla cream.",
    },
  ] as const;

  for (const f of menu) {
    await sql`
      INSERT INTO flavours (name, kind, components, description, active)
      VALUES (${f.name}, ${f.kind}::flavour_kind, ${f.components}, ${f.description}, true)
      ON CONFLICT (name) DO UPDATE SET
        kind = EXCLUDED.kind,
        components = EXCLUDED.components,
        description = EXCLUDED.description
    `;
  }
  console.log("✓ flavour descriptions + Oui menu");

  // --- guest post-session feedback ---
  await sql`ALTER TABLE job_hookahs ADD COLUMN IF NOT EXISTS guest_rating integer`;
  await sql`ALTER TABLE job_hookahs ADD COLUMN IF NOT EXISTS guest_comment text DEFAULT ''`;
  await sql`ALTER TABLE job_hookahs ADD COLUMN IF NOT EXISTS guest_feedback_at timestamptz`;
  console.log("✓ guest feedback");

  // --- Square payments ledger ---
  await sql`DO $$ BEGIN
    CREATE TYPE payment_kind AS ENUM ('deposit', 'balance', 'refill', 'tip', 'other');
  EXCEPTION WHEN duplicate_object THEN null; END $$`;
  await sql`DO $$ BEGIN
    CREATE TYPE payment_status AS ENUM ('pending', 'succeeded', 'failed', 'cancelled');
  EXCEPTION WHEN duplicate_object THEN null; END $$`;
  await sql`
    CREATE TABLE IF NOT EXISTS payments (
      id serial PRIMARY KEY,
      job_id integer NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      job_hookah_id integer REFERENCES job_hookahs(id) ON DELETE SET NULL,
      kind payment_kind NOT NULL DEFAULT 'deposit',
      status payment_status NOT NULL DEFAULT 'pending',
      amount_cents integer NOT NULL,
      currency text NOT NULL DEFAULT 'CAD',
      label text DEFAULT '',
      checkout_url text,
      square_payment_link_id text,
      square_order_id text,
      square_payment_id text,
      idempotency_key text NOT NULL UNIQUE,
      created_by text DEFAULT 'ops',
      paid_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS payments_job_id_idx ON payments (job_id)`;
  await sql`CREATE INDEX IF NOT EXISTS payments_square_order_id_idx ON payments (square_order_id)`;
  console.log("✓ payments ledger");

  // --- payment model (deposit optional) ---
  await sql`DO $$ BEGIN
    CREATE TYPE payment_model AS ENUM ('client_deposit', 'pay_at_event', 'complimentary');
  EXCEPTION WHEN duplicate_object THEN null; END $$`;
  await sql`
    ALTER TABLE jobs
    ADD COLUMN IF NOT EXISTS payment_model payment_model NOT NULL DEFAULT 'client_deposit'
  `;
  // Set known guest-pay / partner jobs (e.g. Tray Arts) off client deposit
  await sql`
    UPDATE jobs
    SET payment_model = 'pay_at_event'
    WHERE payment_model = 'client_deposit'
      AND (
        title ILIKE '%tray art%'
        OR packing_notes ILIKE '%tray art%'
        OR title ILIKE '%seductive pool%'
      )
  `;
  console.log("✓ pay_at_event for Tray Arts–style jobs");

  // --- deposit percent on package jobs ---
  await sql`
    ALTER TABLE jobs
    ADD COLUMN IF NOT EXISTS deposit_percent integer NOT NULL DEFAULT 50
  `;
  console.log("✓ jobs.deposit_percent");

  // --- payment settings singleton ---
  await sql`
    CREATE TABLE IF NOT EXISTS payment_settings (
      id integer PRIMARY KEY DEFAULT 1,
      default_deposit_percent integer NOT NULL DEFAULT 50,
      auto_deposit_on_booking boolean NOT NULL DEFAULT true,
      auto_deposit_on_quote boolean NOT NULL DEFAULT true,
      auto_balance_enabled boolean NOT NULL DEFAULT true,
      auto_balance_days_before integer NOT NULL DEFAULT 7,
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `;
  await sql`
    ALTER TABLE payment_settings
    ADD COLUMN IF NOT EXISTS auto_balance_enabled boolean NOT NULL DEFAULT true
  `;
  await sql`
    ALTER TABLE payment_settings
    ADD COLUMN IF NOT EXISTS auto_balance_days_before integer NOT NULL DEFAULT 7
  `;
  await sql`
    ALTER TABLE payment_settings
    ADD COLUMN IF NOT EXISTS square_terminal_device_id text
  `;
  await sql`
    INSERT INTO payment_settings (id)
    VALUES (1)
    ON CONFLICT (id) DO NOTHING
  `;
  console.log("✓ payment_settings");

  // --- guest pay tier + onsite_unit ledger kind ---
  await sql`DO $$ BEGIN
    CREATE TYPE guest_pay_tier AS ENUM ('standard', 'unlimited');
  EXCEPTION WHEN duplicate_object THEN null; END $$`;
  await sql`ALTER TABLE job_hookahs ADD COLUMN IF NOT EXISTS guest_pay_tier guest_pay_tier`;
  await sql`DO $$ BEGIN
    ALTER TYPE payment_kind ADD VALUE IF NOT EXISTS 'onsite_unit';
  EXCEPTION WHEN duplicate_object THEN null; END $$`;
  await sql`ALTER TABLE payments ADD COLUMN IF NOT EXISTS square_terminal_checkout_id text`;
  await sql`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS tip_split_json text DEFAULT ''`;
  await sql`DO $$ BEGIN
    ALTER TYPE payment_status ADD VALUE IF NOT EXISTS 'refunded';
  EXCEPTION WHEN duplicate_object THEN null; END $$`;
  await sql`DO $$ BEGIN
    ALTER TYPE service_request_type ADD VALUE IF NOT EXISTS 'order_unit';
  EXCEPTION WHEN duplicate_object THEN null; END $$`;
  await sql`ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS requested_guest_pay_tier guest_pay_tier`;
  await sql`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS pricing_json jsonb NOT NULL DEFAULT '{}'::jsonb`;
  console.log("✓ guest pay tier + onsite_unit + terminal + tip split + refunded + order_unit + job pricing");

  // --- site settings (Control Center rates + default check interval) ---
  await sql`
    CREATE TABLE IF NOT EXISTS site_settings (
      id integer PRIMARY KEY DEFAULT 1,
      pricing_json jsonb NOT NULL DEFAULT '{}'::jsonb,
      default_check_interval_minutes integer NOT NULL DEFAULT 45,
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `;
  await sql`
    INSERT INTO site_settings (id, pricing_json, default_check_interval_minutes)
    VALUES (
      1,
      '{
        "refillPriceCents": 3000,
        "onsiteUnitRate": 80,
        "onsiteUnlimitedRate": 100,
        "guestRebookCode": "OUI25",
        "guestRebookDiscountDollars": 25,
        "guestRebookLabel": "$25 off your next booking",
        "includedHours": 4,
        "minPackageHookahs": 4,
        "minPackageDollars": 450,
        "midTierRate": 95,
        "highTierRate": 85,
        "extraHourRate": 150,
        "hstRate": 0.13,
        "ledRate": 15,
        "waterRate": 8,
        "brandingMin": 4,
        "brandingMedium": 15,
        "brandingLarge": 20
      }'::jsonb,
      45
    )
    ON CONFLICT (id) DO NOTHING
  `;
  await sql`ALTER TABLE site_settings ADD COLUMN IF NOT EXISTS prep_token text`;
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS site_settings_prep_token_unique
    ON site_settings (prep_token)
  `;
  await sql`ALTER TABLE site_settings ADD COLUMN IF NOT EXISTS display_token text`;
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS site_settings_display_token_unique
    ON site_settings (display_token)
  `;
  console.log("✓ site_settings");

  // --- prep kitchen completion ---
  await sql`ALTER TABLE job_hookahs ADD COLUMN IF NOT EXISTS prep_completed_at timestamptz`;
  await sql`ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS prep_completed_at timestamptz`;
  console.log("✓ prep completion");

  // --- site media (marketing assets on Blob) ---
  await sql`
    CREATE TABLE IF NOT EXISTS site_media (
      id serial PRIMARY KEY,
      key text NOT NULL UNIQUE,
      label text NOT NULL DEFAULT '',
      url text NOT NULL,
      content_type text NOT NULL DEFAULT 'video/mp4',
      pathname text DEFAULT '',
      section text DEFAULT '',
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `;
  await sql`
    INSERT INTO site_media (key, label, url, content_type, pathname, section)
    VALUES (
      'summer_promo_reel',
      'SSS Golf Tournament ''25',
      'https://47tgviux3a8j2k6m.public.blob.vercel-storage.com/site/sss-golf-tourney-2025.mp4',
      'video/mp4',
      'site/sss-golf-tourney-2025.mp4',
      'summer'
    )
    ON CONFLICT (key) DO UPDATE SET
      label = EXCLUDED.label,
      url = EXCLUDED.url,
      content_type = EXCLUDED.content_type,
      pathname = EXCLUDED.pathname,
      section = EXCLUDED.section,
      updated_at = now()
  `;
  console.log("✓ site_media");

  // --- verify ---
  console.log("\nVerifying schema…");
  const requiredTables = [
    "service_requests",
    "hookah_refills",
    "job_photos",
    "push_subscriptions",
    "ops_users",
    "payments",
    "payment_settings",
    "site_settings",
    "site_media",
  ];
  const requiredColumns: Record<string, string[]> = {
    job_hookahs: [
      "guest_token",
      "sort_order",
      "return_outcome",
      "refill_count",
      "guest_rating",
      "guest_comment",
      "guest_feedback_at",
      "guest_pay_tier",
      "prep_completed_at",
    ],
    service_requests: [
      "flavour_id",
      "flavour_label",
      "price_cents",
      "price_agreed",
      "pay_preference",
      "acknowledged_by_user_id",
      "prep_completed_at",
    ],
    push_subscriptions: ["ops_user_id"],
    job_photos: [
      "consent_agreed",
      "social_handle",
      "consented_at",
      "approved_for_social",
      "featured",
    ],
    jobs: [
      "client_token",
      "display_token",
      "payment_model",
      "deposit_percent",
      "tip_split_json",
    ],
    flavours: ["description"],
    hookah_refills: ["price_cents", "source", "flavour_label"],
    ops_users: [
      "username",
      "password_hash",
      "role",
      "active",
      "password_reset_token_hash",
      "password_reset_expires_at",
    ],
    payments: [
      "job_id",
      "kind",
      "status",
      "amount_cents",
      "idempotency_key",
      "square_payment_link_id",
      "square_terminal_checkout_id",
    ],
  };

  const missing: string[] = [];

  for (const table of requiredTables) {
    const rows = await sql`
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = ${table}
    `;
    if (rows.length === 0) missing.push(`table:${table}`);
  }

  for (const [table, cols] of Object.entries(requiredColumns)) {
    for (const col of cols) {
      const rows = await sql`
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = ${table}
          AND column_name = ${col}
      `;
      if (rows.length === 0) missing.push(`column:${table}.${col}`);
    }
  }

  if (missing.length > 0) {
    console.error("Missing schema pieces:");
    for (const m of missing) console.error(`  - ${m}`);
    process.exit(1);
  }

  console.log(
    "All required tables/columns present (sort_order, photos, refill workflow, push).",
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

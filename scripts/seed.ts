import { config } from "dotenv";
config({ path: ".env.local" });
config();

import { getDb } from "../lib/db";
import { flavours, hookahs, jobEvents, jobs } from "../lib/db/schema";
import { eq } from "drizzle-orm";

async function seed() {
  const db = getDb();

  console.log("Seeding hookahs 1–20…");
  for (let modelNumber = 1; modelNumber <= 20; modelNumber++) {
    const [existing] = await db
      .select()
      .from(hookahs)
      .where(eq(hookahs.modelNumber, modelNumber))
      .limit(1);

    if (!existing) {
      await db.insert(hookahs).values({
        modelNumber,
        label: `Hookah #${modelNumber}`,
      });
      console.log(`  Created hookah #${modelNumber}`);
    }
  }

  const flavourSeeds = [
    { name: "Double Apple", kind: "single" as const, components: "" },
    { name: "Mint", kind: "single" as const, components: "" },
    { name: "Grape", kind: "single" as const, components: "" },
    { name: "Watermelon", kind: "single" as const, components: "" },
    { name: "Blue Mist", kind: "single" as const, components: "" },
    { name: "Love 66", kind: "single" as const, components: "" },
    { name: "Citrus Mix", kind: "mix" as const, components: "lemon+orange" },
    { name: "Cool Breeze", kind: "mix" as const, components: "mint+blueberry" },
  ];

  console.log("Seeding flavours…");
  for (const seed of flavourSeeds) {
    const [existing] = await db
      .select()
      .from(flavours)
      .where(eq(flavours.name, seed.name))
      .limit(1);

    if (!existing) {
      await db.insert(flavours).values(seed);
      console.log(`  Created flavour: ${seed.name}`);
    }
  }

  console.log('Seeding sample draft job "Weekend tasting"…');
  const [existingJob] = await db
    .select()
    .from(jobs)
    .where(eq(jobs.title, "Weekend tasting"))
    .limit(1);

  if (!existingJob) {
    const [job] = await db
      .insert(jobs)
      .values({
        title: "Weekend tasting",
        clientName: "Sample Client",
        status: "draft",
        location: "Sample venue",
        bookedHours: 4,
        checkIntervalMinutes: 45,
        guestCount: 12,
        quotedCents: 45000,
        staffNames: "Alex",
        packingNotes: "Bring spare hoses and coals",
      })
      .returning();

    await db.insert(jobEvents).values({
      jobId: job.id,
      type: "created",
      message: 'Sample job "Weekend tasting" seeded',
      createdBy: "seed",
    });

    console.log(`  Created job #${job.id}: Weekend tasting`);
  } else {
    console.log("  Sample job already exists, skipping");
  }

  console.log("Seed complete.");
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});

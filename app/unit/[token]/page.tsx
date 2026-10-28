import { getDb } from "@/lib/db";
import { hookahs, jobHookahs, jobs } from "@/lib/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export const metadata = { title: "Hookah service | Oui Smoke", robots: { index: false, follow: false } };

export default async function UnitPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const db = getDb();
  const valid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token);
  const [unit] = valid ? await db.select().from(hookahs).where(eq(hookahs.qrToken, token)).limit(1) : [];
  if (unit && !["retired", "maintenance"].includes(unit.status)) {
    const sessions = await db.select({ token: jobHookahs.guestToken }).from(jobHookahs)
      .innerJoin(jobs, eq(jobs.id, jobHookahs.jobId))
      .where(and(eq(jobHookahs.hookahId, unit.id), eq(jobHookahs.status, "out"), inArray(jobs.status, ["confirmed", "active"])))
      .limit(2);
    // Never pick an arbitrary event if inconsistent data assigns this unit twice.
    if (sessions.length === 1 && sessions[0].token) redirect(`/serve/${sessions[0].token}`);
  }
  return <main style={{ maxWidth: 440, margin: "15vh auto", padding: 24, textAlign: "center" }}>
    <h1>Oui Smoke</h1><h2>Service isn’t available yet</h2>
    <p>Please ask your Oui Smoke attendant for assistance, or scan again once your hookah is ready.</p>
  </main>;
}

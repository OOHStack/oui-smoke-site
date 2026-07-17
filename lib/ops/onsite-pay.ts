import { getDb } from "@/lib/db";
import { payments } from "@/lib/db/schema";
import { and, eq, inArray } from "drizzle-orm";

/** Prefer succeeded over pending for each assignment's onsite_unit row. */
export async function onsiteUnitPaymentMap(assignmentIds: number[]) {
  const map = new Map<
    number,
    { status: string; paymentId: number; amountCents: number }
  >();
  if (assignmentIds.length === 0) return map;

  const db = getDb();
  const rows = await db
    .select({
      id: payments.id,
      jobHookahId: payments.jobHookahId,
      status: payments.status,
      amountCents: payments.amountCents,
    })
    .from(payments)
    .where(
      and(
        inArray(payments.jobHookahId, assignmentIds),
        eq(payments.kind, "onsite_unit"),
        inArray(payments.status, ["pending", "succeeded"]),
      ),
    );

  for (const row of rows) {
    if (row.jobHookahId == null) continue;
    const prev = map.get(row.jobHookahId);
    if (prev?.status === "succeeded") continue;
    if (!prev || row.status === "succeeded") {
      map.set(row.jobHookahId, {
        status: row.status,
        paymentId: row.id,
        amountCents: row.amountCents,
      });
    }
  }
  return map;
}

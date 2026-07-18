import { getDb } from "@/lib/db";
import {
  flavours,
  hookahs,
  jobEvents,
  jobHookahs,
  jobs,
  serviceRequests,
} from "@/lib/db/schema";
import { guestRefillPaymentMap } from "@/lib/refill-payment-link";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";

export type PrepItemKind = "new_unit" | "refill" | "order_unit";

export type PrepItem = {
  id: string;
  kind: PrepItemKind;
  jobId: number;
  jobTitle: string;
  clientName: string;
  location: string | null;
  modelNumber: number | null;
  flavourName: string;
  flavourComponents: string | null;
  /** False when staged without a flavour yet — still shown so prep/ops see the gap. */
  hasFlavour: boolean;
  tier: "standard" | "unlimited" | null;
  status: string;
  paymentStatus: string | null;
  payPreference: "phone" | "terminal" | null;
  createdAt: string;
  assignmentId: number | null;
  serviceRequestId: number | null;
};

export type PrepFlavourTally = {
  flavourName: string;
  count: number;
};

export type PrepQueueSnapshot = {
  items: PrepItem[];
  tallies: PrepFlavourTally[];
  counts: {
    total: number;
    newUnits: number;
    refills: number;
    extras: number;
    needsFlavour: number;
  };
  serverTime: string;
};

function kindLabel(kind: PrepItemKind) {
  if (kind === "refill") return "Refill";
  if (kind === "order_unit") return "Extra hookah";
  return "New unit";
}

export { kindLabel as prepKindLabel };

function parsePrepItemId(id: string): {
  kind: "staged" | "call";
  numericId: number;
} | null {
  const staged = /^staged:(\d+)$/.exec(id);
  if (staged) return { kind: "staged", numericId: Number(staged[1]) };
  const call = /^call:(\d+)$/.exec(id);
  if (call) return { kind: "call", numericId: Number(call[1]) };
  return null;
}

/**
 * Kitchen marks a flavour packed. Unit stays staged / call stays open for floor;
 * item drops off the prep board until flavour changes (staged) or a new call.
 */
export async function completePrepItem(
  itemId: string,
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const parsed = parsePrepItemId(itemId);
  if (!parsed || !Number.isFinite(parsed.numericId)) {
    return { ok: false, error: "Invalid item", status: 400 };
  }

  const db = getDb();
  const now = new Date();

  if (parsed.kind === "staged") {
    const [row] = await db
      .select({
        id: jobHookahs.id,
        jobId: jobHookahs.jobId,
        status: jobHookahs.status,
        prepCompletedAt: jobHookahs.prepCompletedAt,
        flavourLabel: jobHookahs.flavourLabel,
        modelNumber: hookahs.modelNumber,
        flavourName: flavours.name,
      })
      .from(jobHookahs)
      .innerJoin(hookahs, eq(hookahs.id, jobHookahs.hookahId))
      .leftJoin(flavours, eq(flavours.id, jobHookahs.flavourId))
      .where(eq(jobHookahs.id, parsed.numericId))
      .limit(1);

    if (!row) return { ok: false, error: "Not found", status: 404 };
    if (row.status !== "staged") {
      return { ok: false, error: "Only staged units can be marked packed", status: 400 };
    }
    if (row.prepCompletedAt) return { ok: true };

    const flavourName = (row.flavourName || row.flavourLabel || "").trim();
    if (!flavourName) {
      return { ok: false, error: "Set a flavour before marking packed", status: 400 };
    }

    await db
      .update(jobHookahs)
      .set({ prepCompletedAt: now })
      .where(eq(jobHookahs.id, row.id));

    await db.insert(jobEvents).values({
      jobId: row.jobId,
      jobHookahId: row.id,
      type: "note",
      message: `Prep packed · #${row.modelNumber} · ${flavourName}`,
      createdBy: "prep",
    });

    return { ok: true };
  }

  const [row] = await db
    .select({
      id: serviceRequests.id,
      jobId: serviceRequests.jobId,
      jobHookahId: serviceRequests.jobHookahId,
      type: serviceRequests.type,
      status: serviceRequests.status,
      prepCompletedAt: serviceRequests.prepCompletedAt,
      flavourLabel: serviceRequests.flavourLabel,
      modelNumber: hookahs.modelNumber,
      flavourName: flavours.name,
    })
    .from(serviceRequests)
    .innerJoin(jobHookahs, eq(jobHookahs.id, serviceRequests.jobHookahId))
    .innerJoin(hookahs, eq(hookahs.id, jobHookahs.hookahId))
    .leftJoin(flavours, eq(flavours.id, serviceRequests.flavourId))
    .where(eq(serviceRequests.id, parsed.numericId))
    .limit(1);

  if (!row) return { ok: false, error: "Not found", status: 404 };
  if (row.type !== "refill" && row.type !== "order_unit") {
    return { ok: false, error: "Only refill or extra-hookah calls", status: 400 };
  }
  if (row.status !== "open" && row.status !== "acknowledged") {
    return { ok: false, error: "Call is not active", status: 400 };
  }
  if (row.prepCompletedAt) return { ok: true };

  const flavourName = (row.flavourName || row.flavourLabel || "").trim();
  if (!flavourName) {
    return { ok: false, error: "Set a flavour before marking packed", status: 400 };
  }

  await db
    .update(serviceRequests)
    .set({ prepCompletedAt: now })
    .where(eq(serviceRequests.id, row.id));

  const kindLabelText = row.type === "order_unit" ? "extra hookah" : "refill";
  await db.insert(jobEvents).values({
    jobId: row.jobId,
    jobHookahId: row.jobHookahId,
    type: "note",
    message: `Prep packed · ${kindLabelText} · #${row.modelNumber} · ${flavourName}`,
    createdBy: "prep",
  });

  return { ok: true };
}

/**
 * Kitchen queue for packing heads:
 * - Staged units on draft/confirmed/active jobs with a flavour, not yet marked packed
 * - Open/acked guest refill + extra-hookah calls not yet marked packed
 */
export async function loadPrepQueue(): Promise<PrepQueueSnapshot> {
  const db = getDb();

  const activeJobs = await db
    .select({
      id: jobs.id,
      title: jobs.title,
      clientName: jobs.clientName,
      location: jobs.location,
    })
    .from(jobs)
    .where(inArray(jobs.status, ["draft", "confirmed", "active"]));

  const jobIds = activeJobs.map((j) => j.id);
  const jobMap = new Map(activeJobs.map((j) => [j.id, j]));

  const items: PrepItem[] = [];

  if (jobIds.length > 0) {
    // Staged units with a flavour set feed the prep board. No flavour = hidden
    // until staff assign one on Ready to send. Packed heads leave until flavour changes.
    const staged = await db
      .select({
        assignmentId: jobHookahs.id,
        jobId: jobHookahs.jobId,
        flavourLabel: jobHookahs.flavourLabel,
        guestPayTier: jobHookahs.guestPayTier,
        createdAt: jobHookahs.createdAt,
        modelNumber: hookahs.modelNumber,
        flavourName: flavours.name,
        flavourComponents: flavours.components,
      })
      .from(jobHookahs)
      .innerJoin(hookahs, eq(hookahs.id, jobHookahs.hookahId))
      .leftJoin(flavours, eq(flavours.id, jobHookahs.flavourId))
      .where(
        and(
          inArray(jobHookahs.jobId, jobIds),
          eq(jobHookahs.status, "staged"),
          isNull(jobHookahs.prepCompletedAt),
        ),
      )
      .orderBy(asc(jobHookahs.createdAt));

    for (const row of staged) {
      const job = jobMap.get(row.jobId);
      if (!job) continue;
      const flavourName = (row.flavourName || row.flavourLabel || "").trim();
      if (!flavourName) continue;
      items.push({
        id: `staged:${row.assignmentId}`,
        kind: "new_unit",
        jobId: row.jobId,
        jobTitle: job.title,
        clientName: job.clientName,
        location: job.location,
        modelNumber: row.modelNumber,
        flavourName,
        flavourComponents: row.flavourComponents?.trim() || null,
        hasFlavour: true,
        tier:
          row.guestPayTier === "standard" || row.guestPayTier === "unlimited"
            ? row.guestPayTier
            : null,
        status: "staged",
        paymentStatus: null,
        payPreference: null,
        createdAt: new Date(row.createdAt).toISOString(),
        assignmentId: row.assignmentId,
        serviceRequestId: null,
      });
    }

    const calls = await db
      .select({
        id: serviceRequests.id,
        type: serviceRequests.type,
        status: serviceRequests.status,
        flavourLabel: serviceRequests.flavourLabel,
        payPreference: serviceRequests.payPreference,
        requestedGuestPayTier: serviceRequests.requestedGuestPayTier,
        createdAt: serviceRequests.createdAt,
        jobId: serviceRequests.jobId,
        assignmentId: serviceRequests.jobHookahId,
        modelNumber: hookahs.modelNumber,
        flavourName: flavours.name,
        flavourComponents: flavours.components,
      })
      .from(serviceRequests)
      .innerJoin(jobHookahs, eq(jobHookahs.id, serviceRequests.jobHookahId))
      .innerJoin(hookahs, eq(hookahs.id, jobHookahs.hookahId))
      .leftJoin(flavours, eq(flavours.id, serviceRequests.flavourId))
      .where(
        and(
          inArray(serviceRequests.jobId, jobIds),
          inArray(serviceRequests.status, ["open", "acknowledged"]),
          inArray(serviceRequests.type, ["refill", "order_unit"]),
          isNull(serviceRequests.prepCompletedAt),
        ),
      )
      .orderBy(asc(serviceRequests.createdAt));

    const payMap = await guestRefillPaymentMap(calls.map((c) => c.id));

    for (const row of calls) {
      const job = jobMap.get(row.jobId);
      if (!job) continue;
      const flavourName = (row.flavourName || row.flavourLabel || "").trim();
      if (!flavourName) continue;
      const kind: PrepItemKind =
        row.type === "order_unit" ? "order_unit" : "refill";
      const pay = payMap.get(row.id);
      items.push({
        id: `call:${row.id}`,
        kind,
        jobId: row.jobId,
        jobTitle: job.title,
        clientName: job.clientName,
        location: job.location,
        modelNumber: row.modelNumber,
        flavourName,
        flavourComponents: row.flavourComponents?.trim() || null,
        hasFlavour: true,
        tier:
          row.requestedGuestPayTier === "standard" ||
          row.requestedGuestPayTier === "unlimited"
            ? row.requestedGuestPayTier
            : null,
        status: row.status,
        paymentStatus: pay?.paymentStatus ?? null,
        payPreference: row.payPreference ?? null,
        createdAt: new Date(row.createdAt).toISOString(),
        assignmentId: row.assignmentId,
        serviceRequestId: row.id,
      });
    }
  }

  items.sort(
    (a, b) =>
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );

  const tallyMap = new Map<string, number>();
  for (const item of items) {
    tallyMap.set(item.flavourName, (tallyMap.get(item.flavourName) ?? 0) + 1);
  }
  const tallies = [...tallyMap.entries()]
    .map(([flavourName, count]) => ({ flavourName, count }))
    .sort((a, b) => b.count - a.count || a.flavourName.localeCompare(b.flavourName));

  return {
    items,
    tallies,
    counts: {
      total: items.length,
      newUnits: items.filter((i) => i.kind === "new_unit").length,
      refills: items.filter((i) => i.kind === "refill").length,
      extras: items.filter((i) => i.kind === "order_unit").length,
      needsFlavour: 0,
    },
    serverTime: new Date().toISOString(),
  };
}

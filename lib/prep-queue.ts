import { getDb } from "@/lib/db";
import {
  flavours,
  hookahs,
  jobHookahs,
  jobs,
  serviceRequests,
} from "@/lib/db/schema";
import { guestRefillPaymentMap } from "@/lib/refill-payment-link";
import { and, asc, eq, inArray } from "drizzle-orm";

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

/**
 * Kitchen queue for packing heads:
 * - All staged units on draft/confirmed/active jobs (flavour optional — set before send-out)
 * - Open/acked guest refill + extra-hookah calls
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
    // until staff assign one on Ready to send.
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
        and(inArray(jobHookahs.jobId, jobIds), eq(jobHookahs.status, "staged")),
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

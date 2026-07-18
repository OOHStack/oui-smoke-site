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
  /** Set when kitchen marked this flavour packed. */
  packedAt: string | null;
  assignmentId: number | null;
  serviceRequestId: number | null;
};

export type PrepFlavourTally = {
  flavourName: string;
  count: number;
};

export type PrepFlavourGroup = {
  flavourName: string;
  flavourComponents: string | null;
  count: number;
  items: PrepItem[];
};

export type PrepQueueSnapshot = {
  items: PrepItem[];
  tallies: PrepFlavourTally[];
  packed: PrepItem[];
  packedTallies: PrepFlavourTally[];
  packedByFlavour: PrepFlavourGroup[];
  counts: {
    total: number;
    newUnits: number;
    refills: number;
    extras: number;
    needsFlavour: number;
    packed: number;
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

function tallyFlavours(items: PrepItem[]): PrepFlavourTally[] {
  const tallyMap = new Map<string, number>();
  for (const item of items) {
    tallyMap.set(item.flavourName, (tallyMap.get(item.flavourName) ?? 0) + 1);
  }
  return [...tallyMap.entries()]
    .map(([flavourName, count]) => ({ flavourName, count }))
    .sort(
      (a, b) =>
        b.count - a.count || a.flavourName.localeCompare(b.flavourName),
    );
}

function groupByFlavour(items: PrepItem[]): PrepFlavourGroup[] {
  const map = new Map<string, PrepItem[]>();
  for (const item of items) {
    const list = map.get(item.flavourName) ?? [];
    list.push(item);
    map.set(item.flavourName, list);
  }
  return [...map.entries()]
    .map(([flavourName, groupItems]) => {
      const sorted = [...groupItems].sort((a, b) => {
        const aT = a.packedAt ? new Date(a.packedAt).getTime() : 0;
        const bT = b.packedAt ? new Date(b.packedAt).getTime() : 0;
        return bT - aT;
      });
      return {
        flavourName,
        flavourComponents: sorted[0]?.flavourComponents ?? null,
        count: sorted.length,
        items: sorted,
      };
    })
    .sort(
      (a, b) =>
        b.count - a.count || a.flavourName.localeCompare(b.flavourName),
    );
}

/**
 * Kitchen marks a flavour packed. Unit stays staged / call stays open for floor;
 * item moves to the packed list until flavour changes or the night wraps.
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
 * - To pack: staged / open calls with flavour, not yet marked packed
 * - Packed: marked packed on active jobs (still staged, out on floor, or call still open/resolved)
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
  const packed: PrepItem[] = [];

  if (jobIds.length > 0) {
    const staged = await db
      .select({
        assignmentId: jobHookahs.id,
        jobId: jobHookahs.jobId,
        status: jobHookahs.status,
        flavourLabel: jobHookahs.flavourLabel,
        guestPayTier: jobHookahs.guestPayTier,
        createdAt: jobHookahs.createdAt,
        prepCompletedAt: jobHookahs.prepCompletedAt,
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
          inArray(jobHookahs.status, ["staged", "out"]),
        ),
      )
      .orderBy(asc(jobHookahs.createdAt));

    for (const row of staged) {
      const job = jobMap.get(row.jobId);
      if (!job) continue;
      const flavourName = (row.flavourName || row.flavourLabel || "").trim();
      if (!flavourName) continue;

      const item: PrepItem = {
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
        status: row.status,
        paymentStatus: null,
        payPreference: null,
        createdAt: new Date(row.createdAt).toISOString(),
        packedAt: row.prepCompletedAt
          ? new Date(row.prepCompletedAt).toISOString()
          : null,
        assignmentId: row.assignmentId,
        serviceRequestId: null,
      };

      if (row.prepCompletedAt) {
        packed.push(item);
      } else if (row.status === "staged") {
        items.push(item);
      }
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
        prepCompletedAt: serviceRequests.prepCompletedAt,
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
          inArray(serviceRequests.type, ["refill", "order_unit"]),
          inArray(serviceRequests.status, [
            "open",
            "acknowledged",
            "resolved",
          ]),
        ),
      )
      .orderBy(asc(serviceRequests.createdAt));

    const activeCallIds = calls
      .filter((c) => c.status === "open" || c.status === "acknowledged")
      .map((c) => c.id);
    const payMap = await guestRefillPaymentMap(activeCallIds);

    for (const row of calls) {
      const job = jobMap.get(row.jobId);
      if (!job) continue;
      const flavourName = (row.flavourName || row.flavourLabel || "").trim();
      if (!flavourName) continue;
      const kind: PrepItemKind =
        row.type === "order_unit" ? "order_unit" : "refill";
      const pay = payMap.get(row.id);
      const item: PrepItem = {
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
        packedAt: row.prepCompletedAt
          ? new Date(row.prepCompletedAt).toISOString()
          : null,
        assignmentId: row.assignmentId,
        serviceRequestId: row.id,
      };

      if (row.prepCompletedAt) {
        packed.push(item);
      } else if (row.status === "open" || row.status === "acknowledged") {
        items.push(item);
      }
    }
  }

  items.sort(
    (a, b) =>
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
  packed.sort((a, b) => {
    const aT = a.packedAt ? new Date(a.packedAt).getTime() : 0;
    const bT = b.packedAt ? new Date(b.packedAt).getTime() : 0;
    return bT - aT;
  });

  const tallies = tallyFlavours(items);
  const packedTallies = tallyFlavours(packed);
  const packedByFlavour = groupByFlavour(packed);

  return {
    items,
    tallies,
    packed,
    packedTallies,
    packedByFlavour,
    counts: {
      total: items.length,
      newUnits: items.filter((i) => i.kind === "new_unit").length,
      refills: items.filter((i) => i.kind === "refill").length,
      extras: items.filter((i) => i.kind === "order_unit").length,
      needsFlavour: 0,
      packed: packed.length,
    },
    serverTime: new Date().toISOString(),
  };
}

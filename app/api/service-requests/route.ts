import { requireApiSession } from "@/lib/auth/api";
import { getDb } from "@/lib/db";
import { hookahs, jobHookahs, jobs, serviceRequests } from "@/lib/db/schema";
import { desc, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { error } = await requireApiSession();
  if (error) return error;

  const url = new URL(request.url);
  const statusParam = url.searchParams.get("status") || "open,acknowledged";
  const statuses = statusParam
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean) as Array<"open" | "acknowledged" | "resolved" | "cancelled">;

  const db = getDb();
  const rows = await db
    .select({
      id: serviceRequests.id,
      type: serviceRequests.type,
      message: serviceRequests.message,
      status: serviceRequests.status,
      flavourId: serviceRequests.flavourId,
      flavourLabel: serviceRequests.flavourLabel,
      priceCents: serviceRequests.priceCents,
      priceAgreed: serviceRequests.priceAgreed,
      createdAt: serviceRequests.createdAt,
      acknowledgedAt: serviceRequests.acknowledgedAt,
      jobId: serviceRequests.jobId,
      jobTitle: jobs.title,
      clientName: jobs.clientName,
      location: jobs.location,
      assignmentId: serviceRequests.jobHookahId,
      modelNumber: hookahs.modelNumber,
      guestToken: jobHookahs.guestToken,
    })
    .from(serviceRequests)
    .innerJoin(jobs, eq(jobs.id, serviceRequests.jobId))
    .innerJoin(jobHookahs, eq(jobHookahs.id, serviceRequests.jobHookahId))
    .innerJoin(hookahs, eq(hookahs.id, jobHookahs.hookahId))
    .where(inArray(serviceRequests.status, statuses.length ? statuses : ["open", "acknowledged"]))
    .orderBy(desc(serviceRequests.createdAt))
    .limit(50);

  return NextResponse.json({ requests: rows });
}

import { findJobIdByPrepToken } from "@/lib/job-prep-token";
import { loadPrepQueue } from "@/lib/prep-queue";
import { createSseResponse } from "@/lib/sse";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type RouteContext = { params: Promise<{ token: string }> };

export async function GET(request: Request, context: RouteContext) {
  const { token } = await context.params;
  const jobId = await findJobIdByPrepToken(token);
  if (jobId == null) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return createSseResponse({
    signal: request.signal,
    intervalMs: 1500,
    getPayload: async () => {
      const snapshot = await loadPrepQueue(jobId);
      if (!snapshot) return { error: "Not found" };
      return snapshot;
    },
  });
}

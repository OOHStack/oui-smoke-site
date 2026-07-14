import { runAutoBalanceSweep } from "@/lib/auto-balance";
import { NextResponse } from "next/server";

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get("authorization") || "";
  return header === `Bearer ${secret}`;
}

/** Vercel Cron — auto-email balance links inside the settings window. */
export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runAutoBalanceSweep();
    console.info("auto balance sweep", result);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("auto balance sweep failed", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Sweep failed" },
      { status: 500 },
    );
  }
}

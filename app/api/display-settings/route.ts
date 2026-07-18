import { requireApiAdmin, requireApiSession } from "@/lib/auth/api";
import {
  getDisplayWorkflowSettings,
  updateDisplayWorkflowSettings,
  type DisplayQrTrigger,
} from "@/lib/display-workflow";
import { NextResponse } from "next/server";

export async function GET() {
  const { error } = await requireApiSession();
  if (error) return error;
  const settings = await getDisplayWorkflowSettings();
  return NextResponse.json({ settings });
}

export async function PATCH(request: Request) {
  const { error } = await requireApiAdmin();
  if (error) return error;

  let body: {
    qrTrigger?: DisplayQrTrigger;
    qrDurationSeconds?: number;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const settings = await updateDisplayWorkflowSettings({
    qrTrigger: body.qrTrigger,
    qrDurationSeconds: body.qrDurationSeconds,
  });
  return NextResponse.json({ settings });
}

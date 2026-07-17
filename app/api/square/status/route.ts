import { requireApiAdmin } from "@/lib/auth/api";
import { updatePaymentSettings } from "@/lib/payment-settings";
import {
  createTerminalPairingCode,
  getSquareStatus,
  refreshDeviceCode,
} from "@/lib/square-status";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { error } = await requireApiAdmin();
  if (error) return error;

  const url = new URL(request.url);
  const probe = url.searchParams.get("probe") === "1";
  const status = await getSquareStatus({ probeTerminal: probe });
  return NextResponse.json({ status });
}

export async function POST(request: Request) {
  const { error } = await requireApiAdmin();
  if (error) return error;

  let body: {
    action?: string;
    deviceId?: string | null;
    name?: string;
    codeId?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const action = body.action;

  if (action === "create_device_code") {
    try {
      const deviceCode = await createTerminalPairingCode(body.name);
      const status = await getSquareStatus();
      return NextResponse.json({ ok: true, deviceCode, status });
    } catch (err) {
      return NextResponse.json(
        {
          error:
            err instanceof Error ? err.message : "Could not create device code",
        },
        { status: 400 },
      );
    }
  }

  if (action === "refresh_device_code") {
    if (!body.codeId?.trim()) {
      return NextResponse.json({ error: "codeId required" }, { status: 400 });
    }
    const deviceCode = await refreshDeviceCode(body.codeId.trim());
    if (!deviceCode) {
      return NextResponse.json(
        { error: "Device code not found or expired" },
        { status: 404 },
      );
    }
    const status = await getSquareStatus();
    return NextResponse.json({ ok: true, deviceCode, status });
  }

  if (action === "set_terminal_device") {
    const deviceId =
      body.deviceId === null || body.deviceId === ""
        ? null
        : String(body.deviceId).trim();
    if (deviceId !== null && deviceId.length < 4) {
      return NextResponse.json(
        { error: "deviceId looks too short" },
        { status: 400 },
      );
    }
    await updatePaymentSettings({ squareTerminalDeviceId: deviceId });
    const status = await getSquareStatus({
      probeTerminal: Boolean(deviceId),
    });
    return NextResponse.json({ ok: true, status });
  }

  if (action === "probe") {
    const status = await getSquareStatus({ probeTerminal: true });
    return NextResponse.json({ ok: true, status });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

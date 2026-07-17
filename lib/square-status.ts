import { getPaymentSettings } from "@/lib/payment-settings";
import {
  createSquareDeviceCode,
  getEnvSquareTerminalDeviceId,
  getSquareDeviceCode,
  getSquareEnvironment,
  getSquareLocationSummary,
  isSquareConfigured,
  listSquareDeviceCodes,
  listSquareDevices,
  maskSecret,
  probeSquareTerminalDevice,
  type SquareDeviceCode,
  type SquareDeviceSummary,
} from "@/lib/square";
import { getSiteUrl } from "@/lib/guest";

export type SquareStatusPayload = {
  checkedAt: string;
  configured: boolean;
  readyForLinks: boolean;
  readyForTerminal: boolean;
  environment: "production" | "sandbox";
  accessToken: {
    present: boolean;
    masked: string | null;
  };
  webhook: {
    signatureConfigured: boolean;
    skipVerify: boolean;
    notificationUrl: string;
  };
  location: {
    configuredId: string | null;
    live: {
      id: string;
      name: string | null;
      status: string | null;
      currency: string | null;
      businessName: string | null;
      country: string | null;
      type: string | null;
    } | null;
    error: string | null;
  };
  terminal: {
    envDeviceId: string | null;
    dbDeviceId: string | null;
    activeDeviceId: string | null;
    activeSource: "database" | "env" | null;
    probe: { ok: boolean; detail: string } | null;
  };
  devices: SquareDeviceSummary[];
  deviceCodes: SquareDeviceCode[];
  apiError: string | null;
};

/** DB override wins over env for Terminal checkouts. */
export async function resolveSquareTerminalDeviceId(): Promise<string | null> {
  try {
    const settings = await getPaymentSettings();
    const fromDb = settings.squareTerminalDeviceId?.trim();
    if (fromDb) return fromDb;
  } catch {
    /* fall through to env */
  }
  return getEnvSquareTerminalDeviceId();
}

export async function isSquareTerminalReady() {
  return isSquareConfigured() && Boolean(await resolveSquareTerminalDeviceId());
}

export async function getSquareStatus(opts?: {
  probeTerminal?: boolean;
}): Promise<SquareStatusPayload> {
  const envDeviceId = getEnvSquareTerminalDeviceId();
  let dbDeviceId: string | null = null;
  try {
    const settings = await getPaymentSettings();
    dbDeviceId = settings.squareTerminalDeviceId?.trim() || null;
  } catch {
    dbDeviceId = null;
  }

  const activeDeviceId = dbDeviceId || envDeviceId;
  const activeSource: "database" | "env" | null = dbDeviceId
    ? "database"
    : envDeviceId
      ? "env"
      : null;

  const configured = isSquareConfigured();
  const token = process.env.SQUARE_ACCESS_TOKEN?.trim() || null;
  const locationId = process.env.SQUARE_LOCATION_ID?.trim() || null;

  const payload: SquareStatusPayload = {
    checkedAt: new Date().toISOString(),
    configured,
    readyForLinks: configured,
    readyForTerminal: configured && Boolean(activeDeviceId),
    environment: getSquareEnvironment(),
    accessToken: {
      present: Boolean(token),
      masked: maskSecret(token),
    },
    webhook: {
      signatureConfigured: Boolean(
        process.env.SQUARE_WEBHOOK_SIGNATURE_KEY?.trim(),
      ),
      skipVerify: process.env.SQUARE_WEBHOOK_SKIP_VERIFY === "1",
      notificationUrl: `${getSiteUrl()}/api/square/webhook`,
    },
    location: {
      configuredId: locationId,
      live: null,
      error: null,
    },
    terminal: {
      envDeviceId,
      dbDeviceId,
      activeDeviceId,
      activeSource,
      probe: null,
    },
    devices: [],
    deviceCodes: [],
    apiError: null,
  };

  if (!configured) {
    payload.location.error = "SQUARE_ACCESS_TOKEN or SQUARE_LOCATION_ID missing";
    return payload;
  }

  try {
    payload.location.live = await getSquareLocationSummary(locationId || undefined);
  } catch (err) {
    payload.location.error =
      err instanceof Error ? err.message : "Could not load Square location";
  }

  try {
    payload.devices = await listSquareDevices();
  } catch (err) {
    payload.apiError =
      err instanceof Error ? err.message : "Could not list Square devices";
  }

  try {
    payload.deviceCodes = await listSquareDeviceCodes();
  } catch (err) {
    if (!payload.apiError) {
      payload.apiError =
        err instanceof Error ? err.message : "Could not list device codes";
    }
  }

  if (opts?.probeTerminal && activeDeviceId) {
    payload.terminal.probe = await probeSquareTerminalDevice(activeDeviceId);
    payload.readyForTerminal = payload.terminal.probe.ok;
  }

  return payload;
}

export async function createTerminalPairingCode(name?: string) {
  return createSquareDeviceCode({ name });
}

export async function refreshDeviceCode(id: string) {
  return getSquareDeviceCode(id);
}

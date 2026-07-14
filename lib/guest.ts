import { randomBytes } from "crypto";

export function createGuestToken() {
  return randomBytes(18).toString("base64url");
}

export function createClientToken() {
  return randomBytes(18).toString("base64url");
}

export function getSiteUrl() {
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  }
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL.replace(/\/$/, "")}`;
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL.replace(/\/$/, "")}`;
  }
  return "http://localhost:3000";
}

export function guestServeUrl(token: string) {
  return `${getSiteUrl()}/serve/${token}`;
}

export function clientPortalUrl(token: string) {
  return `${getSiteUrl()}/client/${token}`;
}

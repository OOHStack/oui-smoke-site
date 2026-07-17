/** Canonical public + ops contact for Oui Smoke (Google Workspace / MX live). */
export const CONTACT_EMAIL = "contact@ouismoke.co";

/** Fallback if OPS_NOTIFY_EMAIL is unset or blocked. */
export const OPS_INBOX_EMAIL = CONTACT_EMAIL;

/** Default Resend From header. */
export const CONTACT_FROM = `Oui Smoke <${CONTACT_EMAIL}>`;

export const CONTACT_MAILTO = `mailto:${CONTACT_EMAIL}`;

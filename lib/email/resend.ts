import { Resend } from "resend";

let client: Resend | null = null;

/** Never route Oui Smoke mail through OOHStack inboxes. */
const BLOCKED_RECIPIENT_HOSTS = new Set(["oohstack.com"]);

export function isEmailConfigured() {
  return Boolean(process.env.RESEND_API_KEY);
}

function getResend() {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  if (!client) client = new Resend(key);
  return client;
}

export function getFromAddress() {
  return process.env.RESEND_FROM || "Oui Smoke <bookings@ouismoke.co>";
}

export function getOpsNotifyEmail() {
  const raw =
    process.env.OPS_NOTIFY_EMAIL ||
    process.env.RESEND_OPS_EMAIL ||
    "ouismokeinc@gmail.com";
  const email = raw.trim().toLowerCase();
  if (isBlockedRecipient(email)) {
    console.warn(
      "OPS_NOTIFY_EMAIL blocked (oohstack) — using ouismokeinc@gmail.com",
    );
    return "ouismokeinc@gmail.com";
  }
  return email;
}

function isBlockedRecipient(email: string) {
  const host = email.split("@")[1] || "";
  return BLOCKED_RECIPIENT_HOSTS.has(host.toLowerCase());
}

function filterRecipients(to: string[]) {
  const allowed: string[] = [];
  for (const raw of to) {
    const email = raw.trim();
    if (!email) continue;
    if (isBlockedRecipient(email.toLowerCase())) {
      console.warn("email blocked — oohstack recipient skipped:", email);
      continue;
    }
    allowed.push(email);
  }
  return allowed;
}

export type SendEmailInput = {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
};

/** Best-effort send — never throws to callers (logs failures). */
export async function sendEmail(input: SendEmailInput): Promise<boolean> {
  const resend = getResend();
  if (!resend) {
    console.warn("email skipped — RESEND_API_KEY not set:", input.subject);
    return false;
  }

  const to = Array.isArray(input.to) ? input.to : [input.to];
  const recipients = filterRecipients(to);
  if (recipients.length === 0) return false;

  const replyTo = input.replyTo || getOpsNotifyEmail();

  try {
    const { data, error } = await resend.emails.send({
      from: getFromAddress(),
      to: recipients,
      subject: input.subject,
      html: input.html,
      text: input.text,
      replyTo: isBlockedRecipient(replyTo.toLowerCase())
        ? "ouismokeinc@gmail.com"
        : replyTo,
    });
    if (error) {
      console.error("resend error", input.subject, recipients, error);
      return false;
    }
    console.info(
      "resend sent",
      input.subject,
      recipients.join(","),
      data?.id ?? "no-id",
    );
    return true;
  } catch (err) {
    console.error("resend send failed", input.subject, recipients, err);
    return false;
  }
}

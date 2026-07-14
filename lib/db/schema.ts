import {
  pgTable,
  serial,
  text,
  integer,
  timestamp,
  boolean,
  pgEnum,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

export const jobStatusEnum = pgEnum("job_status", [
  "draft",
  "confirmed",
  "active",
  "completed",
  "cancelled",
]);

/** How the event is paid — gates Square deposit + email copy */
export const paymentModelEnum = pgEnum("payment_model", [
  "client_deposit",
  "pay_at_event",
  "complimentary",
]);

export const hookahStatusEnum = pgEnum("hookah_status", [
  "available",
  "out",
  "maintenance",
  "retired",
]);

export const assignmentStatusEnum = pgEnum("assignment_status", [
  "staged",
  "out",
  "returned",
]);

export const returnOutcomeEnum = pgEnum("return_outcome", [
  "returned",
  "not_returned",
  "returned_with_issue",
]);

export const flavourKindEnum = pgEnum("flavour_kind", ["single", "mix"]);

export const eventTypeEnum = pgEnum("event_type", [
  "note",
  "status_change",
  "sent_out",
  "returned",
  "checked",
  "refill",
  "issue",
  "alarm",
  "created",
]);

export const hookahs = pgTable("hookahs", {
  id: serial("id").primaryKey(),
  modelNumber: integer("model_number").notNull().unique(),
  label: text("label"),
  status: hookahStatusEnum("status").notNull().default("available"),
  notes: text("notes").default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const flavours = pgTable("flavours", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  kind: flavourKindEnum("kind").notNull().default("single"),
  /** Staff-only recipe notes — not shown to guests */
  components: text("components").default(""),
  /** Guest-facing flavour copy */
  description: text("description").default(""),
  active: boolean("active").notNull().default(true),
  timesUsed: integer("times_used").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const jobs = pgTable("jobs", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  clientName: text("client_name").notNull(),
  clientEmail: text("client_email").default(""),
  clientPhone: text("client_phone").default(""),
  location: text("location").default(""),
  startsAt: timestamp("starts_at", { withTimezone: true }),
  endsAt: timestamp("ends_at", { withTimezone: true }),
  bookedHours: integer("booked_hours").default(4),
  status: jobStatusEnum("status").notNull().default("draft"),
  /** client_deposit = Square deposit; pay_at_event = guests/host pay on floor; complimentary = no charge */
  paymentModel: paymentModelEnum("payment_model").notNull().default("client_deposit"),
  checkIntervalMinutes: integer("check_interval_minutes").notNull().default(45),
  guestCount: integer("guest_count"),
  quotedCents: integer("quoted_cents"),
  actualCents: integer("actual_cents"),
  /** Package jobs: suggested deposit as % of quote (25 / 50 / 100 typical) */
  depositPercent: integer("deposit_percent").notNull().default(50),
  tipCents: integer("tip_cents").default(0),
  staffNames: text("staff_names").default(""),
  packingNotes: text("packing_notes").default(""),
  outcomeNotes: text("outcome_notes").default(""),
  rating: integer("rating"),
  rebookLikely: boolean("rebook_likely"),
  incidentCount: integer("incident_count").notNull().default(0),
  /** Read-only live portal for the venue/host */
  clientToken: text("client_token").unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const jobHookahs = pgTable("job_hookahs", {
  id: serial("id").primaryKey(),
  jobId: integer("job_id")
    .notNull()
    .references(() => jobs.id, { onDelete: "cascade" }),
  hookahId: integer("hookah_id")
    .notNull()
    .references(() => hookahs.id),
  status: assignmentStatusEnum("status").notNull().default("staged"),
  flavourId: integer("flavour_id").references(() => flavours.id),
  flavourLabel: text("flavour_label").default(""),
  sentOutAt: timestamp("sent_out_at", { withTimezone: true }),
  returnedAt: timestamp("returned_at", { withTimezone: true }),
  lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
  nextCheckAt: timestamp("next_check_at", { withTimezone: true }),
  checkCount: integer("check_count").notNull().default(0),
  refillCount: integer("refill_count").notNull().default(0),
  sortOrder: integer("sort_order").notNull().default(0),
  outNotes: text("out_notes").default(""),
  returnNotes: text("return_notes").default(""),
  returnOutcome: returnOutcomeEnum("return_outcome"),
  issueFlag: boolean("issue_flag").notNull().default(false),
  guestToken: text("guest_token").unique(),
  guestRating: integer("guest_rating"),
  guestComment: text("guest_comment").default(""),
  guestFeedbackAt: timestamp("guest_feedback_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const serviceRequestTypeEnum = pgEnum("service_request_type", [
  "coals",
  "refill",
  "issue",
  "other",
]);

export const serviceRequestStatusEnum = pgEnum("service_request_status", [
  "open",
  "acknowledged",
  "resolved",
  "cancelled",
]);

export const serviceRequests = pgTable("service_requests", {
  id: serial("id").primaryKey(),
  jobId: integer("job_id")
    .notNull()
    .references(() => jobs.id, { onDelete: "cascade" }),
  jobHookahId: integer("job_hookah_id")
    .notNull()
    .references(() => jobHookahs.id, { onDelete: "cascade" }),
  type: serviceRequestTypeEnum("type").notNull(),
  message: text("message").default(""),
  flavourId: integer("flavour_id").references(() => flavours.id),
  flavourLabel: text("flavour_label").default(""),
  priceCents: integer("price_cents"),
  priceAgreed: boolean("price_agreed").notNull().default(false),
  status: serviceRequestStatusEnum("status").notNull().default("open"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  acknowledgedBy: text("acknowledged_by").default(""),
  resolvedBy: text("resolved_by").default(""),
});

export const refillSourceEnum = pgEnum("refill_source", ["staff", "guest"]);

export const hookahRefills = pgTable("hookah_refills", {
  id: serial("id").primaryKey(),
  jobId: integer("job_id")
    .notNull()
    .references(() => jobs.id, { onDelete: "cascade" }),
  jobHookahId: integer("job_hookah_id")
    .notNull()
    .references(() => jobHookahs.id, { onDelete: "cascade" }),
  flavourId: integer("flavour_id").references(() => flavours.id),
  flavourLabel: text("flavour_label").notNull().default(""),
  previousFlavourLabel: text("previous_flavour_label").default(""),
  priceCents: integer("price_cents").notNull().default(0),
  source: refillSourceEnum("source").notNull().default("staff"),
  serviceRequestId: integer("service_request_id").references(() => serviceRequests.id, {
    onDelete: "set null",
  }),
  note: text("note").default(""),
  createdBy: text("created_by").default("ops"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const jobEvents = pgTable("job_events", {
  id: serial("id").primaryKey(),
  jobId: integer("job_id")
    .notNull()
    .references(() => jobs.id, { onDelete: "cascade" }),
  jobHookahId: integer("job_hookah_id").references(() => jobHookahs.id, {
    onDelete: "set null",
  }),
  type: eventTypeEnum("type").notNull().default("note"),
  message: text("message").notNull(),
  createdBy: text("created_by").default("ops"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const jobPhotos = pgTable("job_photos", {
  id: serial("id").primaryKey(),
  jobId: integer("job_id")
    .notNull()
    .references(() => jobs.id, { onDelete: "cascade" }),
  jobHookahId: integer("job_hookah_id").references(() => jobHookahs.id, {
    onDelete: "set null",
  }),
  url: text("url").notNull(),
  downloadUrl: text("download_url").notNull(),
  pathname: text("pathname").notNull(),
  contentType: text("content_type").default("image/jpeg"),
  sizeBytes: integer("size_bytes").default(0),
  consentAgreed: boolean("consent_agreed").notNull().default(false),
  socialHandle: text("social_handle").default(""),
  consentedAt: timestamp("consented_at", { withTimezone: true }),
  /** Staff moderation for social / marketing use */
  approvedForSocial: boolean("approved_for_social").notNull().default(false),
  featured: boolean("featured").notNull().default(false),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  reviewedBy: text("reviewed_by").default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/** Staff browser push subscriptions for guest service alerts */
export const pushSubscriptions = pgTable("push_subscriptions", {
  id: serial("id").primaryKey(),
  endpoint: text("endpoint").notNull().unique(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  userAgent: text("user_agent").default(""),
  createdBy: text("created_by").default("ops"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const opsRoleEnum = pgEnum("ops_role", ["admin", "staff"]);

export const opsUsers = pgTable("ops_users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  displayName: text("display_name").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: opsRoleEnum("role").notNull().default("staff"),
  active: boolean("active").notNull().default(true),
  passwordResetTokenHash: text("password_reset_token_hash"),
  passwordResetExpiresAt: timestamp("password_reset_expires_at", {
    withTimezone: true,
  }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const paymentKindEnum = pgEnum("payment_kind", [
  "deposit",
  "balance",
  "refill",
  "tip",
  "other",
]);

export const paymentStatusEnum = pgEnum("payment_status", [
  "pending",
  "succeeded",
  "failed",
  "cancelled",
]);

/** Square (and future) payment ledger — source of truth for money movement */
export const payments = pgTable("payments", {
  id: serial("id").primaryKey(),
  jobId: integer("job_id")
    .notNull()
    .references(() => jobs.id, { onDelete: "cascade" }),
  jobHookahId: integer("job_hookah_id").references(() => jobHookahs.id, {
    onDelete: "set null",
  }),
  kind: paymentKindEnum("kind").notNull().default("deposit"),
  status: paymentStatusEnum("status").notNull().default("pending"),
  amountCents: integer("amount_cents").notNull(),
  currency: text("currency").notNull().default("CAD"),
  label: text("label").default(""),
  checkoutUrl: text("checkout_url"),
  squarePaymentLinkId: text("square_payment_link_id"),
  squareOrderId: text("square_order_id"),
  squarePaymentId: text("square_payment_id"),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  createdBy: text("created_by").default("ops"),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const jobsRelations = relations(jobs, ({ many }) => ({
  assignments: many(jobHookahs),
  events: many(jobEvents),
  serviceRequests: many(serviceRequests),
  photos: many(jobPhotos),
  payments: many(payments),
}));

export const jobHookahsRelations = relations(jobHookahs, ({ one, many }) => ({
  job: one(jobs, { fields: [jobHookahs.jobId], references: [jobs.id] }),
  hookah: one(hookahs, { fields: [jobHookahs.hookahId], references: [hookahs.id] }),
  flavour: one(flavours, {
    fields: [jobHookahs.flavourId],
    references: [flavours.id],
  }),
  serviceRequests: many(serviceRequests),
  refills: many(hookahRefills),
  photos: many(jobPhotos),
}));

export const serviceRequestsRelations = relations(serviceRequests, ({ one }) => ({
  job: one(jobs, { fields: [serviceRequests.jobId], references: [jobs.id] }),
  assignment: one(jobHookahs, {
    fields: [serviceRequests.jobHookahId],
    references: [jobHookahs.id],
  }),
  flavour: one(flavours, {
    fields: [serviceRequests.flavourId],
    references: [flavours.id],
  }),
}));

export const hookahRefillsRelations = relations(hookahRefills, ({ one }) => ({
  job: one(jobs, { fields: [hookahRefills.jobId], references: [jobs.id] }),
  assignment: one(jobHookahs, {
    fields: [hookahRefills.jobHookahId],
    references: [jobHookahs.id],
  }),
  flavour: one(flavours, {
    fields: [hookahRefills.flavourId],
    references: [flavours.id],
  }),
}));

export const jobEventsRelations = relations(jobEvents, ({ one }) => ({
  job: one(jobs, { fields: [jobEvents.jobId], references: [jobs.id] }),
  assignment: one(jobHookahs, {
    fields: [jobEvents.jobHookahId],
    references: [jobHookahs.id],
  }),
}));

export const jobPhotosRelations = relations(jobPhotos, ({ one }) => ({
  job: one(jobs, { fields: [jobPhotos.jobId], references: [jobs.id] }),
  assignment: one(jobHookahs, {
    fields: [jobPhotos.jobHookahId],
    references: [jobHookahs.id],
  }),
}));

export type Job = typeof jobs.$inferSelect;
export type Hookah = typeof hookahs.$inferSelect;
export type Flavour = typeof flavours.$inferSelect;
export type JobHookah = typeof jobHookahs.$inferSelect;
export type JobEvent = typeof jobEvents.$inferSelect;
export type ServiceRequest = typeof serviceRequests.$inferSelect;
export type HookahRefill = typeof hookahRefills.$inferSelect;
export type JobPhoto = typeof jobPhotos.$inferSelect;
export type PushSubscription = typeof pushSubscriptions.$inferSelect;
export type OpsUser = typeof opsUsers.$inferSelect;
export type Payment = typeof payments.$inferSelect;

/** Singleton row — global payment defaults & automations */
export const paymentSettings = pgTable("payment_settings", {
  id: integer("id").primaryKey().default(1),
  defaultDepositPercent: integer("default_deposit_percent").notNull().default(50),
  autoDepositOnBooking: boolean("auto_deposit_on_booking").notNull().default(true),
  autoDepositOnQuote: boolean("auto_deposit_on_quote").notNull().default(true),
  autoBalanceEnabled: boolean("auto_balance_enabled").notNull().default(true),
  autoBalanceDaysBefore: integer("auto_balance_days_before").notNull().default(7),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type PaymentSettings = typeof paymentSettings.$inferSelect;

export const paymentsRelations = relations(payments, ({ one }) => ({
  job: one(jobs, { fields: [payments.jobId], references: [jobs.id] }),
  assignment: one(jobHookahs, {
    fields: [payments.jobHookahId],
    references: [jobHookahs.id],
  }),
}));

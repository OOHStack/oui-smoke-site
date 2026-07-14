"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { format } from "date-fns";
import Countdown from "@/components/admin/Countdown";
import StatusBadge from "@/components/admin/StatusBadge";
import HookahBoard from "@/components/admin/HookahBoard";
import GuestLedger from "@/components/admin/GuestLedger";
import { PasswordField } from "@/components/admin/PasswordField";
import { useConfirm } from "@/components/admin/ConfirmDialog";
import { useSse } from "@/lib/hooks/useSse";
import { paymentModelLabel } from "@/lib/payment-model";
import { formatCadCents } from "@/lib/job-balance";
import {
  defaultRefillCentsForTier,
  type GuestPayTier,
} from "@/lib/ops/guest-pay";
import { resolveTipSplit } from "@/lib/ops/tip-split";
import TipSplitEditor from "@/components/admin/TipSplitEditor";
import {
  DEFAULT_PRICING,
  type PricingConfig,
} from "@/lib/pricing";

type Flavour = { id: number; name: string; active: boolean };
type Hookah = { id: number; modelNumber: number; label: string | null; status: string };

type ActiveCall = {
  id: number;
  type: "coals" | "refill" | "issue" | "other" | string;
  message: string | null;
  status: "open" | "acknowledged" | string;
  flavourId?: number | null;
  flavourLabel?: string | null;
  priceCents?: number | null;
  priceAgreed?: boolean | null;
  createdAt: string;
  acknowledgedAt: string | null;
};

type Assignment = {
  id: number;
  status: string;
  flavourId: number | null;
  flavourLabel: string | null;
  nextCheckAt: string | null;
  lastCheckedAt: string | null;
  checkCount: number;
  refillCount: number;
  sortOrder?: number;
  issueFlag: boolean;
  guestToken: string | null;
  guestPayTier?: GuestPayTier | null;
  guestRating?: number | null;
  guestComment?: string | null;
  guestFeedbackAt?: string | null;
  sentOutAt: string | null;
  returnNotes: string | null;
  returnOutcome: "returned" | "not_returned" | "returned_with_issue" | null;
  hookah: Hookah;
  flavour: Flavour | null;
  activeCall: ActiveCall | null;
};

function formatMoney(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function returnOutcomeLabel(outcome: string | null | undefined) {
  if (outcome === "not_returned") return "Not returned";
  if (outcome === "returned_with_issue") return "Returned with issue";
  if (outcome === "returned") return "Returned OK";
  return null;
}

function callTypeLabel(type: string) {
  if (type === "coals") return "Coals";
  if (type === "refill") return "Refill";
  if (type === "issue") return "Issue";
  return "Help";
}

type JobEvent = {
  id: number;
  type: string;
  message: string;
  createdBy: string | null;
  createdAt: string;
};

type JobPhoto = {
  id: number;
  url: string;
  downloadUrl: string;
  pathname: string;
  contentType: string | null;
  sizeBytes: number | null;
  jobHookahId: number | null;
  consentAgreed?: boolean;
  socialHandle?: string | null;
  consentedAt?: string | null;
  approvedForSocial?: boolean;
  featured?: boolean;
  createdAt: string;
};

type Job = {
  id: number;
  title: string;
  status: string;
  paymentModel?: "client_deposit" | "pay_at_event" | "complimentary";
  depositPercent?: number;
  paymentSummary?: {
    dueCents: number;
    paidCents: number;
    balanceCents: number;
    depositPercent: number;
    statusLabel: string;
    status: string;
  };
  clientName: string;
  clientEmail: string | null;
  clientPhone: string | null;
  location: string | null;
  startsAt: string | null;
  endsAt: string | null;
  bookedHours: number | null;
  checkIntervalMinutes: number;
  guestCount: number | null;
  staffNames: string | null;
  packingNotes: string | null;
  actualCents: number | null;
  tipCents: number | null;
  tipSplitJson?: string | null;
  quotedCents: number | null;
  outcomeNotes: string | null;
  clientToken?: string | null;
  clientPortalUrl?: string | null;
};

function toLocalInput(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function playBeep() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    gain.gain.value = 0.15;
    osc.start();
    osc.stop(ctx.currentTime + 0.2);
    setTimeout(() => ctx.close(), 500);
  } catch {
    /* audio unavailable */
  }
}

function centsToDollars(cents: number | null | undefined): string {
  if (cents == null) return "";
  return (cents / 100).toFixed(2);
}

function dollarsToCents(val: string): number | undefined {
  if (!val) return undefined;
  const n = parseFloat(val);
  if (Number.isNaN(n)) return undefined;
  return Math.round(n * 100);
}

export default function JobDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { confirm, dialog } = useConfirm();
  const jobId = params.id as string;

  const [job, setJob] = useState<Job | null>(null);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [events, setEvents] = useState<JobEvent[]>([]);
  const [payments, setPayments] = useState<
    Array<{
      id: number;
      kind: string;
      status: string;
      amountCents: number;
      jobHookahId: number | null;
      label?: string | null;
    }>
  >([]);
  const [ledgerBusyId, setLedgerBusyId] = useState<number | null>(null);
  const [tipSplitBusy, setTipSplitBusy] = useState(false);
  const [flavours, setFlavours] = useState<Flavour[]>([]);
  const [availableHookahs, setAvailableHookahs] = useState<Hookah[]>([]);
  const [photos, setPhotos] = useState<JobPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [photoBusy, setPhotoBusy] = useState<number | null>(null);
  const [portalBusy, setPortalBusy] = useState(false);
  const [portalMsg, setPortalMsg] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [editBusy, setEditBusy] = useState(false);
  const [guestRatesOpen, setGuestRatesOpen] = useState(false);
  const [pricing, setPricing] = useState<PricingConfig>(DEFAULT_PRICING);
  const [editError, setEditError] = useState("");
  const [editForm, setEditForm] = useState({
    title: "",
    clientName: "",
    clientEmail: "",
    clientPhone: "",
    location: "",
    startsAt: "",
    endsAt: "",
    bookedHours: "4",
    checkIntervalMinutes: "45",
    guestCount: "",
    quotedDollars: "",
    staffNames: "",
    packingNotes: "",
  });
  const editDialogRef = useRef<HTMLDivElement>(null);

  const [resetOpen, setResetOpen] = useState(false);
  const [resetPassword, setResetPassword] = useState("");
  const [resetBusy, setResetBusy] = useState(false);
  const [resetError, setResetError] = useState("");
  const resetDialogRef = useRef<HTMLDivElement>(null);

  const [outcome, setOutcome] = useState({
    actualDollars: "",
    tipDollars: "",
    outcomeNotes: "",
  });

  const overdueNotified = useRef<Set<number>>(new Set());
  const prevOverdue = useRef<Set<number>>(new Set());

  const load = useCallback(async () => {
    const [jobRes, photosRes] = await Promise.all([
      fetch(`/api/jobs/${jobId}`),
      fetch(`/api/jobs/${jobId}/photos`),
    ]);
    if (!jobRes.ok) {
      setError("Failed to load job");
      setLoading(false);
      return;
    }
    const data = await jobRes.json();
    const { assignments: a, events: ev, payments: payRows, ...jobData } = data;
    setJob(jobData as Job);
    setAssignments(a ?? []);
    setEvents(ev ?? []);
    setPayments(payRows ?? []);
    if (photosRes.ok) {
      const photoData = await photosRes.json();
      setPhotos(photoData.photos ?? []);
    }
    setOutcome({
      actualDollars: centsToDollars(jobData.actualCents),
      tipDollars: centsToDollars(jobData.tipCents),
      outcomeNotes: jobData.outcomeNotes ?? "",
    });
    setLoading(false);
  }, [jobId]);

  async function deletePhoto(photoId: number) {
    setPhotoBusy(photoId);
    try {
      const res = await fetch(`/api/jobs/${jobId}/photos`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photoId }),
      });
      if (res.ok) {
        setPhotos((prev) => prev.filter((p) => p.id !== photoId));
      }
    } finally {
      setPhotoBusy(null);
    }
  }

  async function reviewPhoto(
    photoId: number,
    patch: { approvedForSocial?: boolean; featured?: boolean },
  ) {
    setPhotoBusy(photoId);
    try {
      const res = await fetch(`/api/jobs/${jobId}/photos`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photoId, ...patch }),
      });
      if (res.ok) {
        const data = await res.json();
        setPhotos((prev) =>
          prev.map((p) => (p.id === photoId ? { ...p, ...data.photo } : p)),
        );
      }
    } finally {
      setPhotoBusy(null);
    }
  }

  async function copyClientPortal() {
    setPortalBusy(true);
    setPortalMsg("");
    try {
      let url = job?.clientPortalUrl ?? null;
      if (!url) {
        const res = await fetch(`/api/jobs/${jobId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ensureClientToken: true }),
        });
        if (!res.ok) {
          setPortalMsg("Couldn’t create portal link");
          return;
        }
        const data = await res.json();
        url = data.clientPortalUrl;
        setJob((prev) =>
          prev
            ? {
                ...prev,
                clientToken: data.clientToken,
                clientPortalUrl: data.clientPortalUrl,
              }
            : prev,
        );
      }
      if (!url) {
        setPortalMsg("No portal link");
        return;
      }
      await navigator.clipboard.writeText(url);
      setPortalMsg("Client portal link copied");
    } catch {
      setPortalMsg("Copy failed");
    } finally {
      setPortalBusy(false);
    }
  }

  useEffect(() => {
    load();
    fetch("/api/flavours?active=1")
      .then((r) => r.json())
      .then((d) => setFlavours(d.flavours ?? d))
      .catch(() => {});
    fetch("/api/hookahs")
      .then((r) => r.json())
      .then((d) => {
        const list = d.hookahs ?? d;
        setAvailableHookahs(list.filter((h: Hookah) => h.status === "available"));
      })
      .catch(() => {});

    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      Notification.requestPermission();
    }

    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/pricing");
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && data.pricing) {
          const p = data.pricing as PricingConfig & {
            refillPriceDollars?: number;
            guestRebookPromo?: unknown;
          };
          const {
            refillPriceDollars: _d,
            guestRebookPromo: _g,
            ...rest
          } = p;
          setPricing({ ...DEFAULT_PRICING, ...rest });
        }
      } catch {
        /* keep fallback */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [load]);

  useSse<{
    job?: Job & {
      assignments: Assignment[];
      events: JobEvent[];
      payments?: Array<{
        id: number;
        kind: string;
        status: string;
        amountCents: number;
        jobHookahId: number | null;
        label?: string | null;
      }>;
    };
    error?: string;
  }>(
    Number.isFinite(jobId) ? `/api/stream/jobs/${jobId}` : null,
    (data) => {
      if (!data.job || data.error) return;
      const { assignments: a, events: ev, payments: payRows, ...jobData } =
        data.job;
      setJob(jobData as Job);
      setAssignments(a ?? []);
      setEvents(ev ?? []);
      if (payRows) setPayments(payRows);
      setOutcome({
        actualDollars: centsToDollars(jobData.actualCents),
        tipDollars: centsToDollars(jobData.tipCents),
        outcomeNotes: jobData.outcomeNotes ?? "",
      });
      setLoading(false);
    },
  );

  useEffect(() => {
    const now = Date.now();
    const currentOverdue = new Set<number>();

    for (const a of assignments) {
      if (a.status !== "out" || !a.nextCheckAt) continue;
      if (new Date(a.nextCheckAt).getTime() < now) {
        currentOverdue.add(a.id);

        if (!prevOverdue.current.has(a.id)) {
          playBeep();
        }

        if (!overdueNotified.current.has(a.id)) {
          overdueNotified.current.add(a.id);
          if (typeof Notification !== "undefined" && Notification.permission === "granted") {
            new Notification("Check overdue", {
              body: `Hookah #${a.hookah.modelNumber} on ${job?.title ?? "job"} needs attention`,
              tag: `overdue-${a.id}`,
            });
          }
        }
      }
    }

    prevOverdue.current = currentOverdue;
  }, [assignments, job?.title]);

  async function patchJob(body: Record<string, unknown>) {
    const res = await fetch(`/api/jobs/${jobId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) await load();
    else setError("Update failed");
  }

  async function hookahAction(body: Record<string, unknown>) {
    const res = await fetch(`/api/jobs/${jobId}/hookahs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      await load();
      // Refresh fleet so newly unavailable / free units stay accurate
      fetch("/api/hookahs")
        .then((r) => r.json())
        .then((d) => {
          const list = d.hookahs ?? d;
          setAvailableHookahs(list.filter((h: Hookah) => h.status === "available"));
        })
        .catch(() => {});
    } else {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? "Action failed");
    }
  }

  async function saveOutcome() {
    await patchJob({
      actualCents: dollarsToCents(outcome.actualDollars),
      tipCents: dollarsToCents(outcome.tipDollars) ?? 0,
      outcomeNotes: outcome.outcomeNotes,
    });
  }

  function openEdit() {
    if (!job) return;
    setEditForm({
      title: job.title,
      clientName: job.clientName,
      clientEmail: job.clientEmail ?? "",
      clientPhone: job.clientPhone ?? "",
      location: job.location ?? "",
      startsAt: toLocalInput(job.startsAt),
      endsAt: toLocalInput(job.endsAt),
      bookedHours: job.bookedHours != null ? String(job.bookedHours) : "4",
      checkIntervalMinutes: String(job.checkIntervalMinutes ?? 45),
      guestCount: job.guestCount != null ? String(job.guestCount) : "",
      quotedDollars: centsToDollars(job.quotedCents),
      staffNames: job.staffNames ?? "",
      packingNotes: job.packingNotes ?? "",
    });
    setEditError("");
    setEditOpen(true);
  }

  useEffect(() => {
    if (!editOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setEditOpen(false);
    }
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    editDialogRef.current?.focus();
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [editOpen]);

  useEffect(() => {
    if (!resetOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setResetOpen(false);
    }
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    resetDialogRef.current?.focus();
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [resetOpen]);

  useEffect(() => {
    if (!guestRatesOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setGuestRatesOpen(false);
    }
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [guestRatesOpen]);

  async function saveEdit(e: FormEvent) {
    e.preventDefault();
    setEditBusy(true);
    setEditError("");
    try {
      const res = await fetch(`/api/jobs/${jobId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: editForm.title,
          clientName: editForm.clientName,
          clientEmail: editForm.clientEmail,
          clientPhone: editForm.clientPhone,
          location: editForm.location,
          startsAt: editForm.startsAt
            ? new Date(editForm.startsAt).toISOString()
            : null,
          endsAt: editForm.endsAt ? new Date(editForm.endsAt).toISOString() : null,
          bookedHours: editForm.bookedHours
            ? parseInt(editForm.bookedHours, 10)
            : null,
          checkIntervalMinutes: parseInt(editForm.checkIntervalMinutes, 10),
          guestCount: editForm.guestCount
            ? parseInt(editForm.guestCount, 10)
            : null,
          quotedCents: dollarsToCents(editForm.quotedDollars) ?? null,
          staffNames: editForm.staffNames,
          packingNotes: editForm.packingNotes,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setEditError(d.error ?? "Failed to update job");
        return;
      }
      setEditOpen(false);
      await load();
    } finally {
      setEditBusy(false);
    }
  }

  async function deleteJob() {
    const ok = await confirm({
      title: "Delete job?",
      message: `Delete “${job?.title ?? "this job"}”? This removes the job, assignments, events, and guest photos.`,
      confirmLabel: "Delete job",
    });
    if (!ok) return;
    const res = await fetch(`/api/jobs/${jobId}`, { method: "DELETE" });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? "Failed to delete job");
      return;
    }
    router.push("/admin/jobs");
  }

  function openReset() {
    setResetPassword("");
    setResetError("");
    setResetOpen(true);
  }

  async function confirmReset(e: FormEvent) {
    e.preventDefault();
    if (!resetPassword.trim()) {
      setResetError("Enter your password to reset");
      return;
    }
    setResetBusy(true);
    setResetError("");
    try {
      const res = await fetch(`/api/jobs/${jobId}/reset`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: resetPassword }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setResetError(d.error ?? "Failed to reset job");
        return;
      }
      setResetOpen(false);
      setResetPassword("");
      await load();
    } finally {
      setResetBusy(false);
    }
  }

  if (loading) return <p className="empty">Loading job…</p>;
  if (!job) return <p className="login-error">{error || "Job not found"}</p>;

  return (
    <div>
      {dialog}
      <div className="page-head">
        <div>
          <h1 className="page-title">{job.title}</h1>
          <p className="page-sub">
            <Link href="/admin/jobs">Jobs</Link> / #{job.id}
          </p>
        </div>
        <div className="page-head-actions">
          <button
            type="button"
            className="btn btn-sm"
            disabled={portalBusy}
            onClick={() => void copyClientPortal()}
          >
            {portalBusy ? "…" : "Copy client portal"}
          </button>
          <button type="button" className="btn btn-sm" onClick={openEdit}>
            Edit
          </button>
          <Link href={`/admin/jobs/${jobId}/payments`} className="btn btn-sm">
            Payments
          </Link>
          <button
            type="button"
            className="btn btn-sm btn-danger-ghost"
            onClick={openReset}
          >
            Reset
          </button>
          <select
            className="inline-select"
            value={job.status}
            onChange={(e) => patchJob({ status: e.target.value })}
          >
            {["draft", "confirmed", "active", "completed", "cancelled"].map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn btn-sm btn-danger-ghost"
            onClick={() => void deleteJob()}
          >
            Delete
          </button>
        </div>
      </div>
      {portalMsg ? <p className="list-meta">{portalMsg}</p> : null}

      <div className="job-console-header panel">
        <div className="job-console-meta">
          <span>
            <strong>Client:</strong> {job.clientName}
          </span>
          {job.location ? (
            <span>
              <strong>Location:</strong> {job.location}
            </span>
          ) : null}
          {job.startsAt ? (
            <span>
              <strong>Start:</strong>{" "}
              {format(new Date(job.startsAt), "MMM d, h:mm a")}
            </span>
          ) : null}
          {job.endsAt ? (
            <span>
              <strong>End:</strong>{" "}
              {format(new Date(job.endsAt), "MMM d, h:mm a")}
            </span>
          ) : null}
          <span>
            <strong>Check every:</strong> {job.checkIntervalMinutes}m
          </span>
          <span>
            <strong>Payment:</strong>{" "}
            <Link href={`/admin/jobs/${jobId}/payments`}>
              {paymentModelLabel(job.paymentModel)}
              {job.paymentSummary &&
              job.paymentModel === "client_deposit" &&
              job.paymentSummary.status !== "n_a"
                ? ` · ${job.paymentSummary.statusLabel}`
                : ""}
              {job.paymentSummary &&
              job.paymentModel === "client_deposit" &&
              job.paymentSummary.dueCents > 0
                ? ` · ${formatCadCents(job.paymentSummary.paidCents)} / ${formatCadCents(job.paymentSummary.dueCents)}`
                : ""}
            </Link>
          </span>
        </div>
      </div>

      {error ? <p className="login-error">{error}</p> : null}

      <section className="hookah-board-section">
        <div className="page-head" style={{ marginBottom: "0.65rem" }}>
          <h2 className="panel-title" style={{ margin: 0 }}>
            Hookah board
          </h2>
          <AddHookahForm
            hookahs={availableHookahs}
            flavours={flavours}
            assignedHookahIds={assignments.map((a) => a.hookah.id)}
            onAddMany={(payload) => hookahAction({ action: "add_many", ...payload })}
          />
        </div>

        {assignments.length === 0 ? (
          <p className="empty">No hookahs assigned.</p>
        ) : (
          <JobHookahBoard
            jobId={jobId}
            assignments={assignments}
            flavours={flavours}
            paymentModel={job.paymentModel}
            pricing={pricing}
            onAction={hookahAction}
            onRefresh={load}
          />
        )}
      </section>

      <section className="panel job-gallery-panel">
        <div className="page-head" style={{ marginBottom: "0.65rem" }}>
          <div>
            <h2 className="panel-title" style={{ margin: 0 }}>
              Guest photo gallery
            </h2>
            <p className="page-sub" style={{ marginTop: "0.25rem" }}>
              Consent-cleared photos — approve for IG / TikTok, feature your favorites
            </p>
          </div>
          <span className="list-meta">
            {photos.filter((p) => p.approvedForSocial).length} approved · {photos.length} total
          </span>
        </div>
        {photos.length === 0 ? (
          <p className="empty">No guest photos yet.</p>
        ) : (
          <div className="job-gallery">
            {photos.map((photo) => (
              <figure
                key={photo.id}
                className={`job-gallery__item${photo.featured ? " job-gallery__item--featured" : ""}${photo.approvedForSocial ? " job-gallery__item--approved" : ""}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photo.url} alt="Guest event photo" className="job-gallery__img" />
                <figcaption className="job-gallery__meta">
                  <span>
                    {format(new Date(photo.createdAt), "MMM d, h:mm a")}
                  </span>
                  {photo.socialHandle ? (
                    <span className="job-gallery__handle">{photo.socialHandle}</span>
                  ) : (
                    <span className="job-gallery__handle job-gallery__handle--muted">
                      No handle
                    </span>
                  )}
                  {photo.consentAgreed ? (
                    <span className="job-gallery__consent">Consent on file</span>
                  ) : null}
                  {photo.approvedForSocial ? (
                    <span className="job-gallery__consent">Approved for social</span>
                  ) : null}
                  {photo.featured ? (
                    <span className="job-gallery__consent">Featured</span>
                  ) : null}
                  <div className="job-gallery__actions">
                    <button
                      type="button"
                      className="btn btn-sm btn-ok"
                      disabled={photoBusy === photo.id}
                      onClick={() =>
                        void reviewPhoto(photo.id, {
                          approvedForSocial: !photo.approvedForSocial,
                          featured: photo.approvedForSocial ? false : photo.featured,
                        })
                      }
                    >
                      {photo.approvedForSocial ? "Unapprove" : "Approve"}
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm"
                      disabled={photoBusy === photo.id || !photo.approvedForSocial}
                      onClick={() =>
                        void reviewPhoto(photo.id, { featured: !photo.featured })
                      }
                    >
                      {photo.featured ? "Unfeature" : "Feature"}
                    </button>
                    <a
                      className="btn btn-sm"
                      href={photo.downloadUrl || photo.url}
                      download
                      target="_blank"
                      rel="noreferrer"
                    >
                      Download
                    </a>
                    <button
                      type="button"
                      className="btn btn-sm btn-danger-ghost"
                      disabled={photoBusy === photo.id}
                      onClick={() => deletePhoto(photo.id)}
                    >
                      Delete
                    </button>
                  </div>
                </figcaption>
              </figure>
            ))}
          </div>
        )}
      </section>

      <div className="grid-2">
        <section className="panel">
          <h2 className="panel-title">Activity log</h2>
          <div className="event-log">
            {events.length === 0 ? (
              <p className="empty">No events yet.</p>
            ) : (
              events.map((ev) => (
                <div key={ev.id} className="event-item">
                  <div>
                    <strong>{ev.type}</strong> — {ev.message}
                  </div>
                  <div className="event-time">
                    {format(new Date(ev.createdAt), "MMM d, h:mm a")}
                    {ev.createdBy ? ` · ${ev.createdBy}` : ""}
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="panel">
          <h2 className="panel-title">Pricing &amp; outcome</h2>
          <div className="job-pricing-summary money-story__grid money-story__grid--3">
            <div>
              <span>Quoted</span>
              <strong>
                {job.quotedCents != null && job.quotedCents > 0
                  ? formatCadCents(job.quotedCents)
                  : "—"}
              </strong>
            </div>
            <div>
              <span>Charging</span>
              <strong>
                {job.paymentModel === "complimentary" ? (
                  "Comp"
                ) : job.paymentModel === "pay_at_event" ? (
                  <button
                    type="button"
                    className="job-pricing-summary__action"
                    onClick={() => setGuestRatesOpen(true)}
                  >
                    {job.paymentSummary && job.paymentSummary.dueCents > 0
                      ? formatCadCents(job.paymentSummary.dueCents)
                      : job.quotedCents != null && job.quotedCents > 0
                        ? formatCadCents(job.quotedCents)
                        : "Guest pay"}
                  </button>
                ) : job.paymentSummary && job.paymentSummary.dueCents > 0 ? (
                  formatCadCents(job.paymentSummary.dueCents)
                ) : job.quotedCents != null && job.quotedCents > 0 ? (
                  formatCadCents(job.quotedCents)
                ) : (
                  "—"
                )}
              </strong>
            </div>
            <div>
              <span>Model</span>
              <strong>
                {job.paymentModel === "pay_at_event" ? (
                  <button
                    type="button"
                    className="job-pricing-summary__action"
                    onClick={() => setGuestRatesOpen(true)}
                  >
                    {paymentModelLabel(job.paymentModel)}
                  </button>
                ) : (
                  <Link href={`/admin/jobs/${jobId}/payments`}>
                    {paymentModelLabel(job.paymentModel)}
                  </Link>
                )}
              </strong>
            </div>
          </div>
          {job.paymentSummary &&
          job.paymentModel === "client_deposit" &&
          job.paymentSummary.dueCents > 0 ? (
            <p className="list-meta" style={{ margin: "0.55rem 0 0.85rem" }}>
              Collected {formatCadCents(job.paymentSummary.paidCents)} of{" "}
              {formatCadCents(job.paymentSummary.dueCents)}
              {job.paymentSummary.statusLabel
                ? ` · ${job.paymentSummary.statusLabel}`
                : ""}
            </p>
          ) : (
            <p className="list-meta" style={{ margin: "0.55rem 0 0.85rem" }}>
              {job.paymentModel === "pay_at_event" ? (
                <>
                  Guests settle on the floor —{" "}
                  <button
                    type="button"
                    className="job-pricing-summary__inline"
                    onClick={() => setGuestRatesOpen(true)}
                  >
                    view guest rates
                  </button>
                  {" · "}
                  <Link href="/admin/playbook" className="job-pricing-summary__inline">
                    Night-of playbook
                  </Link>
                  .
                </>
              ) : job.paymentModel === "complimentary" ? (
                "No client package charge on this job."
              ) : (
                "Set a quote in Edit job or Payments to track what you’re charging."
              )}
            </p>
          )}
          {job.paymentModel === "pay_at_event" ? (
            <GuestLedger
              jobId={jobId}
              assignments={assignments}
              payments={payments}
              tipCents={job.tipCents ?? 0}
              staffNames={job.staffNames}
              tipSplitJson={job.tipSplitJson}
              busyId={ledgerBusyId}
              tipSplitBusy={tipSplitBusy}
              pricing={pricing}
              onApplySuggestedActual={(cents) => {
                setOutcome((o) => ({
                  ...o,
                  actualDollars: (cents / 100).toFixed(2),
                }));
              }}
              onSaveTipSplit={async (json) => {
                setTipSplitBusy(true);
                try {
                  await patchJob({ tipSplitJson: json });
                  await load();
                } finally {
                  setTipSplitBusy(false);
                }
              }}
              onMarkPaid={async (assignmentId, channel) => {
                setLedgerBusyId(assignmentId);
                try {
                  await fetch(`/api/jobs/${jobId}/hookahs`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      action: "mark_onsite_paid",
                      assignmentId,
                      channel,
                    }),
                  });
                  await load();
                } finally {
                  setLedgerBusyId(null);
                }
              }}
            />
          ) : null}
          {assignments.some((a) => a.guestFeedbackAt && a.guestRating != null) ? (
            <div className="guest-feedback-list">
              <p className="list-meta" style={{ marginBottom: "0.65rem" }}>
                Guest QR feedback
              </p>
              <ul>
                {assignments
                  .filter((a) => a.guestFeedbackAt && a.guestRating != null)
                  .map((a) => (
                    <li key={a.id}>
                      <strong>
                        #{a.hookah.modelNumber} · {a.guestRating}/5
                      </strong>
                      {a.guestComment ? <span> — “{a.guestComment}”</span> : null}
                    </li>
                  ))}
              </ul>
            </div>
          ) : null}
          <div className="form">
            <div className="form-row form-row-2">
              <div className="field">
                <label>Actual ($)</label>
                <input
                  type="number"
                  step="0.01"
                  value={outcome.actualDollars}
                  onChange={(e) =>
                    setOutcome((o) => ({ ...o, actualDollars: e.target.value }))
                  }
                />
              </div>
              <div className="field">
                <label>Tip ($)</label>
                <input
                  type="number"
                  step="0.01"
                  value={outcome.tipDollars}
                  onChange={(e) =>
                    setOutcome((o) => ({ ...o, tipDollars: e.target.value }))
                  }
                />
              </div>
            </div>
            {(() => {
              const tipCents = dollarsToCents(outcome.tipDollars) ?? 0;
              const shares = resolveTipSplit({
                tipCents,
                staffNames: job.staffNames,
                tipSplitJson: job.tipSplitJson,
              });
              if (tipCents <= 0 || shares.length === 0) return null;
              return (
                <div className="tip-split">
                  Tip split
                  <ul>
                    {shares.map((s) => (
                      <li key={s.name}>
                        {s.name}
                        {s.percent != null ? ` · ${s.percent}%` : ""} ·{" "}
                        {formatCadCents(s.cents)}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })()}
            {job.paymentModel !== "pay_at_event" ? (
              <TipSplitEditor
                tipCents={dollarsToCents(outcome.tipDollars) ?? 0}
                staffNames={job.staffNames}
                tipSplitJson={job.tipSplitJson}
                busy={tipSplitBusy}
                onSave={async (json) => {
                  setTipSplitBusy(true);
                  try {
                    await patchJob({ tipSplitJson: json });
                    await load();
                  } finally {
                    setTipSplitBusy(false);
                  }
                }}
              />
            ) : null}
            <div className="field">
              <label>Outcome notes</label>
              <textarea
                value={outcome.outcomeNotes}
                onChange={(e) =>
                  setOutcome((o) => ({ ...o, outcomeNotes: e.target.value }))
                }
              />
            </div>
            <button type="button" className="btn btn-primary" onClick={saveOutcome}>
              Save outcome
            </button>
          </div>
        </section>
      </div>

      {guestRatesOpen ? (
        <div
          className="hookah-modal-backdrop"
          onClick={() => setGuestRatesOpen(false)}
          role="presentation"
        >
          <div
            className="hookah-modal admin-edit-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="guest-rates-title"
            tabIndex={-1}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="hookah-modal__body">
              <div className="hookah-modal__head">
                <h2 id="guest-rates-title" className="hookah-modal__title">
                  Guest pay rates
                </h2>
                <button
                  type="button"
                  className="hookah-modal__close"
                  aria-label="Close"
                  onClick={() => setGuestRatesOpen(false)}
                >
                  ×
                </button>
              </div>
              <p className="page-sub" style={{ margin: "0 0 1rem" }}>
                On-site sales — guests choose a unit rate on the floor. No host
                package deposit.
              </p>
              <div className="guest-rates-modal__tiers">
                <div className="guest-rates-modal__tier">
                  <span className="guest-rates-modal__label">Standard</span>
                  <strong className="guest-rates-modal__price">
                    ${pricing.onsiteUnitRate}
                  </strong>
                  <span className="guest-rates-modal__meta">
                    Per unit · ${pricing.refillPriceCents / 100} refills
                  </span>
                </div>
                <div className="guest-rates-modal__tier">
                  <span className="guest-rates-modal__label">Unlimited</span>
                  <strong className="guest-rates-modal__price">
                    ${pricing.onsiteUnlimitedRate}
                  </strong>
                  <span className="guest-rates-modal__meta">
                    Per unit · unlimited refills
                  </span>
                </div>
              </div>
              <p className="list-meta" style={{ margin: "1rem 0 0" }}>
                Refill add-on is {formatCadCents(pricing.refillPriceCents)} when guests
                take the standard rate.
              </p>
              <div className="hookah-modal__btn-stack" style={{ marginTop: "1rem" }}>
                <button
                  type="button"
                  className="btn btn-primary hookah-modal__btn-main"
                  onClick={() => setGuestRatesOpen(false)}
                >
                  Got it
                </button>
                <Link
                  href={`/admin/jobs/${jobId}/payments`}
                  className="btn btn-ghost"
                  onClick={() => setGuestRatesOpen(false)}
                >
                  Open payments
                </Link>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {editOpen ? (
        <div
          className="hookah-modal-backdrop"
          onClick={() => setEditOpen(false)}
          role="presentation"
        >
          <div
            ref={editDialogRef}
            className="hookah-modal admin-edit-modal admin-edit-modal--wide"
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-job-title"
            tabIndex={-1}
            onClick={(e) => e.stopPropagation()}
          >
            <form className="hookah-modal__body form" onSubmit={saveEdit}>
              <div className="hookah-modal__head">
                <h2 id="edit-job-title" className="hookah-modal__title">
                  Edit job
                </h2>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setEditOpen(false)}
                >
                  Close
                </button>
              </div>

              <div className="form-row form-row-2">
                <div className="field">
                  <label htmlFor="edit-job-name">Title</label>
                  <input
                    id="edit-job-name"
                    required
                    value={editForm.title}
                    onChange={(e) =>
                      setEditForm((f) => ({ ...f, title: e.target.value }))
                    }
                  />
                </div>
                <div className="field">
                  <label htmlFor="edit-client">Client</label>
                  <input
                    id="edit-client"
                    required
                    value={editForm.clientName}
                    onChange={(e) =>
                      setEditForm((f) => ({ ...f, clientName: e.target.value }))
                    }
                  />
                </div>
              </div>

              <div className="form-row form-row-2">
                <div className="field">
                  <label htmlFor="edit-email">Contact email</label>
                  <input
                    id="edit-email"
                    type="email"
                    value={editForm.clientEmail}
                    onChange={(e) =>
                      setEditForm((f) => ({ ...f, clientEmail: e.target.value }))
                    }
                  />
                </div>
                <div className="field">
                  <label htmlFor="edit-phone">Contact phone</label>
                  <input
                    id="edit-phone"
                    value={editForm.clientPhone}
                    onChange={(e) =>
                      setEditForm((f) => ({ ...f, clientPhone: e.target.value }))
                    }
                  />
                </div>
              </div>

              <div className="field">
                <label htmlFor="edit-location">Location</label>
                <input
                  id="edit-location"
                  value={editForm.location}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, location: e.target.value }))
                  }
                />
              </div>

              <div className="form-row form-row-2">
                <div className="field">
                  <label htmlFor="edit-starts">Start</label>
                  <input
                    id="edit-starts"
                    type="datetime-local"
                    value={editForm.startsAt}
                    onChange={(e) =>
                      setEditForm((f) => ({ ...f, startsAt: e.target.value }))
                    }
                  />
                </div>
                <div className="field">
                  <label htmlFor="edit-ends">End</label>
                  <input
                    id="edit-ends"
                    type="datetime-local"
                    value={editForm.endsAt}
                    onChange={(e) =>
                      setEditForm((f) => ({ ...f, endsAt: e.target.value }))
                    }
                  />
                </div>
              </div>

              <div className="form-row form-row-2">
                <div className="field">
                  <label htmlFor="edit-hours">Booked hours</label>
                  <input
                    id="edit-hours"
                    type="number"
                    min="1"
                    value={editForm.bookedHours}
                    onChange={(e) =>
                      setEditForm((f) => ({ ...f, bookedHours: e.target.value }))
                    }
                  />
                </div>
                <div className="field">
                  <label htmlFor="edit-interval">Check interval</label>
                  <select
                    id="edit-interval"
                    value={editForm.checkIntervalMinutes}
                    onChange={(e) =>
                      setEditForm((f) => ({
                        ...f,
                        checkIntervalMinutes: e.target.value,
                      }))
                    }
                  >
                    <option value="30">30 min</option>
                    <option value="45">45 min</option>
                    <option value="60">60 min</option>
                  </select>
                </div>
              </div>

              <div className="form-row form-row-2">
                <div className="field">
                  <label htmlFor="edit-guests">Guest count</label>
                  <input
                    id="edit-guests"
                    type="number"
                    min="0"
                    value={editForm.guestCount}
                    onChange={(e) =>
                      setEditForm((f) => ({ ...f, guestCount: e.target.value }))
                    }
                  />
                </div>
                <div className="field">
                  <label htmlFor="edit-quoted">Quoted ($)</label>
                  <input
                    id="edit-quoted"
                    type="number"
                    step="0.01"
                    value={editForm.quotedDollars}
                    onChange={(e) =>
                      setEditForm((f) => ({ ...f, quotedDollars: e.target.value }))
                    }
                  />
                </div>
              </div>

              <div className="field">
                <label htmlFor="edit-staff">Staff</label>
                <input
                  id="edit-staff"
                  value={editForm.staffNames}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, staffNames: e.target.value }))
                  }
                />
              </div>

              <div className="field">
                <label htmlFor="edit-packing">Packing notes</label>
                <textarea
                  id="edit-packing"
                  rows={3}
                  value={editForm.packingNotes}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, packingNotes: e.target.value }))
                  }
                />
              </div>

              {editError ? <p className="login-error">{editError}</p> : null}

              <div className="hookah-modal__btn-stack" style={{ marginTop: "0.75rem" }}>
                <button
                  type="submit"
                  className="btn btn-ok hookah-modal__btn-main"
                  disabled={editBusy}
                >
                  {editBusy ? "Saving…" : "Save changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {resetOpen ? (
        <div
          className="hookah-modal-backdrop"
          onClick={() => !resetBusy && setResetOpen(false)}
          role="presentation"
        >
          <div
            ref={resetDialogRef}
            className="hookah-modal admin-edit-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="reset-job-title"
            tabIndex={-1}
            onClick={(e) => e.stopPropagation()}
          >
            <form className="hookah-modal__body form" onSubmit={confirmReset}>
              <div className="hookah-modal__head">
                <h2 id="reset-job-title" className="hookah-modal__title">
                  Reset job
                </h2>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={resetBusy}
                  onClick={() => setResetOpen(false)}
                >
                  Close
                </button>
              </div>

              <p className="page-sub" style={{ margin: "0 0 0.85rem" }}>
                Clears test / floor activity before the real event. Keeps the
                job details, packing notes, staged hookahs, and client portal
                link.
              </p>
              <ul className="page-sub" style={{ margin: "0 0 1rem", paddingLeft: "1.1rem" }}>
                <li>Restages all hookahs and releases fleet units</li>
                <li>Clears guest pay tiers and guest QR tokens</li>
                <li>Deletes guest ledger / payment rows for this job</li>
                <li>Deletes guest calls, refills, photos, and activity log</li>
                <li>Clears tip split, feedback, and job outcome</li>
                <li>Sets active/completed jobs back to confirmed</li>
              </ul>

              <PasswordField
                id="reset-password"
                label="Your password"
                autoComplete="current-password"
                value={resetPassword}
                onChange={setResetPassword}
                placeholder="Confirm with your login password"
              />

              {resetError ? <p className="login-error">{resetError}</p> : null}

              <div className="hookah-modal__btn-stack" style={{ marginTop: "0.75rem" }}>
                <button
                  type="submit"
                  className="btn btn-primary hookah-modal__btn-main"
                  disabled={resetBusy}
                >
                  {resetBusy ? "Resetting…" : "Reset job"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function AddHookahForm({
  hookahs,
  flavours,
  assignedHookahIds,
  onAddMany,
}: {
  hookahs: Hookah[];
  flavours: Flavour[];
  assignedHookahIds: number[];
  onAddMany: (payload: {
    hookahIds: number[];
    defaultFlavourId?: number;
    flavourByHookahId?: Record<string, number>;
  }) => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<number[]>([]);
  const [flavourById, setFlavourById] = useState<Record<number, string>>({});
  const [bulkFlavourId, setBulkFlavourId] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const dialogRef = useRef<HTMLDivElement>(null);
  const assigned = useMemo(() => new Set(assignedHookahIds), [assignedHookahIds]);

  const options = useMemo(
    () =>
      [...hookahs]
        .filter((h) => h.status === "available" && !assigned.has(h.id))
        .sort((a, b) => a.modelNumber - b.modelNumber),
    [hookahs, assigned],
  );

  const selectedHookahs = useMemo(
    () => options.filter((h) => selected.includes(h.id)),
    [options, selected],
  );

  const activeFlavours = useMemo(
    () => flavours.filter((f) => f.active !== false),
    [flavours],
  );

  useEffect(() => {
    if (!open) return;
    setSelected((prev) => prev.filter((id) => options.some((h) => h.id === id)));
  }, [options, open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus();
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  function openModal() {
    setFormError("");
    setSelected([]);
    setFlavourById({});
    setBulkFlavourId("");
    setOpen(true);
  }

  function toggle(id: number) {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function selectAll() {
    setSelected(options.map((h) => h.id));
  }

  function clearSelection() {
    setSelected([]);
  }

  function applyBulkFlavour() {
    if (!bulkFlavourId) return;
    setFlavourById((prev) => {
      const next = { ...prev };
      for (const id of selected) next[id] = bulkFlavourId;
      return next;
    });
  }

  async function submit() {
    if (selected.length === 0 || busy) return;
    setBusy(true);
    setFormError("");
    try {
      const flavourByHookahId: Record<string, number> = {};
      for (const id of selected) {
        const raw = flavourById[id];
        if (raw) flavourByHookahId[String(id)] = parseInt(raw, 10);
      }
      await onAddMany({
        hookahIds: selected,
        defaultFlavourId: bulkFlavourId ? parseInt(bulkFlavourId, 10) : undefined,
        flavourByHookahId:
          Object.keys(flavourByHookahId).length > 0 ? flavourByHookahId : undefined,
      });
      setOpen(false);
      setSelected([]);
      setFlavourById({});
      setBulkFlavourId("");
    } catch {
      setFormError("Couldn’t add hookahs");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" className="btn btn-sm btn-ok" onClick={openModal}>
        Add hookah(s)
      </button>

      {open ? (
        <div
          className="hookah-modal-backdrop"
          onClick={() => setOpen(false)}
          role="presentation"
        >
          <div
            ref={dialogRef}
            className="hookah-modal add-hookah-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-hookah-title"
            tabIndex={-1}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="hookah-modal__body">
              <div className="hookah-modal__head">
                <div>
                  <h2 id="add-hookah-title" className="hookah-modal__title">
                    Add hookah(s)
                  </h2>
                </div>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setOpen(false)}
                >
                  Close
                </button>
              </div>

              <p className="hookah-modal__prompt">
                Select units for this job and optionally set flavours before staging.
              </p>

              {formError ? <p className="login-error">{formError}</p> : null}

              <div className="hookah-modal__sections">
                <section className="hookah-modal__section">
                  <div className="add-hookah-modal__section-head">
                    <h3 className="hookah-modal__section-title">Available units</h3>
                    <div className="add-hookah-modal__quick">
                      <button
                        type="button"
                        className="btn btn-sm btn-ghost"
                        disabled={options.length === 0}
                        onClick={selectAll}
                      >
                        Select all
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm btn-ghost"
                        disabled={selected.length === 0}
                        onClick={clearSelection}
                      >
                        Clear
                      </button>
                    </div>
                  </div>
                  {options.length === 0 ? (
                    <p className="add-hookah__empty">
                      All available units are already on this job.
                    </p>
                  ) : (
                    <div className="add-hookah__grid add-hookah__grid--modal" role="group">
                      {options.map((h) => {
                        const isOn = selected.includes(h.id);
                        return (
                          <button
                            key={h.id}
                            type="button"
                            className={`add-hookah__chip ${isOn ? "add-hookah__chip--on" : ""}`}
                            aria-pressed={isOn}
                            onClick={() => toggle(h.id)}
                          >
                            #{h.modelNumber}
                            {h.label ? ` ${h.label}` : ""}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </section>

                {selected.length > 0 ? (
                  <section className="hookah-modal__section">
                    <h3 className="hookah-modal__section-title">Bulk flavour</h3>
                    <p className="hookah-modal__hint">
                      Set one flavour for every selected unit, or assign per hookah below.
                    </p>
                    <div className="add-hookah-modal__bulk">
                      <select
                        value={bulkFlavourId}
                        onChange={(e) => setBulkFlavourId(e.target.value)}
                      >
                        <option value="">No flavour yet…</option>
                        {activeFlavours.map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.name}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className="btn btn-sm"
                        disabled={!bulkFlavourId}
                        onClick={applyBulkFlavour}
                      >
                        Apply to selected
                      </button>
                    </div>

                    <div className="add-hookah-modal__rows">
                      {selectedHookahs.map((h) => (
                        <label key={h.id} className="add-hookah-modal__row">
                          <span className="fleet-num">#{h.modelNumber}</span>
                          <select
                            value={flavourById[h.id] ?? bulkFlavourId}
                            onChange={(e) =>
                              setFlavourById((prev) => ({
                                ...prev,
                                [h.id]: e.target.value,
                              }))
                            }
                          >
                            <option value="">No flavour yet…</option>
                            {activeFlavours.map((f) => (
                              <option key={f.id} value={f.id}>
                                {f.name}
                              </option>
                            ))}
                          </select>
                        </label>
                      ))}
                    </div>
                  </section>
                ) : null}
              </div>
            </div>

            <div className="hookah-modal__footer">
              <button
                type="button"
                className="btn btn-ok hookah-modal__btn-main"
                disabled={selected.length === 0 || busy}
                onClick={() => void submit()}
              >
                {busy
                  ? "Adding…"
                  : selected.length === 0
                    ? "Select hookahs to add"
                    : `Add ${selected.length} hookah${selected.length === 1 ? "" : "s"}`}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function assignmentHasFlavour(a: Assignment) {
  return (
    a.flavourId != null ||
    !!(a.flavourLabel && a.flavourLabel.trim()) ||
    !!a.flavour
  );
}

function JobHookahBoard({
  jobId,
  assignments,
  flavours,
  paymentModel,
  pricing,
  onAction,
  onRefresh,
}: {
  jobId: string;
  assignments: Assignment[];
  flavours: Flavour[];
  paymentModel?: Job["paymentModel"];
  pricing: PricingConfig;
  onAction: (body: Record<string, unknown>) => void | Promise<void>;
  onRefresh: () => void | Promise<void>;
}) {
  const [modalId, setModalId] = useState<number | null>(null);
  const [modalPrompt, setModalPrompt] = useState("");

  const modalAssignment = assignments.find((a) => a.id === modalId) ?? null;

  async function boardPlace(payload: {
    assignmentId: number;
    toStatus: "staged" | "out" | "returned";
    beforeAssignmentId?: number | null;
  }) {
    const res = await fetch(`/api/jobs/${jobId}/hookahs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "board_place", ...payload }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        ok: false as const,
        code: typeof data.code === "string" ? data.code : undefined,
        error: typeof data.error === "string" ? data.error : "Move failed",
      };
    }
    await onRefresh();
    return { ok: true as const };
  }

  return (
    <>
      <HookahBoard
        assignments={assignments}
        onOpen={(id, prompt = "") => {
          setModalId(id);
          setModalPrompt(prompt);
        }}
        onBoardPlace={boardPlace}
      />
      {modalAssignment ? (
        <HookahModal
          assignment={modalAssignment}
          flavours={flavours}
          paymentModel={paymentModel}
          pricing={pricing}
          prompt={modalPrompt}
          onAction={onAction}
          onRefresh={onRefresh}
          onClose={() => {
            setModalId(null);
            setModalPrompt("");
          }}
        />
      ) : null}
    </>
  );
}

function HookahModal({
  assignment: a,
  flavours,
  paymentModel,
  pricing,
  prompt,
  onAction,
  onRefresh,
  onClose,
}: {
  assignment: Assignment;
  flavours: Flavour[];
  paymentModel?: Job["paymentModel"];
  pricing: PricingConfig;
  prompt?: string;
  onAction: (body: Record<string, unknown>) => void | Promise<void>;
  onRefresh: () => void | Promise<void>;
  onClose: () => void;
}) {
  const [note, setNote] = useState("");
  const [flavourId, setFlavourId] = useState(
    a.flavourId ? String(a.flavourId) : "",
  );
  const [refillFlavourId, setRefillFlavourId] = useState(
    a.flavourId ? String(a.flavourId) : "",
  );
  const [formError, setFormError] = useState("");
  const [qrOpen, setQrOpen] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [qrUrl, setQrUrl] = useState("");
  const [qrLoading, setQrLoading] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setNote("");
    setFormError("");
    setFlavourId(a.flavourId ? String(a.flavourId) : "");
    const guestRefillFlavour =
      a.activeCall?.type === "refill" && a.activeCall.flavourId
        ? String(a.activeCall.flavourId)
        : null;
    setRefillFlavourId(
      guestRefillFlavour ?? (a.flavourId ? String(a.flavourId) : ""),
    );
    setQrOpen(false);
  }, [a.id, a.flavourId, a.activeCall?.id, a.activeCall?.flavourId, a.activeCall?.type]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (qrOpen) setQrOpen(false);
        else onClose();
      }
    }
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus();
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose, qrOpen]);

  const flavourName = a.flavour?.name ?? a.flavourLabel ?? "Not set";
  const overdue =
    a.status === "out" &&
    !!a.nextCheckAt &&
    new Date(a.nextCheckAt).getTime() < Date.now();
  const canSendOut = !!flavourId || assignmentHasFlavour(a);
  const needsGuestTier = paymentModel === "pay_at_event";
  const canSendOutFully =
    canSendOut && (!needsGuestTier || !!a.guestPayTier);
  const params = useParams();
  const jobId = params.id as string;
  const guestRefill = a.activeCall?.type === "refill" ? a.activeCall : null;
  const refillPrice =
    guestRefill?.priceCents ??
    defaultRefillCentsForTier(a.guestPayTier ?? null, pricing);

  function assertReadyToSend(): boolean {
    if (!flavourId && !assignmentHasFlavour(a)) {
      setFormError("Choose a flavour before sending to the floor");
      return false;
    }
    if (needsGuestTier && !a.guestPayTier) {
      setFormError("Choose Standard or Unlimited guest pay before sending out");
      return false;
    }
    return true;
  }

  async function run(body: Record<string, unknown>, close = false) {
    setFormError("");
    await onAction(body);
    if (close) onClose();
  }

  async function showGuestQr() {
    setQrLoading(true);
    setFormError("");
    try {
      let token = a.guestToken;
      if (!token) {
        const ensureRes = await fetch(`/api/jobs/${jobId}/hookahs`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "ensure_guest_token", assignmentId: a.id }),
        });
        if (!ensureRes.ok) {
          setFormError("Couldn’t create guest link");
          return;
        }
        const updated = await ensureRes.json();
        token = updated.guestToken;
      }
      if (!token) {
        setFormError("Couldn’t create guest link");
        return;
      }
      const qrRes = await fetch(`/api/qr?token=${encodeURIComponent(token)}`);
      if (!qrRes.ok) {
        setFormError("Couldn’t generate QR");
        return;
      }
      const qr = await qrRes.json();
      setQrDataUrl(qr.qrDataUrl);
      setQrUrl(qr.url);
      setQrOpen(true);
    } finally {
      setQrLoading(false);
    }
  }

  return (
    <div className="hookah-modal-backdrop" onClick={onClose} role="presentation">
      <div
        ref={dialogRef}
        className={`hookah-modal hookah-modal--${a.status}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="hookah-modal-title"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="hookah-modal__body">
        <div className="hookah-modal__head">
          <div>
            <h2 id="hookah-modal-title" className="hookah-modal__title">
              <span className="fleet-num">#{a.hookah.modelNumber}</span>
            </h2>
            <div className="hookah-modal__badges">
              <StatusBadge status={a.status} kind="assignment" />
              {a.guestPayTier ? (
                <span className={`tier-chip tier-chip--${a.guestPayTier}`}>
                  {a.guestPayTier}
                </span>
              ) : null}
              {overdue ? <span className="hookah-chip hookah-chip--overdue">Overdue</span> : null}
              {a.issueFlag ? <span className="hookah-chip hookah-chip--issue">Issue</span> : null}
            </div>
          </div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
            Close
          </button>
        </div>

        {prompt ? <p className="hookah-modal__prompt">{prompt}</p> : null}
        {formError ? <p className="login-error">{formError}</p> : null}

        {paymentModel === "pay_at_event" ? (
          <section className="hookah-modal__section">
            <h3 className="hookah-modal__section-title">Guest pay tier</h3>
            <p className="hookah-modal__hint">
              Required before send-out. Standard charges $
              {pricing.refillPriceCents / 100}{" "}
              refills; Unlimited does not.
            </p>
            <div className="guest-tier-picker__row">
              <button
                type="button"
                className={`btn hookah-modal__btn-main ${
                  a.guestPayTier === "standard" ? "btn-ok" : ""
                }`}
                onClick={() =>
                  run({
                    action: "set_guest_pay_tier",
                    assignmentId: a.id,
                    guestPayTier: "standard",
                  })
                }
              >
                Standard · ${pricing.onsiteUnitRate}
              </button>
              <button
                type="button"
                className={`btn hookah-modal__btn-main ${
                  a.guestPayTier === "unlimited" ? "btn-ok" : ""
                }`}
                onClick={() =>
                  run({
                    action: "set_guest_pay_tier",
                    assignmentId: a.id,
                    guestPayTier: "unlimited",
                  })
                }
              >
                Unlimited · ${pricing.onsiteUnlimitedRate}
              </button>
            </div>
          </section>
        ) : null}

        {a.activeCall ? (
          <div className={`hookah-call-banner hookah-call-banner--${a.activeCall.type}`}>
            <div>
              <div className="hookah-call-banner__title">
                {a.activeCall.type === "refill"
                  ? "Guest refill request"
                  : `Guest needs ${callTypeLabel(a.activeCall.type).toLowerCase()}`}
                {a.activeCall.status === "acknowledged" ? " · you’re headed over" : ""}
              </div>
              {a.activeCall.type === "refill" ? (
                <p className="hookah-call-banner__msg">
                  {a.activeCall.flavourLabel || "Flavour TBD"}
                  {" · "}
                  {formatMoney(
                    a.activeCall.priceCents ??
                      defaultRefillCentsForTier(a.guestPayTier ?? null, pricing),
                  )}
                  {a.activeCall.priceAgreed ? " · guest agreed" : ""}
                  {" — prep a new head and take the payment terminal."}
                </p>
              ) : a.activeCall.message ? (
                <p className="hookah-call-banner__msg">“{a.activeCall.message}”</p>
              ) : (
                <p className="hookah-call-banner__msg">
                  No note attached — they requested {callTypeLabel(a.activeCall.type).toLowerCase()}.
                </p>
              )}
            </div>
            <div className="hookah-call-banner__actions">
              {a.activeCall.status === "open" ? (
                <button
                  type="button"
                  className="btn btn-sm btn-ok"
                  onClick={async () => {
                    await fetch(`/api/service-requests/${a.activeCall!.id}`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ action: "acknowledge" }),
                    });
                    await onRefresh();
                  }}
                >
                  We’re on the way
                </button>
              ) : null}
              {a.activeCall.type === "refill" ? (
                <button
                  type="button"
                  className="btn btn-sm btn-ok"
                  onClick={() =>
                    run({
                      action: "deliver_refill",
                      assignmentId: a.id,
                      serviceRequestId: a.activeCall!.id,
                      flavourId: a.activeCall!.flavourId ?? undefined,
                      flavourLabel: a.activeCall!.flavourLabel ?? undefined,
                      priceCents:
                        a.activeCall!.priceCents ??
                        defaultRefillCentsForTier(a.guestPayTier ?? null, pricing),
                      source: "guest",
                      note: note || undefined,
                    })
                  }
                >
                  Delivered · paid
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={async () => {
                    await fetch(`/api/service-requests/${a.activeCall!.id}`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ action: "resolve" }),
                    });
                    await onRefresh();
                  }}
                >
                  Mark request done
                </button>
              )}
            </div>
          </div>
        ) : null}

        <div className="hookah-modal__summary">
          <div className="hookah-modal__summary-item">
            <span className="hookah-card__meta-label">Flavour</span>
            <div>{flavourName}</div>
          </div>
          {a.status === "out" && a.nextCheckAt ? (
            <div className="hookah-modal__summary-item">
              <span className="hookah-card__meta-label">Next check</span>
              <Countdown target={a.nextCheckAt} />
            </div>
          ) : null}
          <div className="hookah-modal__summary-item">
            <span className="hookah-card__meta-label">Logged</span>
            <div className="list-meta">
              {a.checkCount} check{a.checkCount === 1 ? "" : "s"}
              {a.refillCount > 0
                ? ` · ${a.refillCount} refill${a.refillCount === 1 ? "" : "s"}`
                : ""}
            </div>
          </div>
          {a.status === "returned" && returnOutcomeLabel(a.returnOutcome) ? (
            <div className="hookah-modal__summary-item">
              <span className="hookah-card__meta-label">Close-out</span>
              <div>{returnOutcomeLabel(a.returnOutcome)}</div>
            </div>
          ) : null}
          {a.guestFeedbackAt && a.guestRating != null ? (
            <div className="hookah-modal__summary-item">
              <span className="hookah-card__meta-label">Guest feedback</span>
              <div>
                {a.guestRating}/5
                {a.guestComment ? (
                  <div className="list-meta" style={{ marginTop: "0.25rem" }}>
                    “{a.guestComment}”
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>

        {a.status === "staged" ? (
          <div className="hookah-modal__sections">
            <section className="hookah-modal__section">
              <h3 className="hookah-modal__section-title">Prep before it goes out</h3>
              <div className="hookah-card__fields">
                <label className="hookah-field">
                  <span>Flavour</span>
                  <select value={flavourId} onChange={(e) => setFlavourId(e.target.value)}>
                    <option value="">Choose flavour…</option>
                    {flavours.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="hookah-field">
                  <span>Note for the send-out (optional)</span>
                  <input
                    placeholder="e.g. extra ice, table 4…"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                </label>
              </div>
            </section>

            <section className="hookah-modal__section">
              <h3 className="hookah-modal__section-title">Actions</h3>
              <div className="hookah-modal__btn-stack">
                <button
                  type="button"
                  className="btn btn-ok hookah-modal__btn-main"
                  disabled={!canSendOutFully}
                  onClick={() => {
                    if (!assertReadyToSend()) return;
                    run(
                      {
                        action: "send_out",
                        assignmentId: a.id,
                        flavourId: flavourId ? parseInt(flavourId, 10) : undefined,
                        note: note || undefined,
                      },
                      true,
                    );
                  }}
                >
                  Send to floor
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => run({ action: "remove", assignmentId: a.id }, true)}
                >
                  Remove from this job
                </button>
              </div>
            </section>
          </div>
        ) : null}

        {a.status === "out" ? (
          <div className="hookah-modal__sections">
            <section className="hookah-modal__section">
              <h3 className="hookah-modal__section-title">Staff check</h3>
              <p className="hookah-modal__hint">
                Checks happen randomly or when the timer notifies you. Log the visit — refill delivery is separate below.
              </p>
              <label className="hookah-field">
                <span>Check note (optional)</span>
                <input
                  placeholder="What did you notice?"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </label>
              <div className="hookah-modal__btn-row">
                <button
                  type="button"
                  className="btn btn-ok hookah-modal__btn-main"
                  onClick={() =>
                    run({
                      action: "check",
                      assignmentId: a.id,
                      note: note || undefined,
                    })
                  }
                >
                  Log check
                </button>
              </div>
            </section>

            <section className="hookah-modal__section">
              <h3 className="hookah-modal__section-title">Deliver refill</h3>
              <p className="hookah-modal__hint">
                Prep the new head at the station, then bring it back with the payment terminal.
                Same flavour or a change — both are tracked.
              </p>
              <div className="hookah-card__fields">
                <label className="hookah-field">
                  <span>Flavour on the new head</span>
                  <select
                    value={refillFlavourId}
                    onChange={(e) => setRefillFlavourId(e.target.value)}
                  >
                    <option value="">Choose flavour…</option>
                    {flavours.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                        {a.flavourId === f.id ? " (current)" : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="hookah-modal__price-row">
                  <span>Charge</span>
                  <strong>{formatMoney(refillPrice)}</strong>
                </div>
              </div>
              <button
                type="button"
                className="btn btn-ok hookah-modal__btn-main"
                disabled={!refillFlavourId && !guestRefill}
                onClick={() => {
                  if (!refillFlavourId && !guestRefill?.flavourId) {
                    setFormError("Choose the refill flavour");
                    return;
                  }
                  run({
                    action: "deliver_refill",
                    assignmentId: a.id,
                    flavourId: refillFlavourId
                      ? parseInt(refillFlavourId, 10)
                      : guestRefill?.flavourId ?? undefined,
                    priceCents: refillPrice,
                    source: guestRefill ? "guest" : "staff",
                    serviceRequestId: guestRefill?.id,
                    note: note || undefined,
                  });
                }}
              >
                {guestRefill ? "Deliver guest refill · paid" : "Deliver refill · paid"}
              </button>
            </section>

            <section className="hookah-modal__section">
              <h3 className="hookah-modal__section-title">Close out</h3>
              <p className="hookah-modal__hint">
                When the client is done, mark how the unit came back. Notes are optional for each.
              </p>
              <label className="hookah-field">
                <span>Close-out note (optional)</span>
                <input
                  placeholder="Optional note for this outcome…"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </label>
              <div className="hookah-modal__btn-stack">
                <button
                  type="button"
                  className="btn btn-ok hookah-modal__btn-main"
                  onClick={() =>
                    run(
                      {
                        action: "return",
                        assignmentId: a.id,
                        outcome: "returned",
                        note: note || undefined,
                      },
                      true,
                    )
                  }
                >
                  Returned OK
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() =>
                    run(
                      {
                        action: "return",
                        assignmentId: a.id,
                        outcome: "returned_with_issue",
                        note: note || undefined,
                      },
                      true,
                    )
                  }
                >
                  Returned with issue
                </button>
                <button
                  type="button"
                  className="btn btn-danger-ghost"
                  onClick={() =>
                    run(
                      {
                        action: "return",
                        assignmentId: a.id,
                        outcome: "not_returned",
                        note: note || undefined,
                      },
                      true,
                    )
                  }
                >
                  Not returned
                </button>
              </div>
            </section>

            <section className="hookah-modal__section hookah-modal__section--quiet">
              <button
                type="button"
                className={`btn hookah-modal__btn-main ${
                  a.issueFlag ? "btn-ok" : "btn-danger-ghost"
                }`}
                onClick={() =>
                  run({
                    action: "flag_issue",
                    assignmentId: a.id,
                    note: note || undefined,
                  })
                }
              >
                {a.issueFlag ? "Resolve issue" : "Flag issue (keep on floor)"}
              </button>
            </section>
          </div>
        ) : null}

        {a.status === "returned" ? (
          <div className="hookah-modal__sections">
            <section className="hookah-modal__section">
              <h3 className="hookah-modal__section-title">Back from the floor</h3>
              <p className="hookah-card__done">
                {returnOutcomeLabel(a.returnOutcome)
                  ? `Closed as ${returnOutcomeLabel(a.returnOutcome)?.toLowerCase()}.`
                  : "This hookah is closed out."}
                {a.returnNotes ? ` Note: ${a.returnNotes}` : ""}{" "}
                Send it out again or park it in ready.
              </p>
              <label className="hookah-field">
                <span>Flavour for next send-out</span>
                <select value={flavourId} onChange={(e) => setFlavourId(e.target.value)}>
                  <option value="">Choose flavour…</option>
                  {flavours.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="hookah-modal__btn-stack">
                <button
                  type="button"
                  className="btn btn-ok hookah-modal__btn-main"
                  disabled={!canSendOutFully}
                  onClick={() => {
                    if (!assertReadyToSend()) return;
                    run(
                      {
                        action: "send_out",
                        assignmentId: a.id,
                        flavourId: flavourId ? parseInt(flavourId, 10) : undefined,
                      },
                      true,
                    );
                  }}
                >
                  Send to floor again
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => run({ action: "restage", assignmentId: a.id }, true)}
                >
                  Move to ready
                </button>
              </div>
            </section>
          </div>
        ) : null}
        </div>

        {(a.status === "staged" || a.status === "out") ? (
          <div className="hookah-modal__footer">
            <button
              type="button"
              className="btn btn-primary hookah-modal__qr-btn"
              onClick={showGuestQr}
              disabled={qrLoading}
            >
              {qrLoading ? "Preparing QR…" : "Show guest QR code"}
            </button>
            {a.status === "out" ? (
              <button
                type="button"
                className="btn btn-ghost"
                disabled={qrLoading}
                onClick={async () => {
                  setQrLoading(true);
                  setFormError("");
                  try {
                    const ensureRes = await fetch(`/api/jobs/${jobId}/hookahs`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        action: "ensure_guest_token",
                        assignmentId: a.id,
                        regenerate: true,
                      }),
                    });
                    if (!ensureRes.ok) {
                      setFormError("Couldn’t regenerate guest link");
                      return;
                    }
                    const updated = await ensureRes.json();
                    const token = updated.guestToken as string | undefined;
                    if (!token) {
                      setFormError("Couldn’t regenerate guest link");
                      return;
                    }
                    const qrRes = await fetch(
                      `/api/qr?token=${encodeURIComponent(token)}`,
                    );
                    if (!qrRes.ok) {
                      setFormError("Couldn’t generate QR");
                      return;
                    }
                    const qr = await qrRes.json();
                    setQrDataUrl(qr.qrDataUrl);
                    setQrUrl(qr.url);
                    setQrOpen(true);
                    await onRefresh();
                  } finally {
                    setQrLoading(false);
                  }
                }}
              >
                Regenerate guest link
              </button>
            ) : null}
            <p className="hookah-modal__footer-hint">
              Guest scans this to request coals, flavour refills, or help.
            </p>
          </div>
        ) : null}
      </div>

      {qrOpen ? (
        <div
          className="guest-qr"
          role="dialog"
          aria-modal="true"
          aria-label="Guest service QR code"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="guest-qr__inner">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-white.png" alt="Oui Smoke" className="guest-qr__logo" />
            <p className="guest-qr__eyebrow">Scan for service</p>
            <div className="fleet-num guest-qr__number">#{a.hookah.modelNumber}</div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrDataUrl} alt="Guest service QR code" className="guest-qr__code" />
            <p className="guest-qr__hint">
              Guest keeps the page open for coals, refills, and help.
            </p>
            <p className="guest-qr__url">{qrUrl}</p>
            <button type="button" className="btn btn-primary" onClick={() => setQrOpen(false)}>
              Done
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

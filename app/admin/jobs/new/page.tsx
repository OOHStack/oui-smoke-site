"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { PAYMENT_MODELS } from "@/lib/payment-model";

type Hookah = {
  id: number;
  modelNumber: number;
  label: string | null;
  status: string;
};

export default function NewJobPage() {
  const router = useRouter();
  const [hookahs, setHookahs] = useState<Hookah[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
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
    paymentModel: "client_deposit",
  });

  useEffect(() => {
    const prefill = new URLSearchParams(window.location.search).get("startsAt");
    if (prefill) {
      setForm((prev) => (prev.startsAt ? prev : { ...prev, startsAt: prefill }));
    }
  }, []);

  useEffect(() => {
    fetch("/api/hookahs")
      .then((r) => r.json())
      .then((data) => {
        const list = data.hookahs ?? data;
        setHookahs(list.filter((h: Hookah) => h.status === "available"));
      })
      .catch(() => {});
  }, []);

  function toggleHookah(id: number) {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const quotedCents = form.quotedDollars
      ? Math.round(parseFloat(form.quotedDollars) * 100)
      : undefined;

    const body = {
      title: form.title,
      clientName: form.clientName,
      clientEmail: form.clientEmail || undefined,
      clientPhone: form.clientPhone || undefined,
      location: form.location || undefined,
      startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : undefined,
      endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : undefined,
      bookedHours: form.bookedHours ? parseInt(form.bookedHours, 10) : undefined,
      checkIntervalMinutes: parseInt(form.checkIntervalMinutes, 10),
      guestCount: form.guestCount ? parseInt(form.guestCount, 10) : undefined,
      quotedCents,
      staffNames: form.staffNames || undefined,
      packingNotes: form.packingNotes || undefined,
      paymentModel: form.paymentModel,
      status: "draft",
      hookahIds: selected,
    };

    try {
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Failed to create job");
        return;
      }

      const data = await res.json();
      router.push(`/admin/jobs/${data.id}`);
    } catch {
      setError("Failed to create job");
    } finally {
      setLoading(false);
    }
  }

  function setField(key: string, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title">New job</h1>
          <p className="page-sub">Create a booking</p>
        </div>
        <Link href="/admin/jobs" className="btn">
          Back
        </Link>
      </div>

      <form className="form panel" onSubmit={handleSubmit}>
        <div className="form-row form-row-2">
          <div className="field">
            <label htmlFor="title">Title</label>
            <input
              id="title"
              required
              value={form.title}
              onChange={(e) => setField("title", e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="clientName">Client</label>
            <input
              id="clientName"
              required
              value={form.clientName}
              onChange={(e) => setField("clientName", e.target.value)}
            />
          </div>
        </div>

        <div className="form-row form-row-2">
          <div className="field">
            <label htmlFor="clientEmail">Contact email</label>
            <input
              id="clientEmail"
              type="email"
              value={form.clientEmail}
              onChange={(e) => setField("clientEmail", e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="clientPhone">Contact phone</label>
            <input
              id="clientPhone"
              value={form.clientPhone}
              onChange={(e) => setField("clientPhone", e.target.value)}
            />
          </div>
        </div>

        <div className="field">
          <label htmlFor="location">Location</label>
          <input
            id="location"
            value={form.location}
            onChange={(e) => setField("location", e.target.value)}
          />
        </div>

        <div className="form-row form-row-2">
          <div className="field">
            <label htmlFor="startsAt">Start</label>
            <input
              id="startsAt"
              type="datetime-local"
              value={form.startsAt}
              onChange={(e) => setField("startsAt", e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="endsAt">End</label>
            <input
              id="endsAt"
              type="datetime-local"
              value={form.endsAt}
              onChange={(e) => setField("endsAt", e.target.value)}
            />
          </div>
        </div>

        <div className="form-row form-row-2">
          <div className="field">
            <label htmlFor="bookedHours">Booked hours</label>
            <input
              id="bookedHours"
              type="number"
              min="1"
              value={form.bookedHours}
              onChange={(e) => setField("bookedHours", e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="checkInterval">Check interval</label>
            <select
              id="checkInterval"
              value={form.checkIntervalMinutes}
              onChange={(e) => setField("checkIntervalMinutes", e.target.value)}
            >
              <option value="30">30 min</option>
              <option value="45">45 min</option>
              <option value="60">60 min</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="guestCount">Guest count</label>
            <input
              id="guestCount"
              type="number"
              min="1"
              value={form.guestCount}
              onChange={(e) => setField("guestCount", e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="paymentModel">Payment model</label>
            <select
              id="paymentModel"
              value={form.paymentModel}
              onChange={(e) => setField("paymentModel", e.target.value)}
            >
              {PAYMENT_MODELS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
            <p className="list-meta" style={{ marginTop: "0.35rem" }}>
              {PAYMENT_MODELS.find((m) => m.value === form.paymentModel)?.hint}
            </p>
          </div>
          <div className="field">
            <label htmlFor="quoted">
              Quoted ($)
              {form.paymentModel !== "client_deposit" ? " · optional" : ""}
            </label>
            <input
              id="quoted"
              type="number"
              min="0"
              step="0.01"
              value={form.quotedDollars}
              onChange={(e) => setField("quotedDollars", e.target.value)}
              disabled={form.paymentModel === "complimentary"}
            />
          </div>
        </div>

        <div className="field">
          <label htmlFor="staff">Staff</label>
          <input
            id="staff"
            value={form.staffNames}
            onChange={(e) => setField("staffNames", e.target.value)}
            placeholder="Comma-separated names"
          />
        </div>

        <div className="field">
          <label htmlFor="packing">Packing notes</label>
          <textarea
            id="packing"
            value={form.packingNotes}
            onChange={(e) => setField("packingNotes", e.target.value)}
          />
        </div>

        <div className="field">
          <label>Hookahs (available only)</label>
          {hookahs.length === 0 ? (
            <p className="empty">No available hookahs.</p>
          ) : (
            <div className="chips">
              {hookahs.map((h) => (
                <button
                  key={h.id}
                  type="button"
                  className={`chip ${selected.includes(h.id) ? "active" : ""}`}
                  onClick={() => toggleHookah(h.id)}
                >
                  #{h.modelNumber}
                  {h.label ? ` ${h.label}` : ""}
                </button>
              ))}
            </div>
          )}
        </div>

        {error ? <p className="login-error">{error}</p> : null}

        <button type="submit" className="btn btn-primary" disabled={loading}>
          {loading ? "Creating…" : "Create job"}
        </button>
      </form>
    </div>
  );
}

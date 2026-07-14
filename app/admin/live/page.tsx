"use client";

import { useState } from "react";
import Link from "next/link";
import Countdown from "@/components/admin/Countdown";
import StatusBadge from "@/components/admin/StatusBadge";
import { useSse } from "@/lib/hooks/useSse";

type OutAssignment = {
  assignmentId: number;
  jobId: number;
  jobTitle: string;
  clientName: string;
  hookahModel: number;
  hookahLabel: string | null;
  flavourName: string | null;
  nextCheckAt: string | null;
  issueFlag: boolean;
};

type ServiceCall = {
  id: number;
  type: string;
  status: string;
  message: string | null;
  flavourLabel?: string | null;
  priceCents?: number | null;
  jobId: number;
  assignmentId: number;
  modelNumber: number;
  jobTitle: string;
};

export default function LiveFloorPage() {
  const [items, setItems] = useState<OutAssignment[]>([]);
  const [calls, setCalls] = useState<ServiceCall[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<number | null>(null);

  useSse<{ items: OutAssignment[]; calls: ServiceCall[] }>(
    "/api/stream/live",
    (data) => {
      setItems(data.items ?? []);
      setCalls(data.calls ?? []);
      setLoading(false);
    },
  );

  async function action(
    jobId: number,
    assignmentId: number,
    actionName: "check" | "return",
  ) {
    setActing(assignmentId);
    await fetch(`/api/jobs/${jobId}/hookahs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: actionName,
        assignmentId,
        ...(actionName === "return" ? { outcome: "returned" } : {}),
      }),
    });
    setActing(null);
  }

  async function serviceAct(id: number, actionName: "acknowledge" | "resolve") {
    await fetch(`/api/service-requests/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: actionName }),
    });
  }

  async function markCallDone(call: ServiceCall) {
    if (call.type === "refill") {
      await fetch(`/api/jobs/${call.jobId}/hookahs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "deliver_refill",
          assignmentId: call.assignmentId,
          serviceRequestId: call.id,
          source: "guest",
          flavourLabel: call.flavourLabel ?? undefined,
          priceCents: call.priceCents ?? undefined,
        }),
      });
    } else {
      await serviceAct(call.id, "resolve");
    }
  }

  const callByAssignment = new Map(calls.map((c) => [c.assignmentId, c]));

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title">Live Floor</h1>
          <p className="page-sub">
            Hookahs out + guest service calls · live updates
          </p>
        </div>
      </div>

      {calls.length > 0 ? (
        <section className="panel" style={{ marginBottom: "0.75rem" }}>
          <h2 className="panel-title">Guest calls needing you</h2>
          <div className="live-grid">
            {calls.map((c) => (
              <div
                key={c.id}
                className={`job-card ${c.status === "open" ? "overdue" : ""}`}
              >
                <div className="job-card-head">
                  <div>
                    <span className="job-card-title">
                      #{c.modelNumber} · {c.type}
                    </span>
                    <div className="list-meta">
                      {c.jobTitle}
                      {c.message ? ` · ${c.message}` : ""}
                      {c.status === "acknowledged" ? " · on the way" : ""}
                    </div>
                  </div>
                </div>
                <div className="job-card-actions">
                  {c.status === "open" ? (
                    <button
                      type="button"
                      className="btn btn-sm btn-ok"
                      onClick={() => serviceAct(c.id, "acknowledge")}
                    >
                      On the way
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => markCallDone(c)}
                  >
                    {c.type === "refill" ? "Delivered · paid" : "Done"}
                  </button>
                  <Link href={`/admin/jobs/${c.jobId}`} className="btn btn-sm btn-ghost">
                    Open job
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {loading ? (
        <p className="empty">Loading live floor…</p>
      ) : items.length === 0 ? (
        <p className="empty">No hookahs out right now.</p>
      ) : (
        <div className="live-grid">
          {items.map((item) => {
            const overdue =
              item.nextCheckAt &&
              new Date(item.nextCheckAt).getTime() < Date.now();
            const call = callByAssignment.get(item.assignmentId);

            return (
              <div
                key={item.assignmentId}
                className={`job-card ${overdue || call?.status === "open" ? "overdue" : ""}`}
              >
                <div className="job-card-head">
                  <div>
                    <span className="job-card-title">
                      #{item.hookahModel}
                      {item.hookahLabel ? ` ${item.hookahLabel}` : ""}
                    </span>
                    <div className="list-meta">
                      <Link href={`/admin/jobs/${item.jobId}`}>
                        {item.jobTitle}
                      </Link>
                      {" · "}
                      {item.clientName}
                      {item.flavourName ? ` · ${item.flavourName}` : ""}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: "0.35rem", alignItems: "center" }}>
                    <StatusBadge status="out" kind="assignment" />
                    {call ? (
                      <span className="hookah-chip hookah-chip--overdue">
                        {call.status === "acknowledged"
                          ? "On the way"
                          : call.type === "refill"
                            ? `Refill${call.flavourLabel ? `: ${call.flavourLabel}` : ""}`
                            : call.type}
                      </span>
                    ) : null}
                    {item.issueFlag ? (
                      <span className="issue-flag">ISSUE</span>
                    ) : null}
                  </div>
                </div>

                <div>
                  <span className="list-meta">Next check: </span>
                  <Countdown target={item.nextCheckAt} />
                </div>

                <div className="job-card-actions">
                  {call?.status === "open" ? (
                    <button
                      type="button"
                      className="btn btn-sm btn-ok"
                      onClick={() => serviceAct(call.id, "acknowledge")}
                    >
                      On the way
                    </button>
                  ) : null}
                  {call ? (
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={() => markCallDone(call)}
                    >
                      {call.type === "refill" ? "Delivered · paid" : "Done"}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="btn btn-sm btn-ok"
                    disabled={acting === item.assignmentId}
                    onClick={() =>
                      action(item.jobId, item.assignmentId, "check")
                    }
                  >
                    Check
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm"
                    disabled={acting === item.assignmentId}
                    onClick={() =>
                      action(item.jobId, item.assignmentId, "return")
                    }
                  >
                    Return OK
                  </button>
                  <Link
                    href={`/admin/jobs/${item.jobId}`}
                    className="btn btn-sm btn-ghost"
                  >
                    Open job
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

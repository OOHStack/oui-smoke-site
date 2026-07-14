"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";

function formatRemaining(ms: number): string {
  const abs = Math.abs(ms);
  const totalSec = Math.floor(abs / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;

  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function Countdown({
  target,
  className,
  prefix,
}: {
  target: string | Date | null | undefined;
  className?: string;
  prefix?: string;
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (!target) {
    return <span className={clsx("countdown", className)}>—</span>;
  }

  const targetMs = new Date(target).getTime();
  const remaining = targetMs - now;
  const overdue = remaining < 0;

  return (
    <span
      className={clsx("countdown", overdue && "countdown-overdue", className)}
    >
      {prefix}
      {overdue ? "OVERDUE " : ""}
      {formatRemaining(remaining)}
    </span>
  );
}

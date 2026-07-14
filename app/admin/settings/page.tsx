"use client";

import { Suspense } from "react";
import SettingsHub from "./SettingsHub";

export default function SettingsPage() {
  return (
    <Suspense fallback={<p className="empty">Loading settings…</p>}>
      <SettingsHub />
    </Suspense>
  );
}

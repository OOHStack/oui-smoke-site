"use client";

import { useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(useGSAP);

export default function DashboardMotion({
  children,
}: {
  children: React.ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reduce) return;

      // Opacity-only — never animate transform here. Transform tweens fight
      // CSS hover transitions on the metric tiles and leave sections overlapping.
      gsap.from(".dash-hero__content > *, .dash-pulse__item, .dash-rails, .dash-schedule", {
        opacity: 0,
        duration: 0.55,
        stagger: 0.05,
        ease: "power2.out",
        clearProps: "opacity",
      });
    },
    { scope: root },
  );

  return (
    <div ref={root} className="dash">
      {children}
    </div>
  );
}

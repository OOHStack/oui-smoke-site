"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import type { RefObject } from "react";

gsap.registerPlugin(useGSAP);

/** Site/partner hero mark entrance + idle loops, scoped to a root. */
export function useOuiMarkMotion(
  root: RefObject<HTMLElement | null>,
  enabled = true,
) {
  useGSAP(
    () => {
      if (!enabled) return;
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const mark = root.current?.querySelector(".oui-mark");
      if (!mark) return;

      if (reduce) {
        gsap.set(mark, { autoAlpha: 1, scale: 1, clearProps: "filter" });
        gsap.set(".oui-mark__word", { autoAlpha: 1, x: 0 });
        gsap.set(".oui-mark__stroke", { strokeDashoffset: 0 });
        return;
      }

      const strokes = gsap.utils.toArray<SVGGeometryElement>(
        ".oui-mark__stroke",
      );
      strokes.forEach((el) => {
        const length =
          typeof el.getTotalLength === "function" ? el.getTotalLength() : 220;
        el.style.strokeDasharray = String(length);
        el.style.strokeDashoffset = String(length);
      });

      gsap.set(mark, {
        autoAlpha: 0,
        scale: 0.94,
        transformOrigin: "50% 50%",
      });
      gsap.set(".oui-mark__word", { autoAlpha: 0, x: 12 });

      const photo = root.current?.querySelector(
        ".jdisplay__bg-photo, .display__bg-photo",
      );
      if (photo) gsap.set(photo, { scale: 1.08 });

      const tl = gsap.timeline({ defaults: { ease: "power3.out" } });

      if (photo) {
        tl.to(photo, { scale: 1.03, duration: 2.2, ease: "power2.out" }, 0);
      }

      tl.to(
        mark,
        { autoAlpha: 1, scale: 1, duration: 1.05, ease: "power3.out" },
        0.15,
      )
        .to(
          ".oui-mark__o-ring",
          {
            strokeDashoffset: 0,
            duration: 1.2,
            stagger: 0.12,
            ease: "power2.inOut",
          },
          0.2,
        )
        .to(
          ".oui-mark__u .oui-mark__stroke",
          {
            strokeDashoffset: 0,
            duration: 1.05,
            stagger: 0.09,
            ease: "power2.inOut",
          },
          0.32,
        )
        .to(
          ".oui-mark__i-line",
          {
            strokeDashoffset: 0,
            duration: 0.75,
            stagger: 0.045,
            ease: "power2.out",
          },
          0.48,
        )
        .to(".oui-mark__word", { autoAlpha: 1, x: 0, duration: 0.65 }, 0.78)
        .add(() => {
          gsap.to(".oui-mark__o", {
            rotation: 360,
            svgOrigin: "100 110",
            duration: 56,
            ease: "none",
            repeat: -1,
          });
          gsap.to(".oui-mark__o-ring", {
            opacity: 0.55,
            duration: 2.6,
            stagger: { each: 0.4, yoyo: true, repeat: -1 },
            ease: "sine.inOut",
            yoyo: true,
            repeat: -1,
          });
          gsap.to(".oui-mark__i-line", {
            opacity: 0.45,
            duration: 1.7,
            stagger: { each: 0.16, yoyo: true, repeat: -1 },
            ease: "sine.inOut",
            yoyo: true,
            repeat: -1,
          });
          gsap.to(".oui-mark__u", {
            y: -5,
            duration: 3.4,
            ease: "sine.inOut",
            yoyo: true,
            repeat: -1,
          });
        }, 1.15);
    },
    { scope: root, dependencies: [enabled] },
  );
}

"use client";

import { useRef, type ReactNode } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(useGSAP);

export default function PartnerEntrance({ children }: { children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reduce) return;

      gsap.defaults({ ease: "power3.out" });

      const media = ".partner-hero__media img";
      const mark = document.querySelector(".partner-mark");
      const strokes = gsap.utils.toArray<SVGGeometryElement>(
        ".partner-mark__stroke",
      );

      strokes.forEach((el) => {
        const length =
          typeof el.getTotalLength === "function" ? el.getTotalLength() : 220;
        el.style.strokeDasharray = String(length);
        el.style.strokeDashoffset = String(length);
      });

      gsap.set(".partner-toolbar", { autoAlpha: 0, y: -12 });
      if (mark) {
        gsap.set(mark, {
          autoAlpha: 0,
          scale: 0.94,
          transformOrigin: "50% 50%",
        });
        gsap.set(".partner-mark__word", { autoAlpha: 0, x: 12 });
      }
      gsap.set(
        [
          ".partner-hero__eyebrow",
          ".partner-hero__title",
          ".partner-hero__lede",
          ".partner-hero__jump",
        ],
        { autoAlpha: 0, y: 24 },
      );
      gsap.set(media, { scale: 1.08 });
      gsap.set(
        [
          ".partner-estimate",
          ".partner-aside",
          ".partner-rates",
          ".partner-sheet__foot",
        ],
        { autoAlpha: 0, y: 28 },
      );

      const tl = gsap.timeline({ defaults: { ease: "power3.out" } });

      tl.to(media, { scale: 1.03, duration: 2.2, ease: "power2.out" }, 0).to(
        ".partner-toolbar",
        { autoAlpha: 1, y: 0, duration: 0.7 },
        0.1,
      );

      if (mark) {
        tl.to(
          mark,
          { autoAlpha: 1, scale: 1, duration: 1.05, ease: "power3.out" },
          0.15,
        )
          .to(
            ".partner-mark__o-ring",
            {
              strokeDashoffset: 0,
              duration: 1.2,
              stagger: 0.12,
              ease: "power2.inOut",
            },
            0.2,
          )
          .to(
            ".partner-mark__u .partner-mark__stroke",
            {
              strokeDashoffset: 0,
              duration: 1.05,
              stagger: 0.09,
              ease: "power2.inOut",
            },
            0.32,
          )
          .to(
            ".partner-mark__i-line",
            {
              strokeDashoffset: 0,
              duration: 0.75,
              stagger: 0.045,
              ease: "power2.out",
            },
            0.48,
          )
          .to(
            ".partner-mark__word",
            { autoAlpha: 1, x: 0, duration: 0.65 },
            0.78,
          )
          .add(() => {
            gsap.to(".partner-mark__o", {
              rotation: 360,
              svgOrigin: "100 110",
              duration: 56,
              ease: "none",
              repeat: -1,
            });
            gsap.to(".partner-mark__o-ring", {
              opacity: 0.55,
              duration: 2.6,
              stagger: { each: 0.4, yoyo: true, repeat: -1 },
              ease: "sine.inOut",
              yoyo: true,
              repeat: -1,
            });
            gsap.to(".partner-mark__i-line", {
              opacity: 0.45,
              duration: 1.7,
              stagger: { each: 0.16, yoyo: true, repeat: -1 },
              ease: "sine.inOut",
              yoyo: true,
              repeat: -1,
            });
            gsap.to(".partner-mark__u", {
              y: -5,
              duration: 3.4,
              ease: "sine.inOut",
              yoyo: true,
              repeat: -1,
            });
          }, 1.15);
      }

      tl.to(".partner-hero__eyebrow", { autoAlpha: 1, y: 0, duration: 0.7 }, 0.95)
        .to(".partner-hero__title", { autoAlpha: 1, y: 0, duration: 0.8 }, 1.05)
        .to(".partner-hero__lede", { autoAlpha: 1, y: 0, duration: 0.7 }, "-=0.48")
        .to(".partner-hero__jump", { autoAlpha: 1, y: 0, duration: 0.65 }, "-=0.4")
        .to(".partner-estimate", { autoAlpha: 1, y: 0, duration: 0.75 }, "-=0.15")
        .to(".partner-aside", { autoAlpha: 1, y: 0, duration: 0.75 }, "-=0.55")
        .to(
          [".partner-rates", ".partner-sheet__foot"],
          {
            autoAlpha: 1,
            y: 0,
            duration: 0.7,
            stagger: 0.08,
            onComplete: () => {
              gsap.set(
                [
                  ".partner-estimate",
                  ".partner-aside",
                  ".partner-rates",
                  ".partner-sheet__foot",
                  ".partner-hero__eyebrow",
                  ".partner-hero__title",
                  ".partner-hero__lede",
                  ".partner-hero__jump",
                  ".partner-toolbar",
                ],
                { clearProps: "transform" },
              );
            },
          },
          "-=0.4",
        );
    },
    { scope: root },
  );

  return (
    <div className="partner" ref={root}>
      {children}
    </div>
  );
}

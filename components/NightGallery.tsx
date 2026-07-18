"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import "./night-gallery.css";

gsap.registerPlugin(useGSAP);

export type NightGalleryPhoto = {
  id: number;
  url: string;
};

export default function NightGallery({
  photos,
  title = "Event gallery",
  subtitle = "Swipe through moments from this session",
}: {
  photos: NightGalleryPhoto[];
  title?: string;
  subtitle?: string;
}) {
  const root = useRef<HTMLElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const updateActive = useCallback(() => {
    const el = track.current;
    if (!el || !photos.length) return;
    const slides = Array.from(el.querySelectorAll<HTMLElement>(".night-gallery__slide"));
    if (!slides.length) return;

    const mid = el.scrollLeft + el.clientWidth / 2;
    let best = 0;
    let bestDist = Infinity;
    slides.forEach((slide, i) => {
      const center = slide.offsetLeft + slide.offsetWidth / 2;
      const dist = Math.abs(center - mid);
      if (dist < bestDist) {
        bestDist = dist;
        best = i;
      }
    });
    setActive(best);

    // Opacity only — avoid scale/x transforms that inflate WebKit scrollHeight
    slides.forEach((slide, i) => {
      gsap.to(slide, {
        opacity: i === best ? 1 : 0.62,
        duration: 0.3,
        ease: "power2.out",
        overwrite: "auto",
      });
    });
  }, [photos.length]);

  useGSAP(
    () => {
      if (!photos.length) return;
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const slides = gsap.utils.toArray<HTMLElement>(".night-gallery__slide");
      if (!slides.length) return;

      if (reduce) {
        gsap.set(slides, { clearProps: "all" });
        return;
      }

      gsap.fromTo(
        slides,
        { opacity: 0 },
        {
          opacity: (i: number) => (i === 0 ? 1 : 0.62),
          duration: 0.5,
          stagger: 0.05,
          ease: "power2.out",
          onComplete: updateActive,
        },
      );

      const el = track.current;
      if (!el) return;
      el.addEventListener("scroll", updateActive, { passive: true });
      return () => el.removeEventListener("scroll", updateActive);
    },
    { scope: root, dependencies: [photos.map((p) => p.id).join(",")], revertOnUpdate: true },
  );

  if (!photos.length) return null;

  const lightboxNode =
    mounted && lightbox != null
      ? createPortal(
          <div
            className="night-gallery__lightbox"
            role="dialog"
            aria-modal="true"
            aria-label={`Photo ${lightbox + 1}`}
            onClick={() => setLightbox(null)}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photos[lightbox]?.url} alt="" onClick={(e) => e.stopPropagation()} />
            <button
              type="button"
              className="night-gallery__lightbox-close"
              onClick={() => setLightbox(null)}
            >
              Close
            </button>
          </div>,
          document.body,
        )
      : null;

  return (
    <section ref={root} className="night-gallery" aria-label={title}>
      <div className="night-gallery__head">
        <h2 className="night-gallery__title">{title}</h2>
        <p className="night-gallery__sub">{subtitle}</p>
      </div>

      <div
        ref={track}
        className="night-gallery__track"
        tabIndex={0}
        role="list"
        aria-label={`${photos.length} photos`}
      >
        {photos.map((photo, index) => (
          <button
            key={photo.id}
            type="button"
            className={`night-gallery__slide${active === index ? " is-active" : ""}`}
            role="listitem"
            aria-label={`Photo ${index + 1} of ${photos.length}`}
            onClick={() => setLightbox(index)}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photo.url}
              alt=""
              loading={index < 2 ? "eager" : "lazy"}
              decoding="async"
              draggable={false}
            />
          </button>
        ))}
      </div>

      <div className="night-gallery__dots" aria-hidden="true">
        {photos.map((photo, index) => (
          <span
            key={photo.id}
            className={`night-gallery__dot${active === index ? " is-on" : ""}`}
          />
        ))}
      </div>

      {lightboxNode}
    </section>
  );
}

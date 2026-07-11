(() => {
  if (typeof gsap === "undefined") return;

  gsap.registerPlugin(ScrollTrigger, ScrollToPlugin);

  const slides = Array.from(document.querySelectorAll(".hero__slide"));
  const mm = gsap.matchMedia();

  // Prefer native scroll; ScrollToPlugin handles nav clicks.
  document.documentElement.style.scrollBehavior = "auto";

  mm.add("(prefers-reduced-motion: reduce)", () => {
    gsap.set(
      [
        ".topbar",
        ".hero__logo",
        ".hero__title",
        ".hero__lede",
        ".hero__actions",
        ".eyebrow",
        ".section__title",
        ".section__lede",
        ".pillars li",
        ".rate-row",
        ".addon-list li",
        ".contact__inner > *",
        ".footer > *",
      ],
      { clearProps: "all" }
    );
  });

  mm.add("(prefers-reduced-motion: no-preference)", () => {
    gsap.defaults({ ease: "power3.out" });

    const reveal = (targets, vars = {}) => {
      const elements = gsap.utils.toArray(targets);
      if (!elements.length) return;

      gsap.set(elements, { autoAlpha: 0, y: vars.y ?? 28, x: vars.x ?? 0 });

      gsap.to(elements, {
        autoAlpha: 1,
        y: 0,
        x: 0,
        duration: vars.duration ?? 0.75,
        stagger: vars.stagger ?? 0.08,
        ease: "power2.out",
        overwrite: "auto",
        scrollTrigger: {
          trigger: vars.trigger || elements[0],
          start: vars.start || "top 85%",
          once: true,
          toggleActions: "play none none none",
        },
      });
    };

    // —— Hero entrance ——
    const heroTl = gsap.timeline({ defaults: { ease: "power3.out" } });

    gsap.set(".topbar", { autoAlpha: 0, y: -12 });
    gsap.set(".hero__logo", { autoAlpha: 0, y: 20, scale: 0.96 });
    gsap.set([".hero__title", ".hero__lede", ".hero__actions"], { autoAlpha: 0, y: 24 });
    gsap.set(".hero__slide.is-active", { scale: 1.08 });

    heroTl
      .to(".hero__slide.is-active", { scale: 1.03, duration: 2.2, ease: "power2.out" }, 0)
      .to(".topbar", { autoAlpha: 1, y: 0, duration: 0.7 }, 0.1)
      .to(".hero__logo", { autoAlpha: 1, y: 0, scale: 1, duration: 1 }, 0.2)
      .to(".hero__title", { autoAlpha: 1, y: 0, duration: 0.8 }, "-=0.5")
      .to(".hero__lede", { autoAlpha: 1, y: 0, duration: 0.7 }, "-=0.5")
      .to(".hero__actions", { autoAlpha: 1, y: 0, duration: 0.65 }, "-=0.4");

    // —— Hero background crossfade + ken burns ——
    if (slides.length > 1) {
      let index = 0;
      gsap.set(slides, { autoAlpha: 0, scale: 1.06 });
      gsap.set(slides[0], { autoAlpha: 1, scale: 1.03 });

      const burn = (slide) => {
        gsap.fromTo(
          slide,
          { scale: 1.03 },
          { scale: 1.1, duration: 10, ease: "none", overwrite: "auto" }
        );
      };

      burn(slides[0]);

      gsap.delayedCall(7, function cycle() {
        const current = slides[index];
        index = (index + 1) % slides.length;
        const next = slides[index];

        slides.forEach((slide) => slide.classList.toggle("is-active", slide === next));

        gsap.set(next, { autoAlpha: 0, zIndex: 2 });
        gsap.set(current, { zIndex: 1 });

        gsap.to(next, { autoAlpha: 1, duration: 1.4, ease: "power2.inOut" });
        gsap.to(current, {
          autoAlpha: 0,
          duration: 1.4,
          ease: "power2.inOut",
          onComplete: () => gsap.set(current, { zIndex: 0 }),
        });
        burn(next);
        gsap.delayedCall(7, cycle);
      });
    }

    // Soft parallax on media only — keep hero text pinned/stable
    gsap.to(".hero__media", {
      yPercent: 10,
      ease: "none",
      scrollTrigger: {
        trigger: ".hero",
        start: "top top",
        end: "bottom top",
        scrub: 0.6,
      },
    });

    ScrollTrigger.create({
      trigger: ".hero",
      start: "bottom top+=64",
      onEnter: () => document.querySelector(".topbar")?.classList.add("is-solid"),
      onLeaveBack: () => document.querySelector(".topbar")?.classList.remove("is-solid"),
    });

    // —— One-shot section reveals (no reverse = no scroll flicker) ——
    document.querySelectorAll(".section").forEach((section) => {
      reveal(section.querySelectorAll(".eyebrow, .section__title, .section__lede"), {
        trigger: section,
        start: "top 80%",
        y: 24,
        stagger: 0.1,
      });
    });

    reveal(".pillars li", { trigger: ".pillars", y: 28, stagger: 0.1 });
    reveal(".rate-row", { trigger: ".rate-table", y: 18, stagger: 0.07 });
    reveal(".fineprint", { trigger: ".fineprint", y: 12 });
    reveal(".addon-list li", { trigger: ".addon-list", y: 18, stagger: 0.06 });
    reveal(".contact__inner > *", { trigger: ".contact__inner", start: "top 78%", y: 22, stagger: 0.08 });
    reveal(".footer > *", { trigger: ".footer", start: "top 95%", y: 14, stagger: 0.05 });

    // —— Summer promo ——
    const summer = document.querySelector(".summer");
    if (summer) {
      gsap.set(".summer__eyebrow, .summer__title-line, .summer__lede, .summer__stats, .summer__compare, .summer__actions", {
        autoAlpha: 0,
        y: 28,
      });
      gsap.set(".summer__ring", { autoAlpha: 0, scale: 0.82, transformOrigin: "50% 50%" });
      gsap.set(".summer__glow", { autoAlpha: 0, scale: 0.9 });

      const summerTl = gsap.timeline({
        defaults: { ease: "power2.out" },
        scrollTrigger: {
          trigger: summer,
          start: "top 75%",
          once: true,
        },
      });

      summerTl
        .to(".summer__glow", { autoAlpha: 1, scale: 1, duration: 1.1 }, 0)
        .to(
          ".summer__ring",
          { autoAlpha: 1, scale: 1, duration: 1, stagger: 0.12, ease: "power3.out" },
          0.1
        )
        .to(".summer__eyebrow", { autoAlpha: 1, y: 0, duration: 0.6 }, 0.15)
        .to(".summer__title-line", { autoAlpha: 1, y: 0, duration: 0.75, stagger: 0.12 }, 0.25)
        .to(".summer__lede", { autoAlpha: 1, y: 0, duration: 0.65 }, 0.45)
        .to(".summer__stats", { autoAlpha: 1, y: 0, duration: 0.7 }, 0.55)
        .to(".summer__compare", { autoAlpha: 1, y: 0, duration: 0.55 }, 0.7)
        .to(".summer__actions", { autoAlpha: 1, y: 0, duration: 0.55 }, 0.8);

      document.querySelectorAll("[data-summer-count]").forEach((el) => {
        const end = Number(el.getAttribute("data-summer-count")) || 0;
        const counter = { val: 0 };
        gsap.to(counter, {
          val: end,
          duration: 1.15,
          ease: "power2.out",
          delay: 0.55,
          scrollTrigger: {
            trigger: summer,
            start: "top 75%",
            once: true,
          },
          onUpdate: () => {
            el.textContent = String(Math.round(counter.val));
          },
        });
      });

      gsap.to(".summer__rings", {
        rotation: 18,
        ease: "none",
        scrollTrigger: {
          trigger: summer,
          start: "top bottom",
          end: "bottom top",
          scrub: 1,
        },
      });

      gsap.to(".summer__glow", {
        yPercent: 18,
        ease: "none",
        scrollTrigger: {
          trigger: summer,
          start: "top bottom",
          end: "bottom top",
          scrub: 1,
        },
      });
    }

    gsap.fromTo(
      ".contact__media",
      { scale: 1.06 },
      {
        scale: 1,
        ease: "none",
        scrollTrigger: {
          trigger: ".contact",
          start: "top bottom",
          end: "bottom top",
          scrub: 0.8,
        },
      }
    );

    document.querySelectorAll('a[href^="#"]').forEach((link) => {
      link.addEventListener("click", (event) => {
        const id = link.getAttribute("href");
        if (!id || id === "#") return;
        const target = document.querySelector(id);
        if (!target) return;
        event.preventDefault();
        gsap.to(window, {
          duration: 0.85,
          scrollTo: { y: target, offsetY: 12, autoKill: true },
          ease: "power2.inOut",
          overwrite: "auto",
        });
      });
    });

    document.querySelectorAll(".btn").forEach((btn) => {
      const enter = () => gsap.to(btn, { y: -2, duration: 0.22, ease: "power2.out", overwrite: "auto" });
      const leave = () => gsap.to(btn, { y: 0, duration: 0.28, ease: "power2.out", overwrite: "auto" });
      btn.addEventListener("pointerenter", enter);
      btn.addEventListener("pointerleave", leave);
    });

    // Recalculate after fonts/images settle to avoid mid-scroll jumps
    window.addEventListener("load", () => ScrollTrigger.refresh());

    return () => {
      ScrollTrigger.getAll().forEach((st) => st.kill());
    };
  });
})();

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
        ".dock",
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

      const y = vars.y ?? 28;
      gsap.set(elements, { autoAlpha: 0, y, x: vars.x ?? 0 });

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
        onComplete: () => {
          // Drop leftover transforms so they can't inflate document scroll height
          gsap.set(elements, { clearProps: "transform" });
        },
      });
    };

    // —— Hero entrance ——
    const heroTl = gsap.timeline({ defaults: { ease: "power3.out" } });
    const heroMark = document.querySelector(".hero__mark");
    const heroStrokes = gsap.utils.toArray(".hero__mark-stroke");

    heroStrokes.forEach((el) => {
      const length =
        typeof el.getTotalLength === "function" ? el.getTotalLength() : 220;
      el.style.strokeDasharray = String(length);
      el.style.strokeDashoffset = String(length);
    });

    gsap.set(".topbar", { autoAlpha: 0, y: -12 });
    const dockEl = document.querySelector(".dock");
    const showDock = window.matchMedia("(min-width: 860px)").matches;
    if (dockEl && showDock) {
      gsap.set(dockEl, { autoAlpha: 0, y: 16, x: -8 });
    }
    if (heroMark) {
      gsap.set(heroMark, { autoAlpha: 0, scale: 0.94, transformOrigin: "50% 50%" });
      gsap.set(".hero__mark-word", { autoAlpha: 0, x: 12 });
    }
    gsap.set([".hero__title", ".hero__lede", ".hero__actions"], { autoAlpha: 0, y: 24 });
    gsap.set(".hero__slide.is-active", { scale: 1.08 });

    heroTl
      .to(".hero__slide.is-active", { scale: 1.03, duration: 2.2, ease: "power2.out" }, 0)
      .to(".topbar", { autoAlpha: 1, y: 0, duration: 0.7 }, 0.1);

    if (dockEl && showDock) {
      heroTl.to(dockEl, { autoAlpha: 1, y: 0, x: 0, duration: 0.75, ease: "power3.out" }, 1.05);
    }

    if (heroMark) {
      heroTl
        .to(heroMark, { autoAlpha: 1, scale: 1, duration: 1.05, ease: "power3.out" }, 0.15)
        .to(
          ".hero__mark-o-ring",
          { strokeDashoffset: 0, duration: 1.2, stagger: 0.12, ease: "power2.inOut" },
          0.2,
        )
        .to(
          ".hero__mark-u .hero__mark-stroke",
          { strokeDashoffset: 0, duration: 1.05, stagger: 0.09, ease: "power2.inOut" },
          0.32,
        )
        .to(
          ".hero__mark-i-line",
          { strokeDashoffset: 0, duration: 0.75, stagger: 0.045, ease: "power2.out" },
          0.48,
        )
        .to(".hero__mark-word", { autoAlpha: 1, x: 0, duration: 0.65 }, 0.78)
        .add(() => {
          gsap.to(".hero__mark-o", {
            rotation: 360,
            svgOrigin: "100 110",
            duration: 56,
            ease: "none",
            repeat: -1,
          });
          gsap.to(".hero__mark-o-ring", {
            opacity: 0.55,
            duration: 2.6,
            stagger: { each: 0.4, yoyo: true, repeat: -1 },
            ease: "sine.inOut",
            yoyo: true,
            repeat: -1,
          });
          gsap.to(".hero__mark-i-line", {
            opacity: 0.45,
            duration: 1.7,
            stagger: { each: 0.16, yoyo: true, repeat: -1 },
            ease: "sine.inOut",
            yoyo: true,
            repeat: -1,
          });
          gsap.to(".hero__mark-u", {
            y: -5,
            duration: 3.4,
            ease: "sine.inOut",
            yoyo: true,
            repeat: -1,
          });
        }, 1.15);
    }

    heroTl
      .to(".hero__title", { autoAlpha: 1, y: 0, duration: 0.8 }, 0.95)
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

    // Soft parallax on media only — keep hero text pinned/stable (desktop+)
    mm.add("(min-width: 721px)", () => {
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
    reveal(".experience-tech__bar, .experience-tech__row", {
      trigger: ".experience-tech",
      y: 18,
      stagger: 0.06,
    });
    reveal(".rate-row", { trigger: ".rate-table", y: 18, stagger: 0.07 });
    reveal(".fineprint", { trigger: ".fineprint", y: 12 });
    reveal(".addon-list li", { trigger: ".addon-list", y: 18, stagger: 0.06 });
    reveal(".playlist__embed", { trigger: ".playlist__embed", y: 20 });
    // Contact / footer: opacity only — y transforms near page end inflate mobile scroll height
    reveal(".contact__inner > *", {
      trigger: ".contact__inner",
      start: "top 90%",
      y: 0,
      stagger: 0.06,
    });
    gsap.set(".footer > *", { autoAlpha: 1, clearProps: "transform" });

    // —— Featured appearance ——
    const feature = document.querySelector(".feature");
    if (feature) {
      gsap.set(".feature__media", { scale: 1.08 });
      gsap.set(".feature__date", { autoAlpha: 0, y: -12 });
      gsap.set(
        ".feature__eyebrow, .feature__title, .feature__meta, .feature__lede, .feature__chips, .feature__actions",
        { autoAlpha: 0, y: 24 },
      );

      const featureTl = gsap.timeline({
        defaults: { ease: "power2.out" },
        scrollTrigger: {
          trigger: feature,
          start: "top 72%",
          once: true,
        },
      });

      featureTl
        .to(".feature__media", { scale: 1.03, duration: 1.35, ease: "power1.out" }, 0)
        .to(".feature__date", { autoAlpha: 1, y: 0, duration: 0.55, ease: "power2.out" }, 0.05)
        .to(".feature__eyebrow", { autoAlpha: 1, y: 0, duration: 0.55 }, 0.12)
        .to(".feature__title", { autoAlpha: 1, y: 0, duration: 0.75 }, 0.2)
        .to(".feature__meta", { autoAlpha: 1, y: 0, duration: 0.6 }, 0.35)
        .to(".feature__lede", { autoAlpha: 1, y: 0, duration: 0.6 }, 0.45)
        .to(".feature__chips", { autoAlpha: 1, y: 0, duration: 0.55 }, 0.52)
        .to(".feature__chips li", { autoAlpha: 1, y: 0, duration: 0.4, stagger: 0.04 }, 0.55)
        .to(".feature__actions", { autoAlpha: 1, y: 0, duration: 0.55 }, 0.7)
        .add(() => {
          gsap.set(
            ".feature__date, .feature__eyebrow, .feature__title, .feature__meta, .feature__lede, .feature__chips, .feature__actions, .feature__chips li",
            { clearProps: "transform" }
          );
        });
    }

    // —— Summer promo ——
    const summer = document.querySelector(".summer");
    const summerMark = document.querySelector(".summer__mark");
    const summerMarkWrap = document.querySelector(".summer__mark-wrap");
    if (summer && summerMark && summerMarkWrap) {
      const strokes = gsap.utils.toArray(".summer .summer__mark-stroke");
      strokes.forEach((el) => {
        const length = typeof el.getTotalLength === "function" ? el.getTotalLength() : 220;
        el.style.strokeDasharray = String(length);
        el.style.strokeDashoffset = String(length);
      });

      gsap.set(
        ".summer__eyebrow, .summer__title-line, .summer__lede, .summer__stats, .summer__compare, .summer__reel, .summer__actions",
        { autoAlpha: 0, y: 28 }
      );
      gsap.set(summerMark, { autoAlpha: 0, scale: 0.92, transformOrigin: "50% 50%" });
      gsap.set(".summer .summer__mark-word", { autoAlpha: 0, x: 14 });
      gsap.set(".summer__wash", { autoAlpha: 0 });

      const summerTl = gsap.timeline({
        defaults: { ease: "power2.out" },
        scrollTrigger: {
          trigger: summer,
          start: "top 75%",
          once: true,
        },
        onComplete: () => {
          gsap.to(".summer .summer__mark-o", {
            rotation: 360,
            svgOrigin: "100 110",
            duration: 56,
            ease: "none",
            repeat: -1,
          });

          gsap.to(".summer .summer__mark-o-ring", {
            opacity: 0.5,
            duration: 2.6,
            stagger: { each: 0.4, yoyo: true, repeat: -1 },
            ease: "sine.inOut",
            yoyo: true,
            repeat: -1,
          });

          gsap.to(".summer .summer__mark-i-line", {
            opacity: 0.4,
            duration: 1.7,
            stagger: { each: 0.16, yoyo: true, repeat: -1 },
            ease: "sine.inOut",
            yoyo: true,
            repeat: -1,
          });

          gsap.to(".summer .summer__mark-u", {
            y: -6,
            duration: 3.4,
            ease: "sine.inOut",
            yoyo: true,
            repeat: -1,
          });
        },
      });

      summerTl
        .to(".summer__wash", { autoAlpha: 1, duration: 0.9 }, 0)
        .to(summerMark, { autoAlpha: 1, scale: 1, duration: 1.2, ease: "power3.out" }, 0)
        .to(
          ".summer .summer__mark-o-ring",
          { strokeDashoffset: 0, duration: 1.35, stagger: 0.14, ease: "power2.inOut" },
          0.05
        )
        .to(
          ".summer .summer__mark-u .summer__mark-stroke",
          { strokeDashoffset: 0, duration: 1.2, stagger: 0.1, ease: "power2.inOut" },
          0.2
        )
        .to(
          ".summer .summer__mark-i-line",
          { strokeDashoffset: 0, duration: 0.85, stagger: 0.05, ease: "power2.out" },
          0.4
        )
        .to(".summer .summer__mark-word", { autoAlpha: 1, x: 0, duration: 0.7 }, 0.75)
        .to(".summer__eyebrow", { autoAlpha: 1, y: 0, duration: 0.6 }, 0.2)
        .to(".summer__title-line", { autoAlpha: 1, y: 0, duration: 0.75, stagger: 0.12 }, 0.3)
        .to(".summer__lede", { autoAlpha: 1, y: 0, duration: 0.65 }, 0.5)
        .to(".summer__stats", { autoAlpha: 1, y: 0, duration: 0.7 }, 0.6)
        .to(".summer__compare", { autoAlpha: 1, y: 0, duration: 0.55 }, 0.75)
        .to(".summer__reel", { autoAlpha: 1, y: 0, duration: 0.65 }, 0.55)
        .to(".summer__actions", { autoAlpha: 1, y: 0, duration: 0.55 }, 0.95)
        .add(() => {
          gsap.set(
            ".summer__eyebrow, .summer__title-line, .summer__lede, .summer__stats, .summer__compare, .summer__reel, .summer__actions",
            { clearProps: "transform" }
          );
        });

      const summerReel = summer.querySelector(".summer__reel-video");
      if (summerReel) {
        summerReel.muted = true;
        summerReel.defaultMuted = true;
        summerReel.setAttribute("muted", "");
        summerReel.playsInline = true;
        summerReel.loop = true;
        ScrollTrigger.create({
          trigger: summerReel,
          start: "top 85%",
          end: "bottom 15%",
          onEnter: () => {
            summerReel.play().catch(() => {});
          },
          onEnterBack: () => {
            summerReel.play().catch(() => {});
          },
          onLeave: () => summerReel.pause(),
          onLeaveBack: () => summerReel.pause(),
        });
      }

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

      // Desktop-only mark parallax — contained by .summer__fx overflow clip
      mm.add("(min-width: 721px)", () => {
        gsap.fromTo(
          summerMarkWrap,
          { yPercent: -46 },
          {
            yPercent: -54,
            ease: "none",
            scrollTrigger: {
              trigger: summer,
              start: "top bottom",
              end: "bottom top",
              scrub: 1.2,
            },
          }
        );
      });
    }

    mm.add("(min-width: 721px)", () => {
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
    });

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
    const refreshScroll = () => ScrollTrigger.refresh();
    window.addEventListener("load", refreshScroll);
    window.addEventListener("orientationchange", () => {
      window.setTimeout(refreshScroll, 250);
    });

    return () => {
      window.removeEventListener("load", refreshScroll);
      ScrollTrigger.getAll().forEach((st) => st.kill());
    };
  });
})();

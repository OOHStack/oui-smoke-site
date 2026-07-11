(() => {
  if (typeof gsap === "undefined") return;

  gsap.registerPlugin(ScrollTrigger, ScrollToPlugin);

  const slides = Array.from(document.querySelectorAll(".hero__slide"));
  const mm = gsap.matchMedia();

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

    // —— Hero entrance ——
    const heroTl = gsap.timeline({ defaults: { ease: "power3.out" } });

    gsap.set(".topbar", { autoAlpha: 0, y: -16 });
    gsap.set(".hero__logo", { autoAlpha: 0, y: 28, scale: 0.92, filter: "blur(10px)" });
    gsap.set([".hero__title", ".hero__lede", ".hero__actions"], { autoAlpha: 0, y: 32 });
    gsap.set(".hero__slide.is-active", { scale: 1.12 });

    heroTl
      .to(".hero__slide.is-active", { scale: 1.04, duration: 2.4, ease: "power2.out" }, 0)
      .to(".topbar", { autoAlpha: 1, y: 0, duration: 0.8 }, 0.15)
      .to(
        ".hero__logo",
        { autoAlpha: 1, y: 0, scale: 1, filter: "blur(0px)", duration: 1.2 },
        0.25
      )
      .to(".hero__title", { autoAlpha: 1, y: 0, duration: 0.9 }, "-=0.55")
      .to(".hero__lede", { autoAlpha: 1, y: 0, duration: 0.8 }, "-=0.55")
      .to(".hero__actions", { autoAlpha: 1, y: 0, duration: 0.75 }, "-=0.45");

    // —— Hero background crossfade + ken burns ——
    if (slides.length > 1) {
      let index = 0;
      gsap.set(slides, { autoAlpha: 0, scale: 1.08 });
      gsap.set(slides[0], { autoAlpha: 1, scale: 1.04 });

      const burn = (slide) => {
        gsap.fromTo(
          slide,
          { scale: 1.04 },
          { scale: 1.14, duration: 9, ease: "none", overwrite: "auto" }
        );
      };

      burn(slides[0]);

      gsap.delayedCall(6.5, function cycle() {
        const current = slides[index];
        index = (index + 1) % slides.length;
        const next = slides[index];

        slides.forEach((slide) => slide.classList.toggle("is-active", slide === next));

        gsap.set(next, { autoAlpha: 0, zIndex: 2 });
        gsap.set(current, { zIndex: 1 });

        gsap.to(next, { autoAlpha: 1, duration: 1.5, ease: "power2.inOut" });
        gsap.to(current, {
          autoAlpha: 0,
          duration: 1.5,
          ease: "power2.inOut",
          onComplete: () => gsap.set(current, { zIndex: 0 }),
        });
        burn(next);
        gsap.delayedCall(6.5, cycle);
      });
    }

    // —— Hero parallax while in view ——
    gsap.to(".hero__media", {
      yPercent: 18,
      ease: "none",
      scrollTrigger: {
        trigger: ".hero",
        start: "top top",
        end: "bottom top",
        scrub: true,
      },
    });

    gsap.to(".hero__content", {
      yPercent: 12,
      autoAlpha: 0.15,
      ease: "none",
      scrollTrigger: {
        trigger: ".hero",
        start: "center top",
        end: "bottom top",
        scrub: true,
      },
    });

    // —— Topbar densifies after leaving hero ——
    ScrollTrigger.create({
      trigger: ".hero",
      start: "bottom top+=64",
      onEnter: () => document.querySelector(".topbar")?.classList.add("is-solid"),
      onLeaveBack: () => document.querySelector(".topbar")?.classList.remove("is-solid"),
    });

    // —— Section reveals ——
    document.querySelectorAll(".section").forEach((section) => {
      const introBits = section.querySelectorAll(".eyebrow, .section__title, .section__lede");
      if (introBits.length) {
        gsap.from(introBits, {
          autoAlpha: 0,
          y: 40,
          duration: 0.9,
          stagger: 0.12,
          scrollTrigger: {
            trigger: section,
            start: "top 78%",
            toggleActions: "play none none reverse",
          },
        });
      }
    });

    gsap.from(".pillars li", {
      autoAlpha: 0,
      y: 48,
      duration: 0.85,
      stagger: 0.14,
      scrollTrigger: {
        trigger: ".pillars",
        start: "top 80%",
        toggleActions: "play none none reverse",
      },
    });

    gsap.from(".rate-row", {
      autoAlpha: 0,
      y: 28,
      duration: 0.7,
      stagger: 0.1,
      scrollTrigger: {
        trigger: ".rate-table",
        start: "top 82%",
        toggleActions: "play none none reverse",
      },
    });

    gsap.from(".fineprint", {
      autoAlpha: 0,
      y: 16,
      duration: 0.6,
      scrollTrigger: {
        trigger: ".fineprint",
        start: "top 90%",
        toggleActions: "play none none reverse",
      },
    });

    gsap.from(".addon-list li", {
      autoAlpha: 0,
      x: -24,
      duration: 0.65,
      stagger: 0.08,
      scrollTrigger: {
        trigger: ".addon-list",
        start: "top 82%",
        toggleActions: "play none none reverse",
      },
    });

    gsap.from(".contact__media", {
      scale: 1.12,
      ease: "none",
      scrollTrigger: {
        trigger: ".contact",
        start: "top bottom",
        end: "bottom top",
        scrub: true,
      },
    });

    gsap.from(".contact__inner > *", {
      autoAlpha: 0,
      y: 36,
      duration: 0.8,
      stagger: 0.1,
      scrollTrigger: {
        trigger: ".contact__inner",
        start: "top 75%",
        toggleActions: "play none none reverse",
      },
    });

    gsap.from(".footer > *", {
      autoAlpha: 0,
      y: 20,
      duration: 0.7,
      stagger: 0.08,
      scrollTrigger: {
        trigger: ".footer",
        start: "top 92%",
        toggleActions: "play none none reverse",
      },
    });

    // —— Smooth in-page nav ——
    document.querySelectorAll('a[href^="#"]').forEach((link) => {
      link.addEventListener("click", (event) => {
        const id = link.getAttribute("href");
        if (!id || id === "#") return;
        const target = document.querySelector(id);
        if (!target) return;
        event.preventDefault();
        gsap.to(window, {
          duration: 1,
          scrollTo: { y: target, offsetY: 12 },
          ease: "power2.inOut",
        });
      });
    });

    // —— Button hover lift ——
    document.querySelectorAll(".btn").forEach((btn) => {
      const enter = () => gsap.to(btn, { y: -2, duration: 0.25, ease: "power2.out" });
      const leave = () => gsap.to(btn, { y: 0, duration: 0.35, ease: "power2.out" });
      btn.addEventListener("pointerenter", enter);
      btn.addEventListener("pointerleave", leave);
    });

    return () => {
      ScrollTrigger.getAll().forEach((st) => st.kill());
    };
  });
})();

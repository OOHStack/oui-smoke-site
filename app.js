(() => {
  const bgSlides = Array.from(document.querySelectorAll(".bg-slide"));
  const panels = Array.from(document.querySelectorAll(".panel"));
  const dots = Array.from(document.querySelectorAll(".deck-dot"));
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const intro = () => {
    if (typeof gsap === "undefined") {
      document.querySelectorAll(".brand-logo, .deck, .deck-dots, .cta, .locale").forEach((el) => {
        el.style.opacity = "1";
      });
      return;
    }

    gsap.set([".brand-logo", ".deck", ".deck-dots", ".cta", ".locale"], {
      opacity: 0,
      y: 18,
    });
    gsap.set(".brand-logo", { scale: 0.94, filter: "blur(6px)" });

    const tl = gsap.timeline({ defaults: { ease: "power3.out" } });

    tl.to(".brand-logo", {
      opacity: 1,
      y: 0,
      scale: 1,
      filter: "blur(0px)",
      duration: 1.05,
    })
      .to(
        ".deck",
        {
          opacity: 1,
          y: 0,
          duration: 0.75,
        },
        "-=0.45"
      )
      .to(
        [".deck-dots", ".cta", ".locale"],
        {
          opacity: 1,
          y: 0,
          duration: 0.6,
          stagger: 0.07,
        },
        "-=0.35"
      );
  };

  const kenBurns = (slide) => {
    if (reduceMotion || typeof gsap === "undefined") return;
    const img = slide.querySelector(".bg-slide__img");
    if (!img) return;

    gsap.fromTo(
      img,
      { scale: 1.08 },
      {
        scale: 1.16,
        duration: 10,
        ease: "none",
        overwrite: "auto",
      }
    );
  };

  const startBackgroundSlideshow = () => {
    if (!bgSlides.length) return;

    bgSlides.forEach((slide, i) => {
      slide.classList.toggle("is-active", i === 0);
      if (typeof gsap !== "undefined") {
        gsap.set(slide, { opacity: i === 0 ? 1 : 0, zIndex: i === 0 ? 2 : 0 });
      }
    });

    let index = 0;
    kenBurns(bgSlides[index]);

    if (reduceMotion || bgSlides.length < 2 || typeof gsap === "undefined") return;

    let transitioning = false;

    window.setInterval(() => {
      if (transitioning) return;
      transitioning = true;

      const current = bgSlides[index];
      const nextIndex = (index + 1) % bgSlides.length;
      const next = bgSlides[nextIndex];

      gsap.set(next, { opacity: 0, zIndex: 3 });
      next.classList.add("is-active");
      kenBurns(next);

      gsap.to(next, {
        opacity: 1,
        duration: 1.6,
        ease: "power2.inOut",
        overwrite: "auto",
      });

      gsap.to(current, {
        opacity: 0,
        duration: 1.6,
        ease: "power2.inOut",
        overwrite: "auto",
        onComplete: () => {
          current.classList.remove("is-active");
          gsap.set(current, { zIndex: 0 });
          gsap.set(next, { zIndex: 2 });
          index = nextIndex;
          transitioning = false;
        },
      });
    }, 8000);
  };

  const setDots = (activeIndex) => {
    dots.forEach((dot, i) => {
      const active = i === activeIndex;
      dot.classList.toggle("is-active", active);
      dot.setAttribute("aria-selected", active ? "true" : "false");
    });
  };

  const showPanel = (nextIndex, { animate = true } = {}) => {
    const current = panels.find((panel) => panel.classList.contains("is-active"));
    const next = panels[nextIndex];
    if (!next || current === next) return;

    const finish = () => {
      if (current) {
        current.classList.remove("is-active");
        if (typeof gsap !== "undefined") gsap.set(current, { clearProps: "opacity,visibility,transform" });
      }
      next.classList.add("is-active");
      setDots(nextIndex);
    };

    if (!animate || reduceMotion || typeof gsap === "undefined") {
      finish();
      if (typeof gsap !== "undefined") {
        gsap.set(next, { opacity: 1, visibility: "visible", y: 0 });
      }
      return;
    }

    gsap.set(next, { opacity: 0, visibility: "visible", y: 18 });
    next.classList.add("is-active");
    setDots(nextIndex);

    const tl = gsap.timeline({
      defaults: { ease: "power2.inOut", overwrite: "auto" },
      onComplete: () => {
        if (current && current !== next) {
          current.classList.remove("is-active");
          gsap.set(current, { clearProps: "opacity,visibility,transform" });
        }
      },
    });

    if (current) {
      tl.to(
        current,
        {
          opacity: 0,
          y: -14,
          duration: 0.55,
        },
        0
      );
    }

    tl.to(
      next,
      {
        opacity: 1,
        y: 0,
        duration: 0.7,
      },
      current ? 0.15 : 0
    );
  };

  const startContentSlideshow = () => {
    if (panels.length < 2) return;

    let index = 0;
    let timer;

    const goTo = (nextIndex) => {
      index = ((nextIndex % panels.length) + panels.length) % panels.length;
      showPanel(index);
      restart();
    };

    const restart = () => {
      window.clearInterval(timer);
      if (reduceMotion) return;
      timer = window.setInterval(() => {
        goTo(index + 1);
      }, 5500);
    };

    panels.forEach((panel, i) => {
      panel.classList.toggle("is-active", i === 0);
      if (typeof gsap !== "undefined") {
        gsap.set(panel, {
          opacity: i === 0 ? 1 : 0,
          visibility: i === 0 ? "visible" : "hidden",
          y: 0,
        });
      }
    });
    setDots(0);

    dots.forEach((dot, i) => {
      dot.addEventListener("click", () => goTo(i));
    });

    // Light swipe support for iPad browsing
    let touchX = null;
    const deck = document.querySelector(".deck");
    if (deck) {
      deck.addEventListener(
        "touchstart",
        (event) => {
          touchX = event.changedTouches[0].clientX;
        },
        { passive: true }
      );
      deck.addEventListener(
        "touchend",
        (event) => {
          if (touchX == null) return;
          const dx = event.changedTouches[0].clientX - touchX;
          touchX = null;
          if (Math.abs(dx) < 40) return;
          goTo(index + (dx < 0 ? 1 : -1));
        },
        { passive: true }
      );
    }

    restart();
  };

  document.addEventListener(
    "touchmove",
    (event) => {
      if (event.touches.length === 1 && !event.target.closest(".deck, .deck-dots, .cta")) {
        event.preventDefault();
      }
    },
    { passive: false }
  );

  intro();
  startBackgroundSlideshow();
  startContentSlideshow();
})();

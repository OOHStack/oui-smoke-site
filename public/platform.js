(() => {
  const modal = document.getElementById("platform-preview");
  if (!modal) return;

  const dialog = modal.querySelector(".platform-modal__dialog");
  const tabs = Array.from(modal.querySelectorAll("[data-platform-tab]"));
  const panels = Array.from(modal.querySelectorAll("[data-platform-panel]"));
  const explainKicker = modal.querySelector("[data-platform-explain-kicker]");
  const explainTitle = modal.querySelector("[data-platform-explain-title]");
  const explainBody = modal.querySelector("[data-platform-explain-body]");
  const explainBlock = modal.querySelector("[data-platform-explain]");

  const COPY = {
    ops: {
      kicker: "1 · Ops console",
      title: "Our team’s live floor board",
      body: "This is what Oui staff use during your event: every hookah on the floor, open guest calls, and check timers — so service stays tight all night.",
    },
    portal: {
      kicker: "2 · Client portal",
      title: "Your window into the floor",
      body: "Hosts get a private live link to see what’s on the floor, guest requests, and refill activity — stay informed without interrupting the Oui team.",
    },
    qr: {
      kicker: "3 · Guest QR",
      title: "Service from each hookah",
      body: "Guests scan a QR on their hookah for coals, refills, or help. No app download — the request pings our floor team instantly.",
    },
  };

  let open = false;
  let lastFocused = null;
  let activeTab = "ops";

  const preferReduced = () =>
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const focusable = () =>
    Array.from(
      dialog.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      ),
    ).filter(
      (el) =>
        !el.hasAttribute("disabled") && !el.hidden && el.offsetParent !== null,
    );

  function ensureIframe(panel) {
    if (!panel) return;
    const iframe = panel.querySelector("iframe[data-platform-src]");
    if (!iframe) return;
    const src = iframe.getAttribute("data-platform-src");
    if (src && !iframe.getAttribute("src")) {
      iframe.setAttribute("src", src);
    }
  }

  function updateExplain(id, animate = true) {
    const copy = COPY[id] || COPY.ops;
    const apply = () => {
      if (explainKicker) explainKicker.textContent = copy.kicker;
      if (explainTitle) explainTitle.textContent = copy.title;
      if (explainBody) explainBody.textContent = copy.body;
    };

    if (
      animate &&
      explainBlock &&
      typeof gsap !== "undefined" &&
      !preferReduced()
    ) {
      gsap.to(explainBlock, {
        autoAlpha: 0,
        y: 6,
        duration: 0.15,
        ease: "power2.in",
        onComplete: () => {
          apply();
          gsap.fromTo(
            explainBlock,
            { autoAlpha: 0, y: 10 },
            { autoAlpha: 1, y: 0, duration: 0.28, ease: "power2.out" },
          );
        },
      });
    } else {
      apply();
    }
  }

  function setTab(id, animate = true) {
    if (!COPY[id]) id = "ops";
    activeTab = id;
    tabs.forEach((tab) => {
      const on = tab.getAttribute("data-platform-tab") === id;
      tab.classList.toggle("is-active", on);
      tab.setAttribute("aria-selected", on ? "true" : "false");
    });

    const next = panels.find((p) => p.getAttribute("data-platform-panel") === id);
    const prev = panels.find((p) => p.classList.contains("is-active"));

    panels.forEach((panel) => {
      const on = panel.getAttribute("data-platform-panel") === id;
      panel.hidden = !on;
      panel.classList.toggle("is-active", on);
      if (on) ensureIframe(panel);
    });

    updateExplain(id, animate);

    if (animate && next && typeof gsap !== "undefined" && !preferReduced()) {
      gsap.fromTo(
        next,
        { autoAlpha: 0, y: 18, scale: 0.98 },
        { autoAlpha: 1, y: 0, scale: 1, duration: 0.4, ease: "power3.out" },
      );
      if (prev && prev !== next) {
        gsap.set(prev, { clearProps: "transform,opacity,visibility" });
      }
    }
  }

  function openModal(initialTab = "ops") {
    if (open) {
      setTab(initialTab || activeTab, true);
      return;
    }
    open = true;
    lastFocused = document.activeElement;
    modal.hidden = false;
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
    setTab(initialTab || "ops", false);
    ensureIframe(
      panels.find((p) => p.getAttribute("data-platform-panel") === activeTab),
    );

    if (typeof gsap !== "undefined" && !preferReduced()) {
      gsap.fromTo(
        modal,
        { autoAlpha: 0 },
        { autoAlpha: 1, duration: 0.28, ease: "power2.out" },
      );
      gsap.fromTo(
        dialog,
        { autoAlpha: 0, y: 32, scale: 0.96 },
        { autoAlpha: 1, y: 0, scale: 1, duration: 0.5, ease: "power3.out" },
      );
      const frame = modal.querySelector(".platform-frame.is-active");
      if (frame) {
        gsap.fromTo(
          frame,
          { autoAlpha: 0, y: 24 },
          {
            autoAlpha: 1,
            y: 0,
            duration: 0.55,
            delay: 0.12,
            ease: "power3.out",
          },
        );
      }
    } else {
      modal.style.opacity = "1";
      dialog.style.opacity = "1";
    }

    window.setTimeout(() => {
      const closeBtn = modal.querySelector(
        "[data-close-platform].platform-modal__close",
      );
      (closeBtn || dialog).focus();
    }, 40);
  }

  function closeModal() {
    if (!open) return;
    const finish = () => {
      open = false;
      modal.hidden = true;
      modal.setAttribute("aria-hidden", "true");
      document.body.classList.remove("modal-open");
      if (lastFocused && typeof lastFocused.focus === "function") {
        lastFocused.focus();
      }
    };

    if (typeof gsap !== "undefined" && !preferReduced()) {
      gsap.to(dialog, {
        autoAlpha: 0,
        y: 18,
        scale: 0.98,
        duration: 0.25,
        ease: "power2.in",
      });
      gsap.to(modal, {
        autoAlpha: 0,
        duration: 0.25,
        ease: "power2.in",
        onComplete: finish,
      });
    } else {
      finish();
    }
  }

  document.querySelectorAll("[data-open-platform]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tab = btn.getAttribute("data-open-platform");
      openModal(tab && COPY[tab] ? tab : "ops");
    });
  });

  modal.querySelectorAll("[data-close-platform]").forEach((el) => {
    el.addEventListener("click", closeModal);
  });

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const id = tab.getAttribute("data-platform-tab");
      if (id) setTab(id, true);
    });
  });

  document.addEventListener("keydown", (event) => {
    if (!open) return;
    if (event.key === "Escape") {
      event.preventDefault();
      closeModal();
      return;
    }
    if (event.key !== "Tab") return;
    const items = focusable();
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
})();

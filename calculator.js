(() => {
  const modal = document.getElementById("cost-calculator");
  const dialog = modal?.querySelector(".calc-modal__dialog");
  const form = document.getElementById("calc-form");
  if (!modal || !dialog || !form) return;

  const els = {
    hookahs: document.getElementById("calc-hookahs"),
    hours: document.getElementById("calc-hours"),
    refills: document.getElementById("calc-refills"),
    refillsField: document.getElementById("calc-refills-field"),
    tier: document.getElementById("calc-tier"),
    led: document.getElementById("calc-led"),
    water: document.getElementById("calc-water"),
    branding: document.getElementById("calc-branding"),
    brandingRate: document.getElementById("calc-branding-rate"),
    brandingField: document.getElementById("calc-branding-rate-field"),
    blends: document.getElementById("calc-blends"),
    blendsWrap: document.getElementById("calc-blends-wrap"),
    blendsHint: document.getElementById("calc-blends-hint"),
    breakdown: document.getElementById("calc-breakdown"),
    subtotal: document.getElementById("calc-subtotal"),
    hst: document.getElementById("calc-hst"),
    total: document.getElementById("calc-total"),
    email: document.getElementById("calc-email"),
  };

  const HST = 0.13;
  let lastFocused = null;
  let open = false;

  const money = (n) =>
    n.toLocaleString("en-CA", {
      style: "currency",
      currency: "CAD",
      maximumFractionDigits: 0,
    });

  const moneyExact = (n) =>
    n.toLocaleString("en-CA", {
      style: "currency",
      currency: "CAD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  const tierFor = (count) => {
    if (count <= 4) {
      return {
        label: "1 – 4 hookahs · 1 refill included",
        rate: 80,
        unlimited: false,
      };
    }
    if (count <= 8) {
      return {
        label: "5 – 8 hookahs · unlimited refills",
        rate: 75,
        unlimited: true,
      };
    }
    return {
      label: "9+ hookahs · unlimited refills",
      rate: 65,
      unlimited: true,
    };
  };

  const readState = () => {
    const hookahs = Math.max(1, Math.min(40, Number(els.hookahs.value) || 1));
    const extraHours = Math.max(0, Math.min(12, Number(els.hours.value) || 0));
    const extraRefills = Math.max(0, Math.min(40, Number(els.refills.value) || 0));
    const brandingRate = Number(els.brandingRate.value) || 12;
    return {
      hookahs,
      extraHours,
      extraRefills,
      led: els.led.checked,
      water: els.water.checked,
      branding: els.branding.checked,
      brandingRate,
      blends: els.blends.checked,
    };
  };

  const calculate = (state) => {
    const tier = tierFor(state.hookahs);
    const lines = [];

    const base = state.hookahs * tier.rate;
    lines.push({
      label: `${state.hookahs} hookahs × ${money(tier.rate)}`,
      amount: base,
    });

    if (!tier.unlimited && state.extraRefills > 0) {
      const refillCost = state.extraRefills * 25;
      lines.push({
        label: `${state.extraRefills} extra refill${state.extraRefills === 1 ? "" : "s"} × $25`,
        amount: refillCost,
      });
    }

    if (state.extraHours > 0) {
      const hoursCost = state.extraHours * 120;
      lines.push({
        label: `${state.extraHours} extra hour${state.extraHours === 1 ? "" : "s"} × $120`,
        amount: hoursCost,
      });
    }

    if (state.led) {
      const ledCost = state.hookahs * 10;
      lines.push({ label: `LED bases × ${state.hookahs}`, amount: ledCost });
    }

    if (state.water) {
      const waterCost = state.hookahs * 5;
      lines.push({ label: `Water enhancers × ${state.hookahs}`, amount: waterCost });
    }

    if (state.branding) {
      const brandedUnits = Math.max(4, state.hookahs);
      const brandingCost = brandedUnits * state.brandingRate;
      lines.push({
        label: `Unit branding × ${brandedUnits} @ ${moneyExact(state.brandingRate).replace(".00", "")}`,
        amount: brandingCost,
      });
    }

    if (state.blends && state.hookahs >= 5) {
      lines.push({ label: "Custom flavour blends", amount: 0, note: "Quoted separately" });
    }

    const subtotal = lines.reduce((sum, line) => sum + line.amount, 0);
    const hst = subtotal * HST;
    return { tier, lines, subtotal, hst, total: subtotal + hst };
  };

  const render = () => {
    const state = readState();
    const result = calculate(state);

    els.hookahs.value = String(state.hookahs);
    els.hours.value = String(state.extraHours);
    els.refills.value = String(state.extraRefills);

    els.tier.textContent = result.tier.label;
    els.refillsField.hidden = result.tier.unlimited;
    els.brandingField.hidden = !state.branding;

    const blendsAvailable = state.hookahs >= 5;
    els.blends.disabled = !blendsAvailable;
    if (!blendsAvailable) els.blends.checked = false;
    els.blendsHint.hidden = blendsAvailable;
    els.blendsWrap.classList.toggle("is-disabled", !blendsAvailable);

    els.breakdown.innerHTML = result.lines
      .map((line) => {
        const value = line.note ? line.note : moneyExact(line.amount);
        return `<li><span>${line.label}</span><span>${value}</span></li>`;
      })
      .join("");

    els.subtotal.textContent = moneyExact(result.subtotal);
    els.hst.textContent = moneyExact(result.hst);
    els.total.textContent = moneyExact(result.total);

    const summary = [
      "Oui Smoke event estimate (within GTA)",
      "",
      result.tier.label,
      ...result.lines.map(
        (line) => `- ${line.label}: ${line.note || moneyExact(line.amount)}`
      ),
      "",
      `Subtotal: ${moneyExact(result.subtotal)}`,
      `Est. HST (13%): ${moneyExact(result.hst)}`,
      `Estimated total: ${moneyExact(result.total)}`,
      "",
      "I'd love to book / get a final quote.",
    ].join("\n");

    els.email.href = `mailto:contact@ouismoke.co?subject=${encodeURIComponent(
      "Oui Smoke event estimate"
    )}&body=${encodeURIComponent(summary)}`;
  };

  const focusable = () =>
    Array.from(
      dialog.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      )
    ).filter((el) => !el.hasAttribute("disabled") && el.offsetParent !== null);

  const openModal = () => {
    if (open) return;
    open = true;
    lastFocused = document.activeElement;
    modal.hidden = false;
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
    render();

    const preferReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (typeof gsap !== "undefined" && !preferReduced) {
      gsap.fromTo(modal, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.28, ease: "power2.out" });
      gsap.fromTo(
        dialog,
        { autoAlpha: 0, y: 28, scale: 0.97 },
        { autoAlpha: 1, y: 0, scale: 1, duration: 0.45, ease: "power3.out" }
      );
    } else {
      modal.style.opacity = "1";
      dialog.style.opacity = "1";
    }

    window.setTimeout(() => els.hookahs.focus(), 30);
  };

  const closeModal = () => {
    if (!open) return;
    const finish = () => {
      open = false;
      modal.hidden = true;
      modal.setAttribute("aria-hidden", "true");
      document.body.classList.remove("modal-open");
      if (lastFocused && typeof lastFocused.focus === "function") lastFocused.focus();
    };

    const preferReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (typeof gsap !== "undefined" && !preferReduced) {
      gsap.to(dialog, { autoAlpha: 0, y: 16, scale: 0.98, duration: 0.25, ease: "power2.in" });
      gsap.to(modal, {
        autoAlpha: 0,
        duration: 0.25,
        ease: "power2.in",
        onComplete: finish,
      });
    } else {
      finish();
    }
  };

  document.querySelectorAll("[data-open-calculator]").forEach((btn) => {
    btn.addEventListener("click", openModal);
  });

  modal.querySelectorAll("[data-close-calculator]").forEach((el) => {
    el.addEventListener("click", closeModal);
  });

  form.addEventListener("input", render);
  form.addEventListener("change", render);

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

  render();
})();

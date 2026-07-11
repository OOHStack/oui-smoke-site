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
    nudge: document.getElementById("calc-nudge"),
    nudgeText: document.getElementById("calc-nudge-text"),
    nudgeBtn: document.getElementById("calc-nudge-btn"),
    led: document.getElementById("calc-led"),
    water: document.getElementById("calc-water"),
    branding: document.getElementById("calc-branding"),
    brandingRate: document.getElementById("calc-branding-rate"),
    brandingField: document.getElementById("calc-branding-rate-field"),
    brandingHint: document.getElementById("calc-branding-hint"),
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
  const BRANDING_MIN = 4;
  let lastFocused = null;
  let open = false;
  let pendingNudgeTarget = null;

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

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  const tierFor = (count) => {
    if (count <= 4) {
      return {
        id: "starter",
        label: "1 – 4 hookahs · 1 refill included",
        rate: 80,
        unlimited: false,
        nextAt: 5,
      };
    }
    if (count <= 8) {
      return {
        id: "plus",
        label: "5 – 8 hookahs · unlimited refills",
        rate: 75,
        unlimited: true,
        nextAt: 9,
      };
    }
    return {
      id: "max",
      label: "9+ hookahs · unlimited refills",
      rate: 65,
      unlimited: true,
      nextAt: null,
    };
  };

  const nextTierInfo = (hookahs) => {
    const current = tierFor(hookahs);
    if (!current.nextAt) return null;

    const target = current.nextAt;
    const needed = target - hookahs;
    const next = tierFor(target);
    const currentBase = hookahs * current.rate;
    const upgradedBase = target * next.rate;
    const rateDropPerUnit = current.rate - next.rate;
    const savingsOnCurrentUnits = hookahs * rateDropPerUnit;
    const netChange = upgradedBase - currentBase;

    return {
      needed,
      target,
      current,
      next,
      currentBase,
      upgradedBase,
      rateDropPerUnit,
      savingsOnCurrentUnits,
      netChange,
    };
  };

  const readState = () => {
    const hookahs = clamp(Number(els.hookahs.value) || 1, 1, 40);
    const extraHours = clamp(Number(els.hours.value) || 0, 0, 12);
    const extraRefills = clamp(Number(els.refills.value) || 0, 0, 40);
    let ledQty = clamp(Number(els.led.value) || 0, 0, hookahs);
    let waterQty = clamp(Number(els.water.value) || 0, 0, hookahs);
    let brandingQty = clamp(Number(els.branding.value) || 0, 0, Math.max(hookahs, BRANDING_MIN));
    const brandingRate = Number(els.brandingRate.value) || 12;

    // Enforce branding minimum when any branding is selected
    let brandingAdjusted = false;
    if (brandingQty > 0 && brandingQty < BRANDING_MIN) {
      brandingQty = BRANDING_MIN;
      brandingAdjusted = true;
    }
    if (brandingQty > hookahs && hookahs >= BRANDING_MIN) {
      brandingQty = hookahs;
    }

    return {
      hookahs,
      extraHours,
      extraRefills,
      ledQty,
      waterQty,
      brandingQty,
      brandingRate,
      brandingAdjusted,
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
      lines.push({
        label: `${state.extraRefills} extra refill${state.extraRefills === 1 ? "" : "s"} × $25`,
        amount: state.extraRefills * 25,
      });
    }

    if (state.extraHours > 0) {
      lines.push({
        label: `${state.extraHours} extra hour${state.extraHours === 1 ? "" : "s"} × $120`,
        amount: state.extraHours * 120,
      });
    }

    if (state.ledQty > 0) {
      lines.push({
        label: `LED base × ${state.ledQty}`,
        amount: state.ledQty * 10,
      });
    }

    if (state.waterQty > 0) {
      lines.push({
        label: `Water enhancers × ${state.waterQty}`,
        amount: state.waterQty * 5,
      });
    }

    if (state.brandingQty > 0) {
      const charged = Math.max(BRANDING_MIN, state.brandingQty);
      lines.push({
        label: `Unit branding × ${charged} @ ${moneyExact(state.brandingRate).replace(".00", "")}`,
        amount: charged * state.brandingRate,
      });
    }

    if (state.blends && state.hookahs >= 5) {
      lines.push({
        label: "Custom flavour blends",
        amount: 0,
        note: "Quoted separately",
      });
    }

    const subtotal = lines.reduce((sum, line) => sum + line.amount, 0);
    const hst = subtotal * HST;
    return { tier, lines, subtotal, hst, total: subtotal + hst };
  };

  const renderNudge = (hookahs) => {
    const info = nextTierInfo(hookahs);
    if (!info) {
      els.nudge.hidden = true;
      pendingNudgeTarget = null;
      return;
    }

    pendingNudgeTarget = info.target;
    const unitWord = info.needed === 1 ? "hookah" : "hookahs";
    const refillBonus =
      info.current.id === "starter"
        ? " and unlimited refills"
        : "";

    els.nudgeText.innerHTML = `
      Add <strong>${info.needed}</strong> more ${unitWord} to unlock
      <strong>${money(info.next.rate)}/hookah</strong>${refillBonus}.
      Your current units would drop by <strong>${money(info.rateDropPerUnit)}</strong> each
      (about <strong>${moneyExact(info.savingsOnCurrentUnits)}</strong> in rate savings).
    `.trim();

    els.nudgeBtn.textContent =
      info.needed === 1
        ? `Upgrade to ${info.target} hookahs`
        : `Add ${info.needed} → ${info.target} hookahs`;

    els.nudge.hidden = false;
  };

  const render = () => {
    const state = readState();
    const result = calculate(state);

    els.hookahs.value = String(state.hookahs);
    els.hours.value = String(state.extraHours);
    els.refills.value = String(state.extraRefills);
    els.led.value = String(state.ledQty);
    els.water.value = String(state.waterQty);
    els.branding.value = String(state.brandingQty);

    els.led.max = String(state.hookahs);
    els.water.max = String(state.hookahs);
    els.branding.max = String(Math.max(state.hookahs, BRANDING_MIN));

    els.tier.textContent = result.tier.label;
    els.refillsField.hidden = result.tier.unlimited;
    els.brandingField.hidden = state.brandingQty <= 0;
    els.brandingHint.hidden = !state.brandingAdjusted;

    const blendsAvailable = state.hookahs >= 5;
    els.blends.disabled = !blendsAvailable;
    if (!blendsAvailable) els.blends.checked = false;
    els.blendsHint.hidden = blendsAvailable;
    els.blendsWrap.classList.toggle("is-disabled", !blendsAvailable);

    renderNudge(state.hookahs);

    els.breakdown.innerHTML = result.lines
      .map((line) => {
        const value = line.note ? line.note : moneyExact(line.amount);
        return `<li><span>${line.label}</span><span>${value}</span></li>`;
      })
      .join("");

    els.subtotal.textContent = moneyExact(result.subtotal);
    els.hst.textContent = moneyExact(result.hst);
    els.total.textContent = moneyExact(result.total);

    const nudge = nextTierInfo(state.hookahs);
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
      nudge
        ? `\nNote: Adding ${nudge.needed} more hookah(s) unlocks ${money(nudge.next.rate)}/hookah.`
        : "",
      "",
      "I'd love to book / get a final quote.",
    ]
      .filter(Boolean)
      .join("\n");

    els.email.href = `mailto:contact@ouismoke.co?subject=${encodeURIComponent(
      "Oui Smoke event estimate"
    )}&body=${encodeURIComponent(summary)}`;
  };

  const focusable = () =>
    Array.from(
      dialog.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      )
    ).filter((el) => !el.hasAttribute("disabled") && !el.hidden && el.offsetParent !== null);

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

  els.nudgeBtn.addEventListener("click", () => {
    if (!pendingNudgeTarget) return;
    els.hookahs.value = String(pendingNudgeTarget);
    render();
    els.hookahs.focus();
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

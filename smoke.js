(() => {
  const canvas = document.querySelector(".summer__smoke");
  const section = document.querySelector(".summer");
  if (!canvas || !section || typeof gsap === "undefined" || typeof ScrollTrigger === "undefined") return;

  gsap.registerPlugin(ScrollTrigger);

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduceMotion) {
    canvas.style.display = "none";
    return;
  }

  const ctx = canvas.getContext("2d", { alpha: true });
  if (!ctx) return;

  // Soft volumetric puff sprite
  const sprite = document.createElement("canvas");
  const spriteSize = 128;
  sprite.width = spriteSize;
  sprite.height = spriteSize;
  const sctx = sprite.getContext("2d");
  const gradient = sctx.createRadialGradient(
    spriteSize / 2,
    spriteSize / 2,
    0,
    spriteSize / 2,
    spriteSize / 2,
    spriteSize / 2
  );
  gradient.addColorStop(0, "rgba(255, 252, 248, 0.55)");
  gradient.addColorStop(0.25, "rgba(245, 240, 235, 0.28)");
  gradient.addColorStop(0.55, "rgba(230, 220, 210, 0.12)");
  gradient.addColorStop(1, "rgba(230, 220, 210, 0)");
  sctx.fillStyle = gradient;
  sctx.beginPath();
  sctx.arc(spriteSize / 2, spriteSize / 2, spriteSize / 2, 0, Math.PI * 2);
  sctx.fill();

  let width = 0;
  let height = 0;
  let dpr = 1;
  let particles = [];
  let running = false;
  let raf = 0;
  let last = 0;
  let emitAcc = 0;

  const resize = () => {
    const rect = section.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = Math.max(1, Math.floor(rect.width));
    height = Math.max(1, Math.floor(rect.height));
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  const spawn = () => {
    const fromLeft = Math.random() > 0.55;
    particles.push({
      x: fromLeft ? width * (0.05 + Math.random() * 0.35) : width * (0.55 + Math.random() * 0.4),
      y: height * (0.72 + Math.random() * 0.28),
      vx: (Math.random() - 0.5) * 12,
      vy: -(18 + Math.random() * 28),
      size: 70 + Math.random() * 140,
      growth: 18 + Math.random() * 28,
      life: 0,
      maxLife: 4.5 + Math.random() * 3.5,
      spin: (Math.random() - 0.5) * 0.25,
      angle: Math.random() * Math.PI * 2,
      turbulence: 0.6 + Math.random() * 1.1,
      alpha: 0.18 + Math.random() * 0.28,
    });
  };

  const frame = (time) => {
    if (!running) return;
    const now = time || performance.now();
    const dt = Math.min(0.033, (now - last) / 1000 || 0.016);
    last = now;

    emitAcc += dt;
    while (emitAcc > 0.09) {
      emitAcc -= 0.09;
      if (particles.length < 48) spawn();
    }

    ctx.clearRect(0, 0, width, height);
    ctx.globalCompositeOperation = "lighter";

    for (let i = particles.length - 1; i >= 0; i -= 1) {
      const p = particles[i];
      p.life += dt;
      const t = p.life / p.maxLife;
      if (t >= 1) {
        particles.splice(i, 1);
        continue;
      }

      const curl = Math.sin(p.life * p.turbulence + p.angle) * 18;
      p.x += (p.vx + curl) * dt;
      p.y += p.vy * dt;
      p.vy *= 0.995;
      p.vx *= 0.99;
      p.angle += p.spin * dt;
      p.size += p.growth * dt;

      // Fade in, hold, fade out — more smoke-like than linear
      let a = p.alpha;
      if (t < 0.15) a *= t / 0.15;
      else if (t > 0.55) a *= 1 - (t - 0.55) / 0.45;

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle);
      ctx.globalAlpha = Math.max(0, a);
      ctx.drawImage(sprite, -p.size / 2, -p.size / 2, p.size, p.size);
      ctx.restore();
    }

    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    raf = requestAnimationFrame(frame);
  };

  const start = () => {
    if (running) return;
    running = true;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  };

  const stop = () => {
    running = false;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  };

  resize();
  for (let i = 0; i < 18; i += 1) spawn();

  ScrollTrigger.create({
    trigger: section,
    start: "top bottom",
    end: "bottom top",
    onEnter: start,
    onEnterBack: start,
    onLeave: stop,
    onLeaveBack: stop,
  });

  window.addEventListener("resize", () => {
    resize();
  });
})();

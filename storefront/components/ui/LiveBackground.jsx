"use client";

import { useEffect, useRef } from "react";

const SPACING = 28;
const RADIUS = 140;

/**
 * Page backdrop: slow brand-colour glows (CSS) plus a faint dot grid on a
 * canvas that bulges around the cursor. Only the backdrop moves. rAF runs
 * only while something is animating; touch devices and reduced-motion users
 * get the glows / a static grid. Also feeds --mx/--my to `.pg-card` hovers.
 */
export default function LiveBackground() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)");
    const root = document.documentElement;
    let w = 0, h = 0, dpr = 1, raf = 0, resizeT = 0;
    let mx = -9999, my = -9999, strength = 0, target = 0, last = 0, lastMove = 0;
    let dark = root.classList.contains("dark");

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = w + "px";
      canvas.style.height = h + "px";
      draw(performance.now());
    };

    const draw = (t) => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const animate = false;
      const rgb = dark ? "170,195,255" : "42,80,200";
      const base = dark ? 0.24 : 0.2;
      const cols = Math.ceil(w / SPACING) + 1;
      const rows = Math.ceil(h / SPACING) + 1;
      // Far dots: 4 twinkle alpha buckets, one path each (cheap). Near dots: individual arcs.
      const BUCKETS = 4;
      const paths = Array.from({ length: BUCKETS }, () => new Path2D());
      const near = [];
      const lim = RADIUS * RADIUS;
      const lens = strength > 0.001;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const gx = c * SPACING;
          const gy = r * SPACING;
          if (lens) {
            const dx = gx - mx, dy = gy - my;
            if (dx * dx + dy * dy < lim) { near.push(gx, gy); continue; }
          }
          const tw = animate ? 0.5 + 0.5 * Math.sin(t / 1500 + c * 0.7 + r * 1.3) : 0.5;
          paths[Math.min(BUCKETS - 1, Math.floor(tw * BUCKETS))].rect(gx - 1, gy - 1, 2, 2);
        }
      }
      for (let k = 0; k < BUCKETS; k++) {
        const a = base * (0.75 + 0.25 * ((k + 0.5) / BUCKETS));
        ctx.fillStyle = `rgba(${rgb},${a.toFixed(3)})`;
        ctx.fill(paths[k]);
      }
      for (let n = 0; n < near.length; n += 2) {
        const gx = near[n], gy = near[n + 1];
        const dx = gx - mx, dy = gy - my;
        const d = Math.sqrt(dx * dx + dy * dy) || 1;
        const k = (1 - d / RADIUS) * strength;
        const push = k * k * 14 + k * 6;
        const a = Math.min(0.9, base + k * (dark ? 0.7 : 0.55));
        ctx.fillStyle = `rgba(${rgb},${a.toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(gx + (dx / d) * push, gy + (dy / d) * push, 1 + k * 2.6, 0, 6.2832);
        ctx.fill();
      }
    };

    const frame = (t) => {
      raf = 0;
      if (document.hidden) return;
      const dt = Math.min(64, t - (last || t));
      last = t;
      strength += (target - strength) * Math.min(1, dt / 120);
      if (Math.abs(target - strength) < 0.003) strength = target;
      const moving = strength !== target || (target > 0 && t - lastMove < 300);
      draw(t);
      // Only keep ticking while the cursor lens is active or easing back; idle = no work.
      if (moving && !reduce.matches && fine.matches) raf = requestAnimationFrame(frame);
    };
    const kick = () => { if (!raf && !document.hidden) { last = 0; raf = requestAnimationFrame(frame); } };

    const onMove = (e) => {
      if (e.pointerType && e.pointerType !== "mouse" && e.pointerType !== "pen") return;
      // card spotlight
      const card = e.target.closest?.(".pg-card");
      if (card) {
        const b = card.getBoundingClientRect();
        card.style.setProperty("--mx", `${e.clientX - b.left}px`);
        card.style.setProperty("--my", `${e.clientY - b.top}px`);
      }
      if (reduce.matches || !fine.matches) return;
      mx = e.clientX; my = e.clientY; target = 1; lastMove = performance.now();
      kick();
    };
    const onLeave = () => { target = 0; kick(); };
    const onVis = () => { if (!document.hidden) kick(); };
    const onResize = () => { clearTimeout(resizeT); resizeT = setTimeout(resize, 150); };
    const mo = new MutationObserver(() => { dark = root.classList.contains("dark"); draw(performance.now()); });
    mo.observe(root, { attributes: true, attributeFilter: ["class"] });

    resize();
    window.addEventListener("pointermove", onMove, { passive: true });
    document.documentElement.addEventListener("mouseleave", onLeave);
    window.addEventListener("blur", onLeave);
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("resize", onResize);
    reduce.addEventListener?.("change", () => { draw(performance.now()); kick(); });
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(resizeT);
      mo.disconnect();
      window.removeEventListener("pointermove", onMove);
      document.documentElement.removeEventListener("mouseleave", onLeave);
      window.removeEventListener("blur", onLeave);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="pg-glow pg-glow-a" />
      <div className="pg-glow pg-glow-b" />
      <div className="pg-glow pg-glow-c" />
      <canvas ref={canvasRef} className="absolute inset-0" />
    </div>
  );
}

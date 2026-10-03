"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import { buttonClass } from "@/components/ui/Button";
import Img from "@/components/ui/Img";
import { SITE } from "@/lib/site";
import CatMascot from "@/components/ui/CatMascot";

// Slides come from the admin-curated GET /banners?placement=hero (see
// lib/banners.js); with none, a single brand slide is shown, never made-up
// products or prices.
const BRAND_SLIDE = {
  id: "brand",
  kind: "brand",
  badge: SITE.name,
  title: "New & used laptops in Chattogram",
  subtitle: `Tested, graded used laptops and brand-new machines · GEC & WASA branches · Call/WhatsApp ${SITE.phoneDisplay}`,
  image: "https://images.unsplash.com/photo-1496181133206-80ce9b88a853?auto=format&fit=crop&q=80&w=1400&h=900",
  mobileImage: null,
  href: "/products",
  external: false,
  ctaLabel: "Shop now",
  price: null,
  compareAt: null,
};

// Fixed locale so server render and hydration agree.
const taka = (n) => `৳${Math.round(n).toLocaleString("en-IN")}`;

function SlideLink({ slide, className, children }) {
  return slide.external ? (
    <a href={slide.href} rel="noopener noreferrer" className={className}>{children}</a>
  ) : (
    <Link href={slide.href} className={className}>{children}</Link>
  );
}

/** @param {{ slides?: object[] }} props */
export default function HeroSlider({ slides: input = [] }) {
  const slides = input.length ? input : [BRAND_SLIDE];
  const count = slides.length;
  const [current, setCurrent] = useState(0);
  // Bumped on every shopper action (swipe, arrow, dot) so the auto-advance
  // timer restarts instead of jumping right after they chose a slide.
  const [interacted, setInteracted] = useState(0);
  const root = useRef(null);
  const hold = useRef({ focus: false, visible: true });

  const next = useCallback(() => setCurrent((c) => (c + 1) % count), [count]);
  const prev = useCallback(() => setCurrent((c) => (c - 1 + count) % count), [count]);
  const byUser = (fn) => (...args) => { setInteracted((n) => n + 1); fn(...args); };

  // Swipe on touch screens: a mostly-horizontal swipe of 50px+ changes slide.
  const touch = useRef(null);
  const onTouchStart = (e) => { const t = e.touches[0]; touch.current = { x: t.clientX, y: t.clientY }; };
  const onTouchEnd = (e) => {
    const start = touch.current;
    touch.current = null;
    if (!start || count < 2) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(t.clientY - start.y) * 1.5) byUser(dx < 0 ? next : prev)();
  };

  // Auto-advance every 5s (long enough to read the headline and price). No
  // pause on hover; it holds only for keyboard focus inside, while offscreen,
  // in a hidden tab, and for visitors with "reduce motion" on.
  useEffect(() => {
    if (count < 2) return undefined;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;
    const t = setInterval(() => {
      const h = hold.current;
      if (!h.focus && h.visible && !document.hidden) next();
    }, 5000);
    return () => clearInterval(t);
  }, [next, count, interacted]);

  useEffect(() => {
    const el = root.current;
    if (!el) return undefined;
    const io = new IntersectionObserver(([e]) => { hold.current.visible = e.isIntersecting; }, { threshold: 0.3 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Featured offers"
      className="pg-hero relative text-navy-foreground"
      ref={root}
      onFocus={(e) => { if (e.target.matches?.(":focus-visible")) hold.current.focus = true; }}
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) hold.current.focus = false; }}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <div className="container pb-14 pt-6 sm:pb-20 sm:pt-10 lg:pb-24">
        {/* The page's one <h1>: static, so it never changes with the slides. */}
        <h1 className="mb-4 text-xs font-bold uppercase tracking-[0.14em] text-white/70 sm:text-sm">
          New &amp; Used Laptops in Chattogram, Bangladesh
        </h1>

        <div className="grid">
          {slides.map((s, i) => {
            const active = i === current;
            return (
              <div
                key={s.id}
                role="group"
                aria-roledescription="slide"
                aria-label={`${i + 1} of ${count}`}
                inert={!active}
                className={`col-start-1 row-start-1 grid items-center gap-6 transition-opacity duration-500 lg:grid-cols-[1.05fr_1fr] lg:gap-12 ${active ? "opacity-100" : "pointer-events-none opacity-0"}`}
              >
                <div className="order-2 flex min-w-0 flex-col gap-4 lg:order-1">
                  {s.badge && (
                    <span className="self-start rounded-full bg-coral/20 px-3 py-1.5 text-xs font-bold tracking-wide text-[#F7A399] sm:text-[13px]">
                      {s.badge}
                    </span>
                  )}
                  {s.title && <h2 className="text-display text-balance">{s.title}</h2>}
                  {s.subtitle && <p className="max-w-xl text-base leading-relaxed text-[#C9D3F5] sm:text-lg">{s.subtitle}</p>}
                  {s.price !== null && s.price !== undefined && (
                    <p className="flex items-baseline gap-3">
                      <span className="font-display text-3xl font-extrabold sm:text-[40px]">{taka(s.price)}</span>
                      {s.compareAt && <span className="text-lg text-[#9FAEDD] line-through">{taka(s.compareAt)}</span>}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-3 pt-1">
                    <SlideLink slide={s} className={buttonClass({ variant: "coral", size: "lg", className: "h-[52px] px-8 font-extrabold" })}>
                      {s.ctaLabel} <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </SlideLink>
                    <Link href="/products?condition=used" className={buttonClass({ variant: "ghost", size: "lg", className: "h-[52px] border-[1.5px] border-white/55 px-7 text-white hover:bg-white/10" })}>
                      Used laptops
                    </Link>
                  </div>
                </div>

                <div className="relative order-1 lg:order-2">
                  <div className="relative aspect-[16/10] overflow-hidden rounded-3xl bg-white/10 sm:rounded-[28px] lg:aspect-[4/3]">
                    {s.image && (
                      <picture>
                        {s.mobileImage && <source media="(max-width: 767px)" srcSet={s.mobileImage} />}
                        <Img src={s.image} alt="" fill sizes="(min-width: 1024px) 560px, 92vw" priority={i === 0} className="object-cover" />
                      </picture>
                    )}
                  </div>
                  <a
                    href={SITE.whatsappUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="absolute -bottom-7 left-3 hidden max-w-[300px] items-center gap-3 rounded-[20px] bg-white/85 p-3 pr-4 text-[#12205A] shadow-float md:backdrop-blur-md sm:flex lg:-left-3"
                  >
                    <CatMascot size={64} />
                    <span className="text-sm leading-snug"><strong>Not sure which laptop?</strong><br />Chat with us on WhatsApp</span>
                  </a>
                </div>
              </div>
            );
          })}
        </div>

        {count > 1 && (
          // Arrows sit next to the dots: the floating WhatsApp button owns the
          // bottom-right corner of the screen and would cover them there.
          <div className="mt-8 flex items-center gap-6 sm:mt-12">
            <div className="flex gap-2" role="group" aria-label="Choose slide">
              {slides.map((s, i) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={byUser(() => setCurrent(i))}
                  aria-label={`Go to slide ${i + 1}`}
                  aria-current={i === current}
                  className={`h-2.5 rounded-full transition-all ${i === current ? "w-9 bg-coral" : "w-2.5 bg-white/40 hover:bg-white/70"}`}
                />
              ))}
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={byUser(prev)} aria-label="Previous slide" className="flex h-10 w-10 items-center justify-center rounded-full border border-white/30 hover:bg-white/10"><ChevronLeft className="h-5 w-5" /></button>
              <button type="button" onClick={byUser(next)} aria-label="Next slide" className="flex h-10 w-10 items-center justify-center rounded-full border border-white/30 hover:bg-white/10"><ChevronRight className="h-5 w-5" /></button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

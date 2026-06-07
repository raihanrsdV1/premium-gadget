"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/Button";

// Ported from the HeroSlider in frontend/src/pages/Home.jsx.
const SLIDES = [
  {
    id: 1,
    tag: "✨ New Arrival",
    title: "MacBook Pro M3 Max",
    subtitle: "Up to 40-core GPU · 128GB unified memory",
    price: "৳4,50,000",
    cta: "/products",
    bg: "from-slate-900 to-blue-950",
    image: "https://images.unsplash.com/photo-1496181133206-80ce9b88a853?auto=format&fit=crop&q=80&w=1400&h=900",
  },
  {
    id: 2,
    tag: "🔥 Best Seller",
    title: "Dell XPS 15 OLED",
    subtitle: "Studio-grade display · Intel Core Ultra 9",
    price: "৳1,85,000",
    cta: "/products",
    bg: "from-gray-900 to-indigo-950",
    image: "https://images.unsplash.com/photo-1593642632823-8f785ba67e45?auto=format&fit=crop&q=80&w=1400&h=900",
  },
  {
    id: 3,
    tag: "🎧 Premium Audio",
    title: "Sony WH-1000XM5",
    subtitle: "Industry-leading noise cancellation · 30hr battery",
    price: "৳35,000",
    cta: "/products?category=accessories",
    bg: "from-zinc-900 to-purple-950",
    image: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&q=80&w=1400&h=900",
  },
  {
    id: 4,
    tag: "🛠️ Expert Repairs",
    title: "Fast. Reliable. Guaranteed.",
    subtitle: "Screen replacement · Battery service · Diagnostics",
    price: "From ৳1,500",
    cta: "/repairs",
    bg: "from-stone-900 to-orange-950",
    image: "https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&q=80&w=1400&h=900",
  },
];

export default function HeroSlider() {
  const [current, setCurrent] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);

  const goTo = useCallback(
    (index) => {
      if (isAnimating) return;
      setIsAnimating(true);
      setCurrent(index);
      setTimeout(() => setIsAnimating(false), 600);
    },
    [isAnimating]
  );

  const next = useCallback(() => goTo((current + 1) % SLIDES.length), [current, goTo]);
  const prev = useCallback(() => goTo((current - 1 + SLIDES.length) % SLIDES.length), [current, goTo]);

  useEffect(() => {
    const timer = setInterval(next, 5000);
    return () => clearInterval(timer);
  }, [next]);

  const slide = SLIDES[current];

  return (
    <section className="relative overflow-hidden h-[560px] md:h-[640px] lg:h-[700px]">
      {SLIDES.map((s, i) => (
        <div
          key={s.id}
          className="absolute inset-0 transition-opacity duration-700"
          style={{ opacity: i === current ? 1 : 0 }}
        >
          <img
            src={s.image}
            alt={s.title}
            className="w-full h-full object-cover"
            loading={i === 0 ? "eager" : "lazy"}
          />
          <div className={`absolute inset-0 bg-gradient-to-r ${s.bg} opacity-75`} />
        </div>
      ))}

      <div className="relative z-10 h-full flex items-center">
        <div className="container px-4 md:px-8">
          <div key={current} className="max-w-2xl text-white" style={{ animation: "slideUp 0.6s ease forwards" }}>
            <span className="inline-block text-sm font-semibold bg-white/20 backdrop-blur-sm rounded-full px-3 py-1 mb-4">
              {slide.tag}
            </span>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold tracking-tight mb-4 leading-tight">
              {slide.title}
            </h1>
            <p className="text-lg md:text-xl text-white/80 mb-3">{slide.subtitle}</p>
            <p className="text-2xl font-bold text-white mb-8">{slide.price}</p>
            <div className="flex flex-wrap gap-3">
              <Link href={slide.cta}>
                <Button size="lg" className="bg-white text-gray-900 hover:bg-white/90 font-bold">
                  Shop Now <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
              <Link href="/repairs">
                <Button size="lg" variant="outline" className="border-white text-white hover:bg-white/10">
                  Book a Repair
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>

      <button
        onClick={prev}
        className="absolute left-4 top-1/2 -translate-y-1/2 z-20 p-2 rounded-full bg-black/30 hover:bg-black/50 text-white backdrop-blur-sm transition-colors"
        aria-label="Previous slide"
      >
        <ChevronLeft className="h-6 w-6" />
      </button>
      <button
        onClick={next}
        className="absolute right-4 top-1/2 -translate-y-1/2 z-20 p-2 rounded-full bg-black/30 hover:bg-black/50 text-white backdrop-blur-sm transition-colors"
        aria-label="Next slide"
      >
        <ChevronRight className="h-6 w-6" />
      </button>

      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 flex gap-2">
        {SLIDES.map((_, i) => (
          <button
            key={i}
            onClick={() => goTo(i)}
            aria-label={`Go to slide ${i + 1}`}
            className={`transition-all duration-300 rounded-full ${
              i === current ? "w-8 h-2 bg-white" : "w-2 h-2 bg-white/50 hover:bg-white/80"
            }`}
          />
        ))}
      </div>

      <div className="absolute top-6 right-6 z-20 text-white/70 text-sm font-mono select-none">
        {String(current + 1).padStart(2, "0")} / {String(SLIDES.length).padStart(2, "0")}
      </div>

      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(24px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </section>
  );
}

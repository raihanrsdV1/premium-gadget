import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Laptop, Headphones, PenTool, ShieldCheck, Zap, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Card, CardContent } from '../components/ui/Card';
import { useGetFeaturedProductsQuery } from '../store/api/productApi';

const SLIDES = [
  {
    id: 1,
    tag: '✨ New Arrival',
    title: 'MacBook Pro M3 Max',
    subtitle: 'Up to 40-core GPU · 128GB unified memory',
    price: '৳4,50,000',
    cta: '/products',
    bg: 'from-slate-900 to-blue-950',
    image: 'https://images.unsplash.com/photo-1496181133206-80ce9b88a853?auto=format&fit=crop&q=80&w=1400&h=900',
  },
  {
    id: 2,
    tag: '🔥 Best Seller',
    title: 'Dell XPS 15 OLED',
    subtitle: 'Studio-grade display · Intel Core Ultra 9',
    price: '৳1,85,000',
    cta: '/products',
    bg: 'from-gray-900 to-indigo-950',
    image: 'https://images.unsplash.com/photo-1593642632823-8f785ba67e45?auto=format&fit=crop&q=80&w=1400&h=900',
  },
  {
    id: 3,
    tag: '🎧 Premium Audio',
    title: 'Sony WH-1000XM5',
    subtitle: 'Industry-leading noise cancellation · 30hr battery',
    price: '৳35,000',
    cta: '/products?category=accessories',
    bg: 'from-zinc-900 to-purple-950',
    image: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&q=80&w=1400&h=900',
  },
  {
    id: 4,
    tag: '🛠️ Expert Repairs',
    title: 'Fast. Reliable. Guaranteed.',
    subtitle: 'Screen replacement · Battery service · Diagnostics',
    price: 'From ৳1,500',
    cta: '/repairs',
    bg: 'from-stone-900 to-orange-950',
    image: 'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&q=80&w=1400&h=900',
  },
];

const FALLBACK_IMAGE = 'https://images.unsplash.com/photo-1496181133206-80ce9b88a853?auto=format&fit=crop&q=80&w=600&h=600';

const HeroSlider = () => {
  const [current, setCurrent] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);

  const goTo = useCallback((index) => {
    if (isAnimating) return;
    setIsAnimating(true);
    setCurrent(index);
    setTimeout(() => setIsAnimating(false), 600);
  }, [isAnimating]);

  const next = useCallback(() => goTo((current + 1) % SLIDES.length), [current, goTo]);
  const prev = useCallback(() => goTo((current - 1 + SLIDES.length) % SLIDES.length), [current, goTo]);

  useEffect(() => {
    const timer = setInterval(next, 5000);
    return () => clearInterval(timer);
  }, [next]);

  const slide = SLIDES[current];

  return (
    <section className="relative overflow-hidden h-[560px] md:h-[640px] lg:h-[700px]">
      {/* Background images — all stacked, only current is visible */}
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
            loading={i === 0 ? 'eager' : 'lazy'}
          />
          <div className={`absolute inset-0 bg-gradient-to-r ${s.bg} opacity-75`} />
        </div>
      ))}

      {/* Content */}
      <div className="relative z-10 h-full flex items-center">
        <div className="container px-4 md:px-8">
          <div
            key={current}
            className="max-w-2xl text-white"
            style={{ animation: 'slideUp 0.6s ease forwards' }}
          >
            <span className="inline-block text-sm font-semibold bg-white/20 backdrop-blur-sm rounded-full px-3 py-1 mb-4">
              {slide.tag}
            </span>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold tracking-tight mb-4 leading-tight">
              {slide.title}
            </h1>
            <p className="text-lg md:text-xl text-white/80 mb-3">{slide.subtitle}</p>
            <p className="text-2xl font-bold text-white mb-8">{slide.price}</p>
            <div className="flex flex-wrap gap-3">
              <Link to={slide.cta}>
                <Button size="lg" className="bg-white text-gray-900 hover:bg-white/90 font-bold">
                  Shop Now <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
              <Link to="/repairs">
                <Button size="lg" variant="outline" className="border-white text-white hover:bg-white/10">
                  Book a Repair
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Prev / Next arrows */}
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

      {/* Dot indicators */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 flex gap-2">
        {SLIDES.map((_, i) => (
          <button
            key={i}
            onClick={() => goTo(i)}
            aria-label={`Go to slide ${i + 1}`}
            className={`transition-all duration-300 rounded-full ${
              i === current ? 'w-8 h-2 bg-white' : 'w-2 h-2 bg-white/50 hover:bg-white/80'
            }`}
          />
        ))}
      </div>

      {/* Slide counter */}
      <div className="absolute top-6 right-6 z-20 text-white/70 text-sm font-mono select-none">
        {String(current + 1).padStart(2, '0')} / {String(SLIDES.length).padStart(2, '0')}
      </div>

      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(24px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </section>
  );
};

const Home = () => {
  const navigate = useNavigate();
  const { data: featuredData } = useGetFeaturedProductsQuery();
  const featuredProducts = featuredData?.data || [];
  return (
  <div className="flex flex-col min-h-screen">

    <HeroSlider />

    {/* Feature Highlights */}
    <section className="py-16 bg-secondary/30">
      <div className="container px-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="flex flex-col items-center sm:items-start p-6 bg-background rounded-2xl shadow-sm border border-border/50 hover:shadow-md transition-all">
            <div className="p-3 bg-primary/10 rounded-xl text-primary mb-4">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <h3 className="text-xl font-bold mb-2">Certified Authentic</h3>
            <p className="text-muted-foreground text-sm leading-relaxed text-center sm:text-left">Every device is verified for authenticity and undergoes rigorous quality testing before reaching you.</p>
          </div>
          <div className="flex flex-col items-center sm:items-start p-6 bg-background rounded-2xl shadow-sm border border-border/50 hover:shadow-md transition-all">
            <div className="p-3 bg-blue-500/10 rounded-xl text-blue-600 mb-4">
              <PenTool className="h-6 w-6" />
            </div>
            <h3 className="text-xl font-bold mb-2">Expert Repairs</h3>
            <p className="text-muted-foreground text-sm leading-relaxed text-center sm:text-left">From screen replacements to board-level micro-soldering, our technicians handle it all.</p>
          </div>
          <div className="flex flex-col items-center sm:items-start p-6 bg-background rounded-2xl shadow-sm border border-border/50 hover:shadow-md transition-all">
            <div className="p-3 bg-orange-500/10 rounded-xl text-orange-600 mb-4">
              <Zap className="h-6 w-6" />
            </div>
            <h3 className="text-xl font-bold mb-2">Fast Delivery</h3>
            <p className="text-muted-foreground text-sm leading-relaxed text-center sm:text-left">Enjoy express delivery within Dhaka and reliable courier services across Bangladesh.</p>
          </div>
        </div>
      </div>
    </section>

    {/* Categories */}
    <section className="py-20">
      <div className="container px-4">
        <div className="flex items-center justify-between mb-10">
          <h2 className="text-3xl font-bold tracking-tight">Shop by Category</h2>
          <Link to="/products" className="hidden sm:inline-flex items-center text-primary font-medium hover:underline">
            View All <ArrowRight className="ml-1 h-4 w-4" />
          </Link>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
          <Link to="/products?category=laptops" className="group relative rounded-2xl overflow-hidden aspect-square border bg-secondary/20 flex flex-col items-center justify-center transition-all hover:border-primary/50 hover:bg-secondary">
            <Laptop className="h-12 w-12 text-primary mb-4 transition-transform group-hover:scale-110" />
            <span className="font-semibold text-lg">Laptops</span>
          </Link>
          <Link to="/products?category=accessories" className="group relative rounded-2xl overflow-hidden aspect-square border bg-secondary/20 flex flex-col items-center justify-center transition-all hover:border-primary/50 hover:bg-secondary">
            <Headphones className="h-12 w-12 text-primary mb-4 transition-transform group-hover:scale-110" />
            <span className="font-semibold text-lg">Accessories</span>
          </Link>
          <Link to="/products?condition=used" className="group relative rounded-2xl overflow-hidden aspect-square border bg-secondary/20 flex flex-col items-center justify-center transition-all hover:border-primary/50 hover:bg-secondary">
            <div className="relative">
              <Laptop className="h-12 w-12 text-primary mb-4 transition-transform group-hover:scale-110" />
              <span className="absolute -top-2 -right-2 flex h-5 w-5 items-center justify-center rounded-full bg-green-500 text-[10px] font-bold text-white">✓</span>
            </div>
            <span className="font-semibold text-lg">Pre-Owned</span>
          </Link>
          <Link to="/repairs" className="group relative rounded-2xl overflow-hidden aspect-square border bg-secondary/20 flex flex-col items-center justify-center transition-all hover:border-primary/50 hover:bg-secondary">
            <PenTool className="h-12 w-12 text-primary mb-4 transition-transform group-hover:scale-110" />
            <span className="font-semibold text-lg">Repairs</span>
          </Link>
        </div>
      </div>
    </section>

    {/* Featured Products */}
    <section className="py-20 bg-secondary/20">
      <div className="container px-4">
        <div className="mb-10">
          <h2 className="text-3xl font-bold tracking-tight text-center md:text-left">Featured Products</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {featuredProducts.map(product => (
            <Card
              key={product.id}
              onClick={() => navigate(`/products/${product.slug}`)}
              className="group overflow-hidden border-border/50 hover:border-primary/30 transition-all hover:shadow-lg flex flex-col cursor-pointer"
            >
              <div className="relative aspect-square overflow-hidden bg-white p-4">
                {(product.condition === 'used' || product.condition === 'Pre-Owned') && (
                  <span className="absolute top-2 left-2 z-10 rounded-full bg-orange-100 text-orange-700 px-2 py-0.5 text-xs font-semibold">
                    Pre-Owned
                  </span>
                )}
                <img
                  src={product.image || FALLBACK_IMAGE}
                  alt={product.name}
                  onError={e => { e.target.src = FALLBACK_IMAGE; }}
                  className="object-contain w-full h-full transition-transform duration-500 group-hover:scale-105"
                />
              </div>
              <CardContent className="p-5 flex-1 flex flex-col pt-4">
                <h3 className="font-semibold line-clamp-2 mb-2 group-hover:text-primary transition-colors">{product.name}</h3>
                <div className="mt-auto pt-4">
                  <span className="text-lg font-bold text-foreground">৳{Number(product.price).toLocaleString()}</span>
                  {product.compare_at_price && (
                    <span className="ml-2 text-sm text-muted-foreground line-through">
                      ৳{Number(product.compare_at_price).toLocaleString()}
                    </span>
                  )}
                </div>
              </CardContent>
              <div className="px-5 pb-5">
                <Button className="w-full" variant="secondary" onClick={e => e.stopPropagation()}>Add to Cart</Button>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </section>

    {/* Newsletter */}
    <section className="py-24">
      <div className="container px-4">
        <div className="max-w-2xl mx-auto text-center p-8 md:p-12 bg-primary text-primary-foreground rounded-3xl shadow-xl">
          <h2 className="text-3xl font-bold mb-4">Stay Updated</h2>
          <p className="opacity-90 mb-8">Subscribe for exclusive deals, early access to new stock, and tech tips.</p>
          <form className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto">
            <input
              type="email"
              placeholder="Enter your email address"
              className="flex h-12 w-full rounded-md border-transparent bg-primary-foreground/10 px-4 py-2 text-sm text-primary-foreground placeholder:text-primary-foreground/70 focus:outline-none focus:ring-2 focus:ring-primary-foreground/50 transition-colors"
              required
            />
            <Button variant="secondary" className="h-12 px-8 shrink-0 font-bold">Subscribe</Button>
          </form>
        </div>
      </div>
    </section>

  </div>
  );
};

export default Home;

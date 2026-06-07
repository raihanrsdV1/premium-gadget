import Link from "next/link";
import { ArrowRight, Laptop, Headphones, PenTool, ShieldCheck, Zap } from "lucide-react";
import { getFeaturedProducts } from "@/lib/api/products";
import ProductCard from "@/components/product/ProductCard";
import HeroSlider from "@/components/home/HeroSlider";
import NewsletterForm from "@/components/home/NewsletterForm";

// Home reuses the layout's default metadata (title default + OG).

export default async function HomePage() {
  let featuredProducts = [];
  try {
    featuredProducts = await getFeaturedProducts();
  } catch {
    featuredProducts = [];
  }

  return (
    <div className="flex flex-col">
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
              <p className="text-muted-foreground text-sm leading-relaxed text-center sm:text-left">
                Every device is verified for authenticity and undergoes rigorous quality testing before reaching you.
              </p>
            </div>
            <div className="flex flex-col items-center sm:items-start p-6 bg-background rounded-2xl shadow-sm border border-border/50 hover:shadow-md transition-all">
              <div className="p-3 bg-blue-500/10 rounded-xl text-blue-600 mb-4">
                <PenTool className="h-6 w-6" />
              </div>
              <h3 className="text-xl font-bold mb-2">Expert Repairs</h3>
              <p className="text-muted-foreground text-sm leading-relaxed text-center sm:text-left">
                From screen replacements to board-level micro-soldering, our technicians handle it all.
              </p>
            </div>
            <div className="flex flex-col items-center sm:items-start p-6 bg-background rounded-2xl shadow-sm border border-border/50 hover:shadow-md transition-all">
              <div className="p-3 bg-orange-500/10 rounded-xl text-orange-600 mb-4">
                <Zap className="h-6 w-6" />
              </div>
              <h3 className="text-xl font-bold mb-2">Fast Delivery</h3>
              <p className="text-muted-foreground text-sm leading-relaxed text-center sm:text-left">
                Enjoy express delivery within Dhaka and reliable courier services across Bangladesh.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Categories */}
      <section className="py-20">
        <div className="container px-4">
          <div className="flex items-center justify-between mb-10">
            <h2 className="text-3xl font-bold tracking-tight">Shop by Category</h2>
            <Link href="/products" className="hidden sm:inline-flex items-center text-primary font-medium hover:underline">
              View All <ArrowRight className="ml-1 h-4 w-4" />
            </Link>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
            <Link href="/products?category=laptops" className="group relative rounded-2xl overflow-hidden aspect-square border bg-secondary/20 flex flex-col items-center justify-center transition-all hover:border-primary/50 hover:bg-secondary">
              <Laptop className="h-12 w-12 text-primary mb-4 transition-transform group-hover:scale-110" />
              <span className="font-semibold text-lg">Laptops</span>
            </Link>
            <Link href="/products?category=accessories" className="group relative rounded-2xl overflow-hidden aspect-square border bg-secondary/20 flex flex-col items-center justify-center transition-all hover:border-primary/50 hover:bg-secondary">
              <Headphones className="h-12 w-12 text-primary mb-4 transition-transform group-hover:scale-110" />
              <span className="font-semibold text-lg">Accessories</span>
            </Link>
            <Link href="/products?condition=used" className="group relative rounded-2xl overflow-hidden aspect-square border bg-secondary/20 flex flex-col items-center justify-center transition-all hover:border-primary/50 hover:bg-secondary">
              <div className="relative">
                <Laptop className="h-12 w-12 text-primary mb-4 transition-transform group-hover:scale-110" />
                <span className="absolute -top-2 -right-2 flex h-5 w-5 items-center justify-center rounded-full bg-green-500 text-[10px] font-bold text-white">✓</span>
              </div>
              <span className="font-semibold text-lg">Pre-Owned</span>
            </Link>
            <Link href="/repairs" className="group relative rounded-2xl overflow-hidden aspect-square border bg-secondary/20 flex flex-col items-center justify-center transition-all hover:border-primary/50 hover:bg-secondary">
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
          {featuredProducts.length === 0 ? (
            <p className="text-muted-foreground text-center">No featured products right now.</p>
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
              {featuredProducts.map((product) => (
                <ProductCard key={product.id} product={product} action="add" />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Newsletter */}
      <section className="py-24">
        <div className="container px-4">
          <div className="max-w-2xl mx-auto text-center p-8 md:p-12 bg-primary text-primary-foreground rounded-3xl shadow-xl">
            <h2 className="text-3xl font-bold mb-4">Stay Updated</h2>
            <p className="opacity-90 mb-8">Subscribe for exclusive deals, early access to new stock, and tech tips.</p>
            <NewsletterForm />
          </div>
        </div>
      </section>
    </div>
  );
}

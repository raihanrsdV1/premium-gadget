import Link from "next/link";
import { Banknote, Facebook, MapPin, MessageCircle, Phone, ShieldCheck } from "lucide-react";
import { SITE } from "@/lib/site";
import BrandLogo from "@/components/ui/BrandLogo";
import CatMascot from "@/components/ui/CatMascot";

const directionsUrl = (b) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${SITE.name} ${b.street}, ${b.locality}`)}`;

const QUICK = [
  { href: "/products", label: "All products" },
  { href: "/products?condition=used", label: "Used laptops" },
  { href: "/products?condition=new", label: "New laptops" },
  { href: "/repairs", label: "Book a repair" },
  { href: "/repairs/track", label: "Track a repair" },
];

const linkCls = "text-[#DCE3FA] hover:text-white hover:underline underline-offset-4 focus-visible:text-white";

export default function Footer() {
  return (
    <footer className="mt-16 bg-navy text-[#DCE3FA]">
      <div className="container grid gap-10 pb-8 pt-12 sm:grid-cols-2 lg:grid-cols-[1.2fr_1fr_1.4fr]">
        <div className="flex flex-col gap-4">
          <Link href="/" className="self-start rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white" aria-label="Premium Gadget home">
            <BrandLogo onDark markClassName="h-11 w-11" textClassName="text-xl" />
          </Link>
          <p className="max-w-xs text-sm leading-relaxed">New and used laptops and gadgets, plus repairs, from two shops in Chattogram.</p>
          <div className="flex flex-wrap gap-2">
            <a href={SITE.facebookUrl} target="_blank" rel="noopener noreferrer" className="inline-flex h-10 items-center gap-2 rounded-full bg-white/10 px-4 text-sm font-bold text-white hover:bg-white/20">
              <Facebook className="h-4 w-4" aria-hidden="true" /> Facebook
            </a>
            <a href={SITE.whatsappUrl} target="_blank" rel="noopener noreferrer" className="inline-flex h-10 items-center gap-2 rounded-full bg-white/10 px-4 text-sm font-bold text-white hover:bg-white/20">
              <MessageCircle className="h-4 w-4" aria-hidden="true" /> WhatsApp
            </a>
          </div>
          <div className="flex items-center gap-2">
            <CatMascot interactive size={84} side="right" />
            <p className="text-sm">Questions? <a href={SITE.whatsappUrl} target="_blank" rel="noopener noreferrer" className="font-bold text-white underline underline-offset-4">Message us on WhatsApp</a></p>
          </div>
        </div>

        <nav aria-label="Shop" className="flex flex-col gap-2.5 text-sm">
          <h2 className="mb-1 font-display text-base font-bold text-white">Shop</h2>
          {QUICK.map((l) => <Link key={l.href} href={l.href} className={linkCls}>{l.label}</Link>)}
        </nav>


        <div id="visit" className="flex scroll-mt-24 flex-col gap-4 text-sm">
          <h2 className="font-display text-base font-bold text-white">Visit us</h2>
          {SITE.branches.map((b) => (
            <div key={b.id} className="flex gap-3">
              <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-[#F7A399]" aria-hidden="true" />
              <address className="not-italic leading-relaxed">
                <strong className="text-white">{b.name} · {b.nameBn}</strong>
                <br />
                {b.street}, {b.locality}{b.postalCode ? ` ${b.postalCode}` : ""}
                <br />
                <a href={directionsUrl(b)} target="_blank" rel="noopener noreferrer" className="font-bold text-[#F7A399] hover:underline">Get directions</a>
              </address>
            </div>
          ))}
          <a href={`tel:${SITE.phoneE164}`} className="flex items-center gap-3 font-bold text-white">
            <Phone className="h-5 w-5 shrink-0 text-[#F7A399]" aria-hidden="true" />
            {SITE.phoneDisplay} <span className="font-normal text-[#DCE3FA]">(call / WhatsApp)</span>
          </a>
        </div>
      </div>

      <div className="border-t border-white/12">
        <div className="container flex flex-col items-center gap-3 py-5 text-xs sm:flex-row sm:justify-between">
          <p>&copy; {new Date().getFullYear()} {SITE.name}. All rights reserved.</p>
          <ul className="flex flex-wrap items-center justify-center gap-2" aria-label="Payment methods">
            <li className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 font-semibold text-white"><ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />SSLCommerz secure payment</li>
            <li className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 font-semibold text-white"><Banknote className="h-3.5 w-3.5" aria-hidden="true" />Cash on delivery</li>
          </ul>
        </div>
      </div>
    </footer>
  );
}

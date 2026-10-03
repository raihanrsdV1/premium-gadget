import Link from "next/link";
import {
  Clock, Cpu, Monitor, Battery, HardDrive, Wifi, Wrench,
  Phone, MapPin, ArrowRight,
} from "lucide-react";
import Image from "next/image";
import { buttonClass } from "@/components/ui/Button";
import BookRepairCTA from "@/components/repair/BookRepairCTA";
import JsonLd from "@/components/seo/JsonLd";
import { SITE, postalAddressJsonLd } from "@/lib/site";
import { SITE_URL, formatBDT, pageMetadata } from "@/lib/seo";
import { getRepairServices } from "@/lib/api/server";
import CatMascot from "@/components/ui/CatMascot";

const FALLBACK_SERVICES = [
  { icon: Monitor, title: "Screen Replacement", description: "Cracked or dead screen? We replace displays for MacBook, Dell, HP, Lenovo and more.", price: "From ৳3,500", turnaround: "1–2 days" },
  { icon: Battery, title: "Battery Replacement", description: "Restore full battery capacity with genuine or high-quality replacement cells.", price: "From ৳2,000", turnaround: "Same day" },
  { icon: HardDrive, title: "SSD / RAM Upgrade", description: "Speed up your laptop with a fast NVMe SSD or expanded RAM.", price: "From ৳500", turnaround: "Same day" },
  { icon: Cpu, title: "Motherboard Repair", description: "Expert micro-soldering for power issues, GPU failures, and component-level faults.", price: "From ৳5,000", turnaround: "3–7 days" },
  { icon: Wifi, title: "Keyboard & Trackpad", description: "Sticky keys, dead trackpad, or liquid damage — we fix them all.", price: "From ৳2,500", turnaround: "1–3 days" },
  { icon: Wrench, title: "Full Diagnostic", description: "Not sure what's wrong? Bring it in for a comprehensive hardware & software check.", price: "৳500", turnaround: "Same day" },
];

const PROCESS_STEPS = [
  { step: "01", title: "Drop Off", desc: "Bring your device to any branch or book a courier pickup." },
  { step: "02", title: "Diagnose", desc: "Our technician examines the device and sends you a quote." },
  { step: "03", title: "Repair", desc: "Once approved, we carry out the repair with quality parts." },
  { step: "04", title: "Collect", desc: "Pick up your repaired device or get it delivered to your door." },
];

export const metadata = pageMetadata({
  title: "Laptop & Gadget Repair in Chattogram",
  description:
    "Expert laptop, MacBook and gadget repair in Chattogram, Bangladesh — screen replacement, battery service, motherboard micro-soldering. Genuine parts, 90-day warranty.",
  path: "/repairs",
});

const localBusinessJsonLd = {
  "@context": "https://schema.org",
  "@type": "LocalBusiness",
  name: "Premium Gadget — Repair Center",
  url: `${SITE_URL}/repairs`,
  telephone: SITE.phoneE164,
  priceRange: "৳৳",
  address: postalAddressJsonLd,
};

const serviceJsonLd = (SERVICES) => ({
  "@context": "https://schema.org",
  "@type": "Service",
  serviceType: "Laptop & Gadget Repair",
  provider: { "@type": "LocalBusiness", name: "Premium Gadget — Repair Center", url: `${SITE_URL}/repairs` },
  areaServed: { "@type": "City", name: "Chattogram" },
  hasOfferCatalog: {
    "@type": "OfferCatalog",
    name: "Repair Services",
    itemListElement: SERVICES.map((s) => ({
      "@type": "Offer",
      itemOffered: { "@type": "Service", name: s.title, description: s.description },
    })),
  },
});

const ICONS = [Monitor, Battery, HardDrive, Cpu, Wifi, Wrench];

export default async function RepairServicesPage() {
  const live = await getRepairServices();
  const services = live
    ? live.map((s) => ({ title: s.name, description: s.description, price: Number(s.base_price) > 0 ? `From ${formatBDT(s.base_price)}` : null }))
    : FALLBACK_SERVICES;

  return (
    <div>
      <JsonLd data={localBusinessJsonLd} />
      <JsonLd data={serviceJsonLd(services)} />

      {/* Hero */}
      <section className="container">
        <div className="relative overflow-hidden rounded-3xl bg-navy px-5 py-10 text-navy-foreground sm:px-12 sm:py-16">
          <div className="relative z-10 max-w-xl">
            <span className="mb-4 inline-block rounded-full bg-white/12 px-3 py-1 text-xs font-bold uppercase tracking-wider text-[#C9D3F5]">Repair center</span>
            <h1 className="text-display mb-4 text-white">Expert laptop and gadget repair</h1>
            <p className="mb-7 text-[#DCE3FA] sm:text-lg">
              From screen replacements to motherboard micro-soldering, our technicians bring your devices back to life.
            </p>
            <div className="flex flex-wrap gap-3">
              <BookRepairCTA size="lg" variant="coral" label="Book a repair" />
              <Link href="/repairs/track" className={buttonClass({ variant: "ghost", size: "lg", className: "border-[1.5px] border-white/55 text-white hover:bg-white/10" })}>
                Track my repair
              </Link>
            </div>
          </div>
          <CatMascot size={280} className="pointer-events-none absolute bottom-4 right-4 hidden md:inline-flex lg:right-14" />
        </div>
      </section>

      {/* Services grid */}
      <section className="container mt-12 sm:mt-16" aria-labelledby="svc-h">
        <div className="mb-6 sm:mb-8">
          <h2 id="svc-h" className="text-title">Our services</h2>
          <p className="mt-1 text-muted-foreground">Prices shown are starting prices; we confirm the quote after diagnosis.</p>
        </div>
        <ul className="grid gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3">
          {services.map((svc, i) => {
            const Icon = svc.icon || ICONS[i % ICONS.length];
            return (
              <li key={svc.title} className="flex flex-col rounded-2xl border border-border bg-card p-5 shadow-card transition-shadow hover:shadow-pop sm:p-6">
                <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-tint text-primary">
                  <Icon className="h-6 w-6" aria-hidden="true" />
                </span>
                <h3 className="mb-2 font-display text-lg font-bold">{svc.title}</h3>
                {svc.description && <p className="mb-4 text-sm leading-relaxed text-muted-foreground">{svc.description}</p>}
                <div className="mt-auto flex items-center justify-between text-sm">
                  {svc.price && <span className="font-display font-extrabold text-primary">{svc.price}</span>}
                  {svc.turnaround && (
                    <span className="flex items-center gap-1 text-muted-foreground"><Clock className="h-3.5 w-3.5" aria-hidden="true" /> {svc.turnaround}</span>
                  )}
                </div>
                <BookRepairCTA variant="outline" size="sm" className="mt-4 w-full" label="Book now" />
              </li>
            );
          })}
        </ul>
      </section>

      {/* How it works */}
      <section className="container mt-12 sm:mt-16" aria-labelledby="how-h">
        <h2 id="how-h" className="text-title mb-6 sm:mb-8">How it works</h2>
        <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {PROCESS_STEPS.map((step) => (
            <li key={step.step} className="rounded-2xl bg-tint p-5">
              <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-navy font-display text-lg font-extrabold text-navy-foreground dark:bg-primary dark:text-primary-foreground">{step.step}</span>
              <h3 className="mb-1 font-display font-bold">{step.title}</h3>
              <p className="text-sm text-muted-foreground">{step.desc}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Track repair CTA */}
      <section className="container mt-12 sm:mt-16">
        <div className="flex flex-col items-start justify-between gap-5 rounded-3xl bg-navy p-6 text-navy-foreground sm:p-10 md:flex-row md:items-center">
          <div>
            <h2 className="mb-1 font-display text-2xl font-extrabold text-white">Already dropped off your device?</h2>
            <p className="text-[#DCE3FA]">Check your repair status with your ticket number.</p>
          </div>
          <Link href="/repairs/track" className={buttonClass({ variant: "coral", size: "lg", className: "shrink-0" })}>
            Track repair status <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </section>

      {/* Contact info */}
      <section className="container mt-12 sm:mt-16" aria-label="Contact">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex items-start gap-4 rounded-2xl border border-border bg-card p-5">
            <Phone className="mt-0.5 h-6 w-6 shrink-0 text-primary" aria-hidden="true" />
            <div>
              <h3 className="mb-1 font-display font-bold">Call us</h3>
              <a href={`tel:${SITE.phoneE164}`} className="text-sm font-semibold hover:text-primary">{SITE.phoneDisplay}</a>
              <p className="text-sm text-muted-foreground">Call or WhatsApp</p>
            </div>
          </div>
          <div className="flex items-start gap-4 rounded-2xl border border-border bg-card p-5">
            <MapPin className="mt-0.5 h-6 w-6 shrink-0 text-primary" aria-hidden="true" />
            <div>
              <h3 className="mb-1 font-display font-bold">Visit us</h3>
              {SITE.branches.map((b) => (
                <p key={b.name} className="text-sm text-muted-foreground">
                  <span className="font-semibold text-foreground">{b.name}:</span> {b.street}, {b.locality}
                </p>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

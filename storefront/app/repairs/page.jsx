import Link from "next/link";
import {
  Clock, Cpu, Monitor, Battery, HardDrive, Wifi, Wrench,
  ChevronRight, Phone, MapPin, ArrowRight,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import BookRepairCTA from "@/components/repair/BookRepairCTA";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

const SERVICES = [
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

export const metadata = {
  title: "Laptop & Gadget Repair in Dhaka",
  description:
    "Expert laptop, MacBook and gadget repair in Dhaka, Bangladesh — screen replacement, battery service, motherboard micro-soldering. Genuine parts, 90-day warranty.",
};

const localBusinessJsonLd = {
  "@context": "https://schema.org",
  "@type": "LocalBusiness",
  name: "Premium Gadget — Repair Center",
  image: `${SITE_URL}/og-repair.jpg`,
  url: `${SITE_URL}/repairs`,
  telephone: "+880-1700-000000",
  priceRange: "৳৳",
  address: {
    "@type": "PostalAddress",
    streetAddress: "Level 4, Multiplan Center, New Elephant Road",
    addressLocality: "Dhaka",
    postalCode: "1205",
    addressCountry: "BD",
  },
  geo: { "@type": "GeoCoordinates", latitude: 23.7461, longitude: 90.3742 },
  openingHoursSpecification: {
    "@type": "OpeningHoursSpecification",
    dayOfWeek: ["Saturday", "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday"],
    opens: "10:00",
    closes: "20:00",
  },
};

const serviceJsonLd = {
  "@context": "https://schema.org",
  "@type": "Service",
  serviceType: "Laptop & Gadget Repair",
  provider: { "@type": "LocalBusiness", name: "Premium Gadget — Repair Center", url: `${SITE_URL}/repairs` },
  areaServed: { "@type": "City", name: "Dhaka" },
  hasOfferCatalog: {
    "@type": "OfferCatalog",
    name: "Repair Services",
    itemListElement: SERVICES.map((s) => ({
      "@type": "Offer",
      itemOffered: { "@type": "Service", name: s.title, description: s.description },
    })),
  },
};

export default function RepairServicesPage() {
  return (
    <div className="px-4">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(localBusinessJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(serviceJsonLd) }} />

      {/* Hero */}
      <section className="bg-gradient-to-br from-slate-900 to-slate-800 text-white py-20 px-4 -mx-4 mb-16">
        <div className="container text-center max-w-3xl mx-auto">
          <span className="inline-block bg-primary/20 text-primary-foreground text-sm font-semibold px-3 py-1 rounded-full mb-4">
            Certified Repair Center
          </span>
          <h1 className="text-4xl md:text-5xl font-bold mb-5 tracking-tight">Expert Gadget Repair</h1>
          <p className="text-slate-300 text-lg mb-8 max-w-xl mx-auto">
            From screen replacements to complex motherboard micro-soldering, our certified technicians bring your devices back to life.
          </p>
          <div className="flex flex-wrap gap-3 justify-center">
            <BookRepairCTA size="lg" label="Book a Repair" />
            <Link href="/repairs/track">
              <Button size="lg" variant="outline" className="border-white/30 text-white hover:bg-white/10">
                Track My Repair
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Services grid */}
      <section className="container mb-20">
        <div className="text-center mb-10">
          <h2 className="text-3xl font-bold mb-2">Our Services</h2>
          <p className="text-muted-foreground">Transparent pricing, genuine parts, 90-day warranty on all repairs.</p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {SERVICES.map((svc) => (
            <Card key={svc.title} className="hover:shadow-md transition-shadow">
              <CardContent className="p-6">
                <div className="w-12 h-12 bg-primary/10 text-primary rounded-xl flex items-center justify-center mb-4">
                  <svc.icon className="h-6 w-6" />
                </div>
                <h3 className="font-bold text-lg mb-2">{svc.title}</h3>
                <p className="text-muted-foreground text-sm mb-4 leading-relaxed">{svc.description}</p>
                <div className="flex items-center justify-between text-sm">
                  <span className="font-semibold text-primary">{svc.price}</span>
                  <span className="text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" /> {svc.turnaround}
                  </span>
                </div>
                <BookRepairCTA variant="outline" size="sm" className="w-full mt-4" label="Book Now" />
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="container mb-20">
        <div className="text-center mb-10">
          <h2 className="text-3xl font-bold mb-2">How It Works</h2>
          <p className="text-muted-foreground">Simple, transparent process from drop-off to pick-up.</p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {PROCESS_STEPS.map((step, i) => (
            <div key={step.step} className="relative text-center">
              {i < PROCESS_STEPS.length - 1 && (
                <ChevronRight className="hidden lg:block absolute -right-3 top-6 h-6 w-6 text-muted-foreground/40 z-10" />
              )}
              <div className="w-14 h-14 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xl font-bold mx-auto mb-3">
                {step.step}
              </div>
              <h3 className="font-semibold mb-1">{step.title}</h3>
              <p className="text-muted-foreground text-sm">{step.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Track repair CTA */}
      <section className="container mb-20">
        <div className="bg-slate-900 dark:bg-slate-950 rounded-2xl p-8 md:p-12 text-white flex flex-col md:flex-row items-center justify-between gap-6">
          <div>
            <h3 className="text-2xl font-bold mb-2">Already dropped off your device?</h3>
            <p className="text-slate-300">Track your repair status in real time with your ticket number.</p>
          </div>
          <Link href="/repairs/track">
            <Button size="lg" variant="outline" className="border-white/30 text-white hover:bg-white/10 whitespace-nowrap">
              Track Repair Status <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Link>
        </div>
      </section>

      {/* Contact info */}
      <section className="container mb-20">
        <div className="grid sm:grid-cols-2 gap-6 max-w-2xl mx-auto">
          <Card className="p-5">
            <CardContent className="p-0 flex items-start gap-4">
              <Phone className="h-6 w-6 text-primary shrink-0 mt-0.5" />
              <div>
                <h4 className="font-semibold mb-1">Call Us</h4>
                <p className="text-muted-foreground text-sm">01700-000000</p>
                <p className="text-muted-foreground text-sm">Sat–Thu, 10am–8pm</p>
              </div>
            </CardContent>
          </Card>
          <Card className="p-5">
            <CardContent className="p-0 flex items-start gap-4">
              <MapPin className="h-6 w-6 text-primary shrink-0 mt-0.5" />
              <div>
                <h4 className="font-semibold mb-1">Visit Us</h4>
                <p className="text-muted-foreground text-sm">Level 4, Multiplan Center</p>
                <p className="text-muted-foreground text-sm">New Elephant Road, Dhaka</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}

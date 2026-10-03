import { BadgeCheck, Banknote, Store, Truck, Wrench } from "lucide-react";

// Only claims the shop really makes.
const ITEMS = [
  { icon: BadgeCheck, title: "Genuine products", text: "New and used, sold as exactly what they are." },
  { icon: Truck, title: "Delivery all over Bangladesh", text: "Quick inside Chattogram, courier elsewhere." },
  { icon: Banknote, title: "Cash on delivery", text: "Pay when it arrives, or pay securely online." },
  { icon: Store, title: "Two Chattogram branches", text: "Visit us at GEC or WASA." },
  { icon: Wrench, title: "Repairs in-house", text: "Screens, batteries, keyboards and more." },
];

export default function TrustRow() {
  return (
    <section aria-label="Why Premium Gadget" className="container">
      <ul className="grid grid-cols-1 gap-3 rounded-3xl bg-navy p-5 text-navy-foreground sm:grid-cols-2 sm:p-7 lg:grid-cols-5 lg:gap-6">
        {ITEMS.map(({ icon: Icon, title, text }) => (
          <li key={title} className="flex items-start gap-3.5">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-white/10 text-[#F7A399]"><Icon className="h-5 w-5" aria-hidden="true" /></span>
            <span className="flex flex-col gap-0.5 text-sm leading-snug"><strong className="text-white">{title}</strong><span className="text-[#C9D3F5]">{text}</span></span>
          </li>
        ))}
      </ul>
    </section>
  );
}

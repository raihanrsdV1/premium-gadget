import CatMascot from "@/components/ui/CatMascot";
import Link from "next/link";

export default function RepairsCTA() {
  return (
    <section aria-labelledby="home-repair" className="container">
      <div className="flex flex-col items-center gap-6 rounded-[28px] bg-tint p-6 text-center sm:flex-row sm:p-8 sm:text-left">
        <CatMascot size={150} />
        <div className="flex-1">
          <h2 id="home-repair" className="text-title">Laptop acting up? We fix it.</h2>
          <p className="mt-2 text-muted-foreground">Screens, batteries, keyboards and motherboard repair at both Chattogram shops. Book online and track progress any time.</p>
        </div>
        <div className="flex flex-wrap justify-center gap-3">
          <Link href="/repairs" className="flex h-12 items-center rounded-full bg-navy px-6 text-sm font-bold text-navy-foreground hover:bg-navy/90 dark:bg-primary dark:text-primary-foreground">Book a repair</Link>
          <Link href="/repairs/track" className="flex h-12 items-center rounded-full border-[1.5px] border-foreground/30 px-6 text-sm font-bold hover:bg-accent">Track repair</Link>
        </div>
      </div>
    </section>
  );
}

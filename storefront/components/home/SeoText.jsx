import Link from "next/link";
import { SITE } from "@/lib/site";

export default function SeoText() {
  return (
    <section aria-labelledby="home-seo" className="container">
      <div className="max-w-3xl space-y-3 text-sm leading-relaxed text-muted-foreground">
        <h2 id="home-seo" className="text-heading text-foreground">Buy new and used laptops in Chattogram</h2>
        <p>
          Premium Gadget is a laptop and gadget shop in Chattogram with two branches: {SITE.branches[0].name} at Sanmar Ocean City, Nasirabad, and {SITE.branches[1].name} at Meridian Kohinoor City. We sell brand-new laptops as well as carefully checked <Link href="/products?condition=used" className="font-semibold text-primary hover:underline">used laptops</Link>, so you can pick the budget that suits you, from a student ThinkPad to a MacBook or a gaming machine.
        </p>
        <p>
          Used laptops are graded and come with a condition report. Order online for <strong className="font-semibold text-foreground">cash on delivery</strong> across Bangladesh, or visit a branch to see the machine first. Need a repair? We also fix <Link href="/repairs" className="font-semibold text-primary hover:underline">laptop screens, batteries, keyboards and motherboards</Link>. Call or WhatsApp {SITE.phoneDisplay}.
        </p>
      </div>
    </section>
  );
}

import { Banknote, Store, Truck } from "lucide-react";
import { formatBDT, toNumber } from "@/lib/seo";
import { SITE } from "@/lib/site";

/** Delivery zones (from settings), COD note and in-store visit info. Server Component. */
export default function DeliveryInfo({ settings }) {
  const zones = Array.isArray(settings?.shipping?.zones) ? settings.shipping.zones : [];
  const free = toNumber(settings?.shipping?.free_shipping_threshold);
  const cod = settings?.checkout?.cod_enabled !== false;

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <section className="rounded-2xl border border-border bg-card p-5">
        <h3 className="mb-3 flex items-center gap-2 font-display text-base font-bold"><Truck className="h-5 w-5 text-primary" aria-hidden="true" /> Delivery</h3>
        {zones.length > 0 ? (
          <ul className="divide-y divide-border text-sm">
            {zones.map((z) => (
              <li key={z.code || z.label} className="flex items-center justify-between gap-3 py-2.5">
                <span><strong>{z.label}</strong>{z.eta ? <span className="text-muted-foreground"> · {z.eta}</span> : null}</span>
                <strong>{formatBDT(z.fee)}</strong>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">We deliver across Bangladesh. The fee is shown at checkout.</p>
        )}
        {free ? <p className="mt-3 text-sm font-semibold text-success">Free delivery on orders over {formatBDT(free)}.</p> : null}
        {cod && <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground"><Banknote className="h-4 w-4 shrink-0" aria-hidden="true" /> Cash on delivery available.</p>}
      </section>

      <section className="rounded-2xl border border-border bg-card p-5">
        <h3 className="mb-3 flex items-center gap-2 font-display text-base font-bold"><Store className="h-5 w-5 text-primary" aria-hidden="true" /> Visit a branch</h3>
        <ul className="space-y-3 text-sm">
          {SITE.branches.map((b) => (
            <li key={b.id}>
              <strong>{b.name}</strong>
              <address className="not-italic text-muted-foreground">{b.street}, {b.locality}</address>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-sm text-muted-foreground">Call or message us on WhatsApp before you come to check the item is on the shelf.</p>
      </section>
    </div>
  );
}

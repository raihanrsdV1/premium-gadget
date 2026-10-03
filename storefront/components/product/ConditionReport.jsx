import { Battery, BatteryCharging, Box, ClipboardCheck, Sparkles } from "lucide-react";

/** Condition report for pre-owned items: grade, battery, cosmetic notes, what's in the box. Server Component. */
export default function ConditionReport({ product }) {
  const grade = product.condition_grade;
  const battery = product.battery_health != null ? Number(product.battery_health) : null;
  const cycles = product.battery_cycles != null ? Number(product.battery_cycles) : null;
  const { accessories, condition_notes: notes } = product;
  if (!grade && battery === null && cycles === null && !accessories && !notes) return null;

  return (
    <section aria-labelledby="cond-report" className="rounded-3xl bg-tint p-5">
      <div className="flex items-center gap-4">
        {grade && (
          <span className="flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-full bg-navy font-display text-navy-foreground">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-[#C9D3F5]">Grade</span>
            <span className="text-2xl font-extrabold leading-none">{grade}</span>
          </span>
        )}
        <div>
          <h2 id="cond-report" className="font-display text-lg font-bold">Condition report</h2>
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground"><ClipboardCheck className="h-4 w-4 shrink-0" aria-hidden="true" /> Tested and graded by our technicians</p>
        </div>
      </div>

      {battery !== null && (
        <div className="mt-4">
          <div className="mb-1.5 flex items-center justify-between text-sm">
            <span className="flex items-center gap-1.5 font-bold"><Battery className="h-4 w-4" aria-hidden="true" /> Battery health</span>
            <strong>{battery}%</strong>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-background" role="img" aria-label={`Battery health ${battery} percent`}>
            <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(0, Math.min(100, battery))}%` }} />
          </div>
        </div>
      )}

      <dl className="mt-4 grid gap-3 text-sm">
        {cycles !== null && (
          <div className="flex items-start gap-2.5">
            <BatteryCharging className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
            <div><dt className="font-bold">Charge cycles</dt><dd className="text-muted-foreground">{cycles}</dd></div>
          </div>
        )}
        {notes && (
          <div className="flex items-start gap-2.5">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
            <div><dt className="font-bold">Cosmetic notes</dt><dd className="text-muted-foreground">{notes}</dd></div>
          </div>
        )}
        {accessories && (
          <div className="flex items-start gap-2.5">
            <Box className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
            <div><dt className="font-bold">In the box</dt><dd className="text-muted-foreground">{accessories}</dd></div>
          </div>
        )}
      </dl>
    </section>
  );
}

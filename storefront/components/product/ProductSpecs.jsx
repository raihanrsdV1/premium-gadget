/**
 * Tech specs as semantic definition lists, one per spec group (template
 * groups like "Processor", "Memory & Storage"). The flat legacy
 * `specifications` arrive as a single unnamed group and render exactly like
 * the old table. Server Component; passed into ProductDetailView as a slot.
 *
 * @param {{ groups: { name: string|null, items: { label: string, value: string }[] }[] }} props
 */
export default function ProductSpecs({ groups }) {
  return (
    <>
      <h2 className="mb-5 font-display text-xl font-extrabold">Tech specs</h2>
      <div className="space-y-5">
        {groups.map((group, gi) => (
          <section key={`${group.name || "specs"}-${gi}`} className="overflow-hidden rounded-2xl border border-border bg-card">
            {group.name && (
              <h3 className="bg-tint px-4 py-2.5 font-display text-sm font-bold">
                {group.name}
              </h3>
            )}
            <dl className="divide-y divide-border px-4 text-sm">
              {group.items.map((spec, i) => (
                <div key={i} className="grid grid-cols-5 gap-3 py-3 sm:grid-cols-3">
                  <dt className="col-span-2 font-medium text-muted-foreground sm:col-span-1">{spec.label}</dt>
                  <dd className="col-span-3 font-medium sm:col-span-2">{spec.value}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </>
  );
}

import Link from "next/link";
import { ChevronRight } from "lucide-react";

/** Visible breadcrumb trail; items: [{ name, path }], the last is the current page. */
export default function Breadcrumbs({ items, className = "" }) {
  return (
    <nav aria-label="Breadcrumb" className={className}>
      <ol className="flex flex-wrap items-center gap-x-1 gap-y-0.5 text-sm text-muted-foreground">
        {items.map((it, i) => {
          const last = i === items.length - 1;
          return (
            <li key={`${it.path}-${i}`} className="flex min-w-0 items-center gap-1">
              {last ? (
                <span aria-current="page" className="truncate font-semibold text-foreground">{it.name}</span>
              ) : (
                <>
                  <Link href={it.path} className="rounded hover:text-foreground hover:underline">{it.name}</Link>
                  <ChevronRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                </>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

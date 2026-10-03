import CatMascot from "@/components/ui/CatMascot";
import Link from "next/link";
import { buttonClass } from "@/components/ui/Button";

/** Friendly empty/error state with the cat mascot. `action` is { href, label }. */
export default function CatEmpty({ title, text, action, secondary, className = "" }) {
  return (
    <div className={`flex flex-col items-center rounded-3xl border border-dashed border-border bg-tint/50 px-6 py-14 text-center ${className}`}>
      <CatMascot size={150} />
      <h2 className="mt-4 font-display text-xl font-extrabold">{title}</h2>
      {text && <p className="mt-1.5 max-w-md text-sm text-muted-foreground">{text}</p>}
      {(action || secondary) && (
        <div className="mt-5 flex flex-wrap justify-center gap-3">
          {action && <Link href={action.href} className={buttonClass({ variant: "default" })}>{action.label}</Link>}
          {secondary && <Link href={secondary.href} className={buttonClass({ variant: "outline" })}>{secondary.label}</Link>}
        </div>
      )}
    </div>
  );
}

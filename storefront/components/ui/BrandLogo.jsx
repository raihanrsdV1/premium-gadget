import Image from "next/image";
import { SITE } from "@/lib/site";

/**
 * Round "PG" monogram + wordmark. In dark mode the mark sits on a white round
 * disc so its navy ring stays visible; `onDark` forces the disc (navy bands).
 * `wordmark`: "always" | "responsive" (hidden below the xs breakpoint) | "none".
 */
export default function BrandLogo({ onDark = false, wordmark = "always", markClassName = "h-9 w-9", textClassName = "text-lg", priority = false }) {
  const disc = onDark ? "bg-white p-[3px]" : "dark:bg-white dark:p-[3px]";
  const showWord = wordmark !== "none";
  return (
    <span className="inline-flex items-center gap-2">
      <span className={`inline-flex shrink-0 items-center justify-center rounded-full ${disc} ${markClassName}`}>
        <Image src={SITE.logoPath} alt={showWord ? "" : SITE.name} width={SITE.logoSize.width} height={SITE.logoSize.height} priority={priority} className="h-full w-full object-contain" />
      </span>
      {showWord && (
        <span className={`${wordmark === "responsive" ? "hidden xs:inline" : ""} font-display font-extrabold leading-none tracking-tight ${textClassName}`}>
          <span className={onDark ? "text-white" : "text-primary dark:text-[#C9D6FF]"}>Premium</span>{" "}
          <span className="text-coral">Gadget</span>
        </span>
      )}
    </span>
  );
}

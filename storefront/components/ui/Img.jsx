import Image from "next/image";

// Hosts next.config.mjs `images.remotePatterns` allows. Anything else (a CDN
// the admin pasted, an http URL) falls back to a plain <img> so a stray URL can
// never crash the page; see lib: keep this in sync with next.config.mjs.
const OPTIMIZABLE = [/^images\.unsplash\.com$/, /\.r2\.dev$/];

export function canOptimize(src) {
  if (typeof src !== "string") return false;
  if (src.startsWith("/")) return !src.startsWith("//");
  try {
    const u = new URL(src);
    return u.protocol === "https:" && OPTIMIZABLE.some((re) => re.test(u.hostname));
  } catch {
    return false;
  }
}

/**
 * Remote-image wrapper: next/image when the host is whitelisted, else <img>.
 * Pass `fill` (parent must be `relative`) or width + height, and `sizes`.
 */
export default function Img({ src, alt = "", fill, width, height, sizes, priority, className, style }) {
  if (!src) return null;
  if (canOptimize(src)) {
    return (
      <Image
        src={src}
        alt={alt}
        {...(fill ? { fill: true } : { width, height })}
        sizes={sizes}
        priority={priority}
        className={className}
        style={style}
      />
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      width={fill ? undefined : width}
      height={fill ? undefined : height}
      loading={priority ? "eager" : "lazy"}
      className={className}
      style={fill ? { position: "absolute", inset: 0, width: "100%", height: "100%", ...style } : style}
    />
  );
}

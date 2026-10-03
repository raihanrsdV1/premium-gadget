import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { createHash, timingSafeEqual } from "node:crypto";

/**
 * POST /api/revalidate — on-demand cache invalidation hook for the backend.
 *
 * After a catalog / banner / settings write the API posts
 *   x-revalidate-secret: <REVALIDATE_SECRET>
 *   { "tags": ["products", "product:<slug>", "collections", "collection:<slug>", ...] }
 * and we drop every cached fetch (and ISR page) carrying those tags.
 * REVALIDATE_SECRET is server-only (no NEXT_PUBLIC_ prefix).
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Accepts plain tags (`products`, `collections`, ...) and scoped ones
// (`product:<slug>`, `collection:<slug>`).
const TAG_RE = /^[a-z]+(:[a-z0-9-]+)?$/;
const MAX_TAGS = 50;
const MAX_TAG_LENGTH = 200;
const MAX_BODY_BYTES = 16 * 1024;
const MIN_SECRET_LENGTH = 16;

let warnedMissingSecret = false;

/** Constant-time compare: hash both sides so lengths match and nothing leaks via timing. */
function secretMatches(given) {
  const expected = process.env.REVALIDATE_SECRET || "";
  if (expected.length < MIN_SECRET_LENGTH) {
    if (!warnedMissingSecret) {
      console.warn(`[revalidate] REVALIDATE_SECRET is unset or shorter than ${MIN_SECRET_LENGTH} characters; rejecting all requests.`);
      warnedMissingSecret = true;
    }
    return false;
  }
  if (typeof given !== "string" || !given) return false;
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

const reply = (status, body) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request) {
  if (!secretMatches(request.headers.get("x-revalidate-secret"))) {
    return reply(401, { success: false, message: "Unauthorized" });
  }

  const raw = await request.text();
  if (Buffer.byteLength(raw) > MAX_BODY_BYTES) {
    return reply(413, { success: false, message: "Payload too large" });
  }

  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return reply(400, { success: false, message: "Body must be JSON: { \"tags\": [...] }" });
  }

  const tags = body?.tags;
  const valid =
    Array.isArray(tags) &&
    tags.length > 0 &&
    tags.length <= MAX_TAGS &&
    tags.every((t) => typeof t === "string" && t.length <= MAX_TAG_LENGTH && TAG_RE.test(t));
  if (!valid) {
    return reply(400, {
      success: false,
      message: `tags must be an array of 1-${MAX_TAGS} strings matching ${TAG_RE}`,
    });
  }

  const unique = [...new Set(tags)];
  unique.forEach((tag) => revalidateTag(tag));
  return reply(200, { success: true, revalidated: unique, now: Date.now() });
}

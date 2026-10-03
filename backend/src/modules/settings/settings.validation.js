const { z, bdPhone, money, positiveMoney, httpUrl } = require('../../utils/validators');
const { divisionSchema } = require('../orders/order.validation');
const { SITE_PATH } = require('../banners/banner.validation');

/**
 * One strict schema per settings key. PUT /settings/:key replaces the whole
 * value, so every non-nullable field is required; nullable fields may be
 * omitted (stored as null). Unknown fields are rejected (strict) so typos in
 * the admin app surface as 400s instead of silently vanishing.
 */

const optionalNull = (schema) => schema.nullable().optional().transform((v) => (v === undefined ? null : v));

const store = z
  .object({
    name: z.string().trim().min(1).max(120),
    phone: optionalNull(bdPhone),
    whatsapp: optionalNull(bdPhone),
    email: optionalNull(z.string().trim().email().max(255)),
    address: optionalNull(z.string().trim().min(1).max(300)),
    hours: optionalNull(z.string().trim().min(1).max(200)),
    map_url: optionalNull(httpUrl),
  })
  .strict();

const social = z
  .object({
    facebook: optionalNull(httpUrl),
    instagram: optionalNull(httpUrl),
    youtube: optionalNull(httpUrl),
    tiktok: optionalNull(httpUrl),
  })
  .strict();

/**
 * A delivery zone. Checkout picks the zone from the shipping address: a zone
 * listing the address's district, else one listing its division, else the
 * single default zone. The fee is never the customer's choice.
 */
const zone = z
  .object({
    code: z.string().trim().min(1).max(40).regex(/^[a-z0-9_]+$/, 'Zone code may contain a-z, 0-9 and _'),
    label: z.string().trim().min(1).max(60),
    fee: money,
    eta: optionalNull(z.string().trim().min(1).max(40)),
    districts: z.array(z.string().trim().min(2).max(60)).max(100).default([]),
    divisions: z.array(divisionSchema).max(8).default([]),
    is_default: z.boolean().default(false),
  })
  .strict();

const lower = (s) => s.trim().toLowerCase();

/** No district/division may map to two zones (the fee would be ambiguous). */
const listedTwice = (zones, field) => {
  const seen = new Set();
  for (const zn of zones) {
    for (const place of new Set(zn[field].map(lower))) {
      if (seen.has(place)) return place;
      seen.add(place);
    }
  }
  return null;
};

const shipping = z
  .object({
    zones: z
      .array(zone)
      .min(1, 'At least one shipping zone is required')
      .max(20)
      .superRefine((zones, ctx) => {
        if (new Set(zones.map((zn) => zn.code)).size !== zones.length) {
          ctx.addIssue({ code: 'custom', message: 'Zone codes must be unique' });
        }
        if (zones.filter((zn) => zn.is_default).length !== 1) {
          ctx.addIssue({ code: 'custom', message: 'Exactly one zone must be the default (is_default: true)' });
        }
        for (const field of ['districts', 'divisions']) {
          const dup = listedTwice(zones, field);
          if (dup) ctx.addIssue({ code: 'custom', message: `"${dup}" is listed in more than one zone` });
        }
      }),
    free_shipping_threshold: optionalNull(positiveMoney),
  })
  .strict();

const checkout = z
  .object({
    cod_enabled: z.boolean(),
    // Turn on once SMS OTP works (customers can't verify without it).
    cod_requires_verified_phone: z.boolean().default(false),
    // Long enough to finish a bKash/card payment, short enough that abandoned
    // carts don't hold stock all day.
    reservation_minutes: z.number().int().min(5).max(1440),
    pending_order_limit: z.number().int().min(1).max(20),
    // Unconfirmed COD orders release their stock after this long, so fake
    // COD orders can't hold inventory indefinitely.
    cod_confirm_hours: z.number().int().min(1).max(720).default(24),
    // Total units (summed quantity) per order.
    max_units_per_order: z.number().int().min(1).max(100).default(5),
    // Largest order total payable on delivery; null = no cap.
    cod_max_order_value: positiveMoney.nullable().default(300000),
  })
  .strict();

const seo = z
  .object({
    default_title: z.string().trim().min(1).max(120),
    default_description: z.string().trim().min(1).max(320),
    og_image: optionalNull(httpUrl),
  })
  .strict();

// Top-of-site announcement bar. A link is a site path ("/products", never
// "//host") or an https:// URL, so javascript:, data: and plain http are out.
const announcementLink = z
  .string()
  .trim()
  .max(2048)
  .refine(
    (v) => SITE_PATH.test(v) || (/^https:\/\//i.test(v) && httpUrl.safeParse(v).success),
    'Link must be a site path starting with a single "/" or an https:// URL'
  );

const announcement = z
  .object({
    enabled: z.boolean(),
    items: z
      .array(
        z
          .object({
            text: z.string().trim().min(1).max(160),
            // A cleared form input ("") means no link.
            link: z.preprocess(
              (v) => (typeof v === 'string' && v.trim() === '' ? null : v),
              announcementLink.nullable().optional().transform((v) => (v === undefined ? null : v))
            ),
          })
          .strict()
      )
      .max(5)
      .default([]),
  })
  .strict();

const SETTING_SCHEMAS = { store, social, shipping, checkout, seo, announcement };

const keyParams = z.object({ key: z.string().trim().min(1).max(60) });

module.exports = { SETTING_SCHEMAS, keyParams };

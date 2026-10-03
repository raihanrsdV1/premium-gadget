/**
 * Safe JSON-LD <script>. JSON.stringify alone does NOT escape "<", so any
 * string containing "</script>" (a product name, a query param) would break
 * out of the tag and run as HTML. Escape every character that can end a
 * script block or be misread inside one (incl. U+2028/U+2029 line separators).
 */
const LS = String.fromCharCode(0x2028);
const PS = String.fromCharCode(0x2029);

const ESCAPES = {
  "<": "\\u003c",
  ">": "\\u003e",
  "&": "\\u0026",
  [LS]: "\\u2028",
  [PS]: "\\u2029",
};

const UNSAFE = new RegExp(`[<>&${LS}${PS}]`, "g");

export function serializeJsonLd(data) {
  return JSON.stringify(data).replace(UNSAFE, (c) => ESCAPES[c]);
}

export default function JsonLd({ data }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }}
    />
  );
}

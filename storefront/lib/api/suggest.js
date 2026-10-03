// Browser-side typeahead data for the header search.
// GET /search/suggest?q=  (contract §3). Until that endpoint is deployed, fall
// back to GET /products/search?q=&limit=6 and shape it the same way.

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:5001/api/v1";

let suggestMissing = false; // remembered after a 404 so we stop probing

/**
 * @returns {Promise<{ products: object[], categories: object[], brands: object[], total: number }>}
 * @throws on network errors (AbortError included); callers ignore aborts.
 */
export async function fetchSuggestions(q, signal) {
  const query = q.trim();
  if (!suggestMissing) {
    const res = await fetch(`${API_BASE_URL}/search/suggest?q=${encodeURIComponent(query)}`, { signal });
    if (res.ok) {
      const json = await res.json();
      const d = json?.data || {};
      return {
        products: Array.isArray(d.products) ? d.products : [],
        categories: Array.isArray(d.categories) ? d.categories : [],
        brands: Array.isArray(d.brands) ? d.brands : [],
        total: Number(d.total) || (Array.isArray(d.products) ? d.products.length : 0),
      };
    }
    if (res.status === 404) suggestMissing = true;
    else if (res.status === 400) return { products: [], categories: [], brands: [], total: 0 };
    else throw new Error(`suggest failed (${res.status})`);
  }
  const res = await fetch(`${API_BASE_URL}/products/search?q=${encodeURIComponent(query)}&limit=6`, { signal });
  if (!res.ok) throw new Error(`search failed (${res.status})`);
  const json = await res.json();
  const rows = Array.isArray(json?.data) ? json.data : [];
  return {
    products: rows.slice(0, 6).map((p) => ({
      id: p.id,
      name: p.name,
      slug: p.slug,
      image: p.image,
      price: p.price,
      compare_at_price: p.compare_at_price,
      in_stock: p.in_stock,
    })),
    categories: [],
    brands: [],
    total: Number(json?.pagination?.total) || rows.length,
  };
}

import { getVariants } from "@/lib/api/products";
import { addItem } from "@/store/slices/cartSlice";

/**
 * Add a product to the cart from a listing context (where only the product is
 * known, not a chosen variant). Enforces that cart lines ALWAYS carry a
 * variant_id, never a product_id, and respects available stock:
 *   - single-variant product, in stock -> add that variant (with maxStock)
 *   - single-variant product, out of stock -> "out_of_stock"
 *   - multi-variant product -> navigate to the product page to choose
 *
 * @returns {Promise<"added"|"navigated"|"out_of_stock">}
 */
export async function addProductToCart({ productId, slug, name, image }, dispatch, router) {
  const variants = await getVariants(productId);
  if (variants.length === 1) {
    const v = variants[0];
    const available = Number(v.available ?? 0);
    if (available <= 0) return "out_of_stock";
    dispatch(
      addItem({
        id: v.id, // variant_id — never the product id
        name,
        price: Number(v.price) || 0,
        image: image || "",
        slug: slug || "",
        variantName: v.variant_name || "",
        quantity: 1,
        maxStock: available,
      })
    );
    return "added";
  }
  // 0 or multiple variants -> let the user pick (and see stock) on the product page.
  router.push(`/products/${slug}`);
  return "navigated";
}

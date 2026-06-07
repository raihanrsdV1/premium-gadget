import Link from "next/link";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import AddToCartButton from "./AddToCartButton";

const FALLBACK_IMAGE =
  "https://images.unsplash.com/photo-1496181133206-80ce9b88a853?auto=format&fit=crop&q=80&w=400";

/**
 * Listing card for product grids (Server Component). Markup/tokens ported from
 * the grid cards in frontend ProductList/SearchPage.
 *
 * @param {object} product - list-shaped product (image, brand, name, price, condition, slug)
 * @param {"view"|"add"} action - footer button behaviour
 */
export default function ProductCard({ product, action = "view" }) {
  const href = `/products/${product.slug}`;
  const price = Number(product.price || 0);
  const compareAt = product.compare_at_price ? Number(product.compare_at_price) : null;
  const isUsed = product.condition === "Pre-Owned" || product.condition === "used";

  return (
    <Card className="group overflow-hidden border-border/50 hover:border-primary/30 transition-all hover:shadow-lg flex flex-col">
      <Link href={href} className="relative block aspect-square overflow-hidden bg-white p-4">
        {isUsed && (
          <span className="absolute top-2 left-2 z-10 rounded-full bg-orange-100 text-orange-700 px-2 py-0.5 text-xs font-semibold">
            Pre-Owned
          </span>
        )}
        <img
          src={product.image || FALLBACK_IMAGE}
          alt={product.name}
          className="object-contain w-full h-full transition-transform duration-500 group-hover:scale-105"
        />
      </Link>
      <CardContent className="p-4 flex-1 flex flex-col">
        {product.brand && (
          <div className="text-xs text-muted-foreground font-medium mb-1 uppercase tracking-wider">
            {product.brand}
          </div>
        )}
        <Link href={href}>
          <h3 className="font-semibold line-clamp-2 mb-2 group-hover:text-primary transition-colors text-sm leading-snug">
            {product.name}
          </h3>
        </Link>
        <div className="mt-auto pt-3">
          <span className="text-base font-bold">৳{price.toLocaleString()}</span>
          {compareAt && (
            <span className="ml-2 text-sm text-muted-foreground line-through">
              ৳{compareAt.toLocaleString()}
            </span>
          )}
        </div>
      </CardContent>
      <div className="px-4 pb-4">
        {action === "add" ? (
          <AddToCartButton
            product={{
              id: product.id,
              name: product.name,
              price,
              image: product.image,
              slug: product.slug,
            }}
            className="w-full"
            variant="secondary"
            size="sm"
          />
        ) : (
          <Link href={href} className="block">
            <Button className="w-full" variant="secondary" size="sm">
              View Details
            </Button>
          </Link>
        )}
      </div>
    </Card>
  );
}

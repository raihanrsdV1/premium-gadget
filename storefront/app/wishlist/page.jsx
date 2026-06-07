import WishlistView from "@/components/wishlist/WishlistView";

export const metadata = {
  title: "My Wishlist",
  robots: { index: false },
};

export default function WishlistPage() {
  return <WishlistView />;
}

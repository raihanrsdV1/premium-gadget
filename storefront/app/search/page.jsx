import { searchProducts } from "@/lib/api/products";
import SearchView from "@/components/search/SearchView";

// Search result pages should not be indexed.
export async function generateMetadata({ searchParams }) {
  const sp = await searchParams;
  const q = (sp.q || "").trim();
  return {
    title: q ? `Search: ${q}` : "Search",
    robots: { index: false, follow: true },
  };
}

export default async function SearchPage({ searchParams }) {
  const sp = await searchParams;
  const q = (sp.q || "").trim();

  let initialResults = [];
  if (q.length >= 2) {
    try {
      initialResults = (await searchProducts(q)).data;
    } catch {
      initialResults = [];
    }
  }

  return <SearchView initialQuery={q} initialResults={initialResults} />;
}

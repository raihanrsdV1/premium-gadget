export const generateProductJsonLd = (product) => {
  if (!product) return null;
  return {
    "@context": "https://schema.org/",
    "@type": "Product",
    "name": product.name,
    "description": product.short_description,
    "sku": product.variants?.[0]?.sku,
    "brand": {
      "@type": "Brand",
      "name": product.brand?.name
    },
    "offers": {
      "@type": "Offer",
      "url": window.location.href,
      "priceCurrency": "BDT",
      "price": product.variants?.[0]?.price,
      "itemCondition": product.condition === 'new' ? "https://schema.org/NewCondition" : "https://schema.org/UsedCondition",
      "availability": "https://schema.org/InStock"
    }
  };
};

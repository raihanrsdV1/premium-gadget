import "./globals.css";
import StoreProvider from "@/store/StoreProvider";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

export const metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Premium Gadget — Laptops, Gadgets & Repair in Bangladesh",
    template: "%s · Premium Gadget",
  },
  description:
    "Bangladesh's most trusted destination for premium laptops, accessories, and expert repair services.",
  openGraph: {
    type: "website",
    siteName: "Premium Gadget",
    title: "Premium Gadget — Laptops, Gadgets & Repair in Bangladesh",
    description:
      "Bangladesh's most trusted destination for premium laptops, accessories, and expert repair services.",
    url: SITE_URL,
    locale: "en_US",
  },
};

const organizationJsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "Premium Gadget",
  url: SITE_URL,
  description:
    "Bangladesh's most trusted destination for premium laptops, accessories, and expert repair services.",
  address: {
    "@type": "PostalAddress",
    streetAddress: "Level 4, Multiplan Center, Elephant Road",
    addressLocality: "Dhaka",
    addressCountry: "BD",
  },
  contactPoint: {
    "@type": "ContactPoint",
    telephone: "+880-1711-000000",
    contactType: "customer service",
    email: "support@premiumgadget.com.bd",
  },
};

const websiteJsonLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "Premium Gadget",
  url: SITE_URL,
  potentialAction: {
    "@type": "SearchAction",
    target: {
      "@type": "EntryPoint",
      urlTemplate: `${SITE_URL}/search?q={search_term_string}`,
    },
    "query-input": "required name=search_term_string",
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="min-h-screen flex flex-col font-sans antialiased text-foreground bg-background">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd) }}
        />
        <StoreProvider>
          <Header />
          <main className="flex-1">{children}</main>
          <Footer />
        </StoreProvider>
      </body>
    </html>
  );
}

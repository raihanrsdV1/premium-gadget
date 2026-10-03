import LiveBackground from "@/components/ui/LiveBackground";
import "./globals.css";
import { DM_Sans, Sora } from "next/font/google";
import StoreProvider from "@/store/StoreProvider";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import AnnouncementBar from "@/components/layout/AnnouncementBar";
import WhatsAppFloat from "@/components/layout/WhatsAppFloat";
import { getMenu, getSettings } from "@/lib/api/server";
import JsonLd from "@/components/seo/JsonLd";
import { SITE, postalAddressJsonLd, branchesJsonLd, organizationId } from "@/lib/site";
import { DEFAULT_DESCRIPTION, SITE_URL } from "@/lib/seo";

const dmSans = DM_Sans({ subsets: ["latin"], variable: "--font-dm-sans", display: "swap" });
const sora = Sora({ subsets: ["latin"], variable: "--font-sora", display: "swap", weight: ["600", "700", "800"] });

// Site-wide defaults. Every indexable page sets its own canonical, Open Graph
// and Twitter tags (lib/seo pageMetadata); there's deliberately no canonical
// here, or pages without one would all claim to be the home page.
export const metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Premium Gadget — New & Used Laptops in Chattogram, Bangladesh",
    template: "%s · Premium Gadget",
  },
  description: DEFAULT_DESCRIPTION,
  applicationName: SITE.name,
  openGraph: {
    type: "website",
    siteName: SITE.name,
    title: "Premium Gadget — New & Used Laptops in Chattogram, Bangladesh",
    description: DEFAULT_DESCRIPTION,
    locale: "en_BD",
  },
  twitter: { card: "summary_large_image" },
};

export const viewport = {
  themeColor: SITE.themeColor,
};

const logoUrl = `${SITE_URL}${SITE.logoPath}`;

const organizationJsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  "@id": organizationId(SITE_URL),
  name: SITE.name,
  url: SITE_URL,
  logo: {
    "@type": "ImageObject",
    url: logoUrl,
    width: SITE.logoSize.width,
    height: SITE.logoSize.height,
  },
  image: logoUrl,
  description: DEFAULT_DESCRIPTION,
  address: postalAddressJsonLd,
  telephone: SITE.phoneE164,
  sameAs: [SITE.facebookUrl],
  contactPoint: {
    "@type": "ContactPoint",
    telephone: SITE.phoneE164,
    contactType: "customer service",
    areaServed: "BD",
    availableLanguage: ["en", "bn"],
  },
  department: branchesJsonLd(SITE_URL),
};

const websiteJsonLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  "@id": `${SITE_URL}/#website`,
  name: SITE.name,
  url: SITE_URL,
  publisher: { "@id": organizationId(SITE_URL) },
  inLanguage: "en-BD",
  potentialAction: {
    "@type": "SearchAction",
    target: {
      "@type": "EntryPoint",
      urlTemplate: `${SITE_URL}/search?q={search_term_string}`,
    },
    "query-input": "required name=search_term_string",
  },
};

export default async function RootLayout({ children }) {
  // Cached, tagged reads; either may be null and the shell still renders.
  const [menu, settings] = await Promise.all([getMenu(), getSettings()]);
  return (
    <html lang="en" className={`${dmSans.variable} ${sora.variable}`} suppressHydrationWarning>
      <head>
        {/* Applies the saved/system theme before first paint (no flash). Same-origin file: no CSP change needed. */}
        {/* eslint-disable-next-line @next/next/no-sync-scripts */}
        <script src="/theme-init.js" />
      </head>
      <body className="min-h-screen flex flex-col font-sans antialiased text-foreground">
        <JsonLd data={organizationJsonLd} />
        <JsonLd data={websiteJsonLd} />
        <StoreProvider>
          <LiveBackground />
          <AnnouncementBar announcement={settings?.announcement} />
          <Header menu={menu} />
          <main className="flex-1">{children}</main>
          <Footer />
          <WhatsAppFloat />
        </StoreProvider>
      </body>
    </html>
  );
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allow remote product images (Unsplash seed data + future CDNs) if we adopt
  // next/image later. We currently use plain <img>, so this is a no-op for now.
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'images.unsplash.com' },
    ],
  },
};

export default nextConfig;

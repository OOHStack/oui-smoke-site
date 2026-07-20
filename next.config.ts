import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: "/index.html",
        destination: "/",
        permanent: true,
      },
      {
        source: "/privacy.html",
        destination: "/privacy",
        permanent: true,
      },
      {
        source: "/terms.html",
        destination: "/terms",
        permanent: true,
      },
      {
        source: "/accessibility.html",
        destination: "/accessibility",
        permanent: true,
      },
      {
        source: "/promo.html",
        destination: "/promo",
        permanent: true,
      },
      // Retired SEO marketing pages → homepage
      { source: "/hookah-catering-toronto", destination: "/", permanent: true },
      { source: "/how-it-works", destination: "/", permanent: true },
      { source: "/service-areas", destination: "/", permanent: true },
      { source: "/packages", destination: "/", permanent: true },
      { source: "/faq", destination: "/", permanent: true },
      { source: "/about", destination: "/", permanent: true },
      { source: "/guides", destination: "/", permanent: true },
      { source: "/guides/:path*", destination: "/", permanent: true },
      { source: "/services", destination: "/", permanent: true },
      { source: "/services/:path*", destination: "/", permanent: true },
    ];
  },
  async rewrites() {
    return [
      { source: "/promo", destination: "/promo.html" },
      { source: "/privacy", destination: "/privacy.html" },
      { source: "/terms", destination: "/terms.html" },
      { source: "/accessibility", destination: "/accessibility.html" },
    ];
  },
};

export default nextConfig;

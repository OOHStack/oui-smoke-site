import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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

import type { MetadataRoute } from "next";

const SITE_URL = "https://ouismoke.co";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/admin",
          "/admin/",
          "/api/",
          "/serve/",
          "/client/",
          "/pay/",
          "/demo/",
          "/demo",
          "/display/",
          "/prep/",
          "/partner/playbook",
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}

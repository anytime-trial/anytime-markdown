import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/markdown", "/press", "/privacy"],
      disallow: ["/api/"],
    },
    sitemap: `${process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.anytime-trial.com"}/sitemap.xml`,
  };
}

import type { MetadataRoute } from "next";

import { fetchLayoutData } from "../lib/s3Client";

const BASE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://anytime-markdown.vercel.app";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticPages: MetadataRoute.Sitemap = [
    { url: BASE_URL, lastModified: new Date(), changeFrequency: "monthly", priority: 1 },
    { url: `${BASE_URL}/markdown`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.9 },
    { url: `${BASE_URL}/docs`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.6 },
    { url: `${BASE_URL}/privacy`, lastModified: new Date(), changeFrequency: "yearly", priority: 0.3 },
  ];

  try {
    const layout = await fetchLayoutData();
    const docPages: MetadataRoute.Sitemap = layout.categories.flatMap((cat) => cat.items).map((item) => ({
      url: `${BASE_URL}/docs/view?key=${encodeURIComponent(item.docKey)}`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.5,
    }));

    return [...staticPages, ...docPages];
  } catch {
    return staticPages;
  }
}

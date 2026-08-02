import type { MetadataRoute } from "next";

import { listReports } from "../lib/reportClient";
import { fetchLayoutData } from "../lib/s3Client";

const BASE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.anytime-trial.com";

// SHORTCUT: 静的ページ・ドキュメントページの lastModified をモジュールロード時刻（≒デプロイ時刻）で固定する.
// ceiling: 個々のページの実更新日は反映されず、デプロイのたびに一律で更新扱いになる.
// upgrade: S3 オブジェクトの LastModified をレイアウトデータへ載せられたら実データへ差し替える.
const DEPLOYED_AT = new Date();

/**
 * 公開ルートのみを列挙する。
 * noindex のルート（/trail /graph /database /sheet /cooccurrence /tickets /docs/edit /auth/error）は
 * 掲載しない。noindex ページのサイトマップ掲載は検索エンジンへの矛盾シグナルになる。
 * /docs は app/docs/ 直下に page.tsx が無く 404 になるため掲載しない。
 */
const STATIC_PAGES: MetadataRoute.Sitemap = [
  { url: BASE_URL, lastModified: DEPLOYED_AT, changeFrequency: "monthly", priority: 1 },
  { url: `${BASE_URL}/markdown`, lastModified: DEPLOYED_AT, changeFrequency: "monthly", priority: 0.9 },
  { url: `${BASE_URL}/report`, lastModified: DEPLOYED_AT, changeFrequency: "weekly", priority: 0.8 },
  { url: `${BASE_URL}/privacy`, lastModified: DEPLOYED_AT, changeFrequency: "yearly", priority: 0.3 },
  { url: `${BASE_URL}/privacy/services`, lastModified: DEPLOYED_AT, changeFrequency: "yearly", priority: 0.3 },
];

/** frontmatter の date は自由入力なので、パースできない場合はデプロイ時刻へ縮退する */
function parseArticleDate(date: string | undefined): Date {
  if (!date) return DEPLOYED_AT;
  const parsed = new Date(date);
  return Number.isNaN(parsed.getTime()) ? DEPLOYED_AT : parsed;
}

async function buildDocPages(): Promise<MetadataRoute.Sitemap> {
  const layout = await fetchLayoutData();
  return layout.categories
    .flatMap((cat) => cat.items)
    .map((item) => ({
      url: `${BASE_URL}/docs/view?key=${encodeURIComponent(item.docKey)}`,
      lastModified: DEPLOYED_AT,
      changeFrequency: "weekly" as const,
      priority: 0.5,
    }));
}

async function buildReportPages(): Promise<MetadataRoute.Sitemap> {
  const reports = await listReports();
  return reports.map((report) => ({
    url: `${BASE_URL}/report/${report.slug}`,
    lastModified: parseArticleDate(report.date),
    changeFrequency: "monthly" as const,
    priority: 0.7,
  }));
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // 片方の取得が失敗しても、もう片方は掲載を続ける（記事とドキュメントは独立した供給源）
  const [docResult, reportResult] = await Promise.allSettled([
    buildDocPages(),
    buildReportPages(),
  ]);

  const dynamicPages: MetadataRoute.Sitemap = [];
  for (const [source, result] of [
    ["docs", docResult],
    ["reports", reportResult],
  ] as const) {
    if (result.status === "fulfilled") {
      dynamicPages.push(...result.value);
    } else {
      const reason: unknown = result.reason;
      console.warn(
        `[${new Date().toISOString()}] [WARN] [sitemap] failed to build ${source} entries:`,
        reason instanceof Error ? reason.stack : reason,
      );
    }
  }

  return [...STATIC_PAGES, ...dynamicPages];
}

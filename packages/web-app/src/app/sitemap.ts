import type { MetadataRoute } from "next";

import { routing } from "../i18n/routing";
import { localeHref } from "../lib/localeAlternates";
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
const STATIC_ROUTES = [
  { path: "/", changeFrequency: "monthly" as const, priority: 1 },
  { path: "/markdown", changeFrequency: "monthly" as const, priority: 0.9 },
  { path: "/report", changeFrequency: "weekly" as const, priority: 0.8 },
  { path: "/privacy", changeFrequency: "yearly" as const, priority: 0.3 },
  { path: "/privacy/services", changeFrequency: "yearly" as const, priority: 0.3 },
];

/**
 * 1 つのパスを全ロケール分の URL へ展開する。
 * 各エントリに `alternates.languages` を付けないと、検索エンジンは ja 版と en 版を
 * 別々の独立したページとして扱い、対応関係を認識しない。
 */
function expandLocales(
  path: string,
  entry: { lastModified: Date; changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"]; priority: number },
): MetadataRoute.Sitemap {
  // localeHref('/', 'ja') は '/' を返すため、そのまま連結するとルートだけ末尾スラッシュが付く
  const absolute = (locale: (typeof routing.locales)[number]) => {
    const href = localeHref(path, locale);
    return href === "/" ? BASE_URL : `${BASE_URL}${href}`;
  };

  const languages: Record<string, string> = {};
  for (const locale of routing.locales) {
    languages[locale] = absolute(locale);
  }

  return routing.locales.map((locale) => ({
    url: absolute(locale),
    lastModified: entry.lastModified,
    changeFrequency: entry.changeFrequency,
    priority: entry.priority,
    alternates: { languages },
  }));
}

const STATIC_PAGES: MetadataRoute.Sitemap = STATIC_ROUTES.flatMap((route) =>
  expandLocales(route.path, {
    lastModified: DEPLOYED_AT,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }),
);

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
    .flatMap((item) =>
      expandLocales(`/docs/view?key=${encodeURIComponent(item.docKey)}`, {
        lastModified: DEPLOYED_AT,
        changeFrequency: "weekly",
        priority: 0.5,
      }),
    );
}

async function buildReportPages(): Promise<MetadataRoute.Sitemap> {
  const reports = await listReports();
  return reports.flatMap((report) =>
    expandLocales(`/report/${report.slug}`, {
      lastModified: parseArticleDate(report.date),
      changeFrequency: "monthly",
      priority: 0.7,
    }),
  );
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

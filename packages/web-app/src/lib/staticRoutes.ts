import type { MetadataRoute } from "next";

import { TOPIC_SLUGS, topicPath } from "../app/[locale]/markdown/topics";

/**
 * 検索エンジンへ公開する静的ルートの単一の正。
 *
 * `sitemap.ts`（掲載）と `robots.ts`（allow）が同じ一覧を主張するため、ここを唯一の
 * 出どころにする。両者へ別々にリテラルを置くと、片方だけ更新しても**どちらも壊れない**
 * ため乖離が失敗として現れない（`allow` は `disallow` に対してのみ意味を持つので、
 * robots へ書き忘れたパスもクロールはされ続ける）。実際 2026-08-03 に記法別 LP 5 本を
 * sitemap へ足したとき robots 側が取り残された。
 *
 * noindex のルート（/trail /graph /database /sheet /cooccurrence /tickets /docs/edit
 * /auth/error）は載せない。noindex ページの sitemap 掲載は検索エンジンへの矛盾シグナルに
 * なる。`/docs` は `app/docs/` 直下に page.tsx が無く 404 になるため載せない。
 */
export interface StaticRoute {
  readonly path: string;
  readonly changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"];
  readonly priority: number;
}

export const STATIC_ROUTES: readonly StaticRoute[] = [
  { path: "/", changeFrequency: "monthly", priority: 1 },
  { path: "/markdown", changeFrequency: "monthly", priority: 0.9 },
  // 記法別 LP。ja / en の両方に本文があるため両ロケールを掲載する
  ...TOPIC_SLUGS.map((slug) => ({
    path: topicPath(slug),
    changeFrequency: "monthly" as const,
    priority: 0.7,
  })),
  { path: "/report", changeFrequency: "weekly", priority: 0.8 },
  { path: "/privacy", changeFrequency: "yearly", priority: 0.3 },
  { path: "/privacy/services", changeFrequency: "yearly", priority: 0.3 },
];

/**
 * 本文が日本語のみの静的ルート。
 *
 * `STATIC_ROUTES` と分けるのは掲載の仕方が違うため。あちらは 1 パスを全ロケールへ展開して
 * `alternates.languages` で対応関係を申告するが、本文が 1 言語しか無いページで同じことを
 * すると、同一内容を 2 URL で重複申告することになる。こちらは ja の 1 URL だけを載せ、
 * HTML 側は `buildSingleSourceAlternates` が canonical を ja へ向ける。
 */
export const SINGLE_SOURCE_ROUTES: readonly StaticRoute[] = [
  { path: "/timeline", changeFrequency: "weekly", priority: 0.6 },
];

/** ロケールプレフィックスを含まないパスの一覧（robots の allow はここから展開する） */
export const STATIC_ROUTE_PATHS: readonly string[] = STATIC_ROUTES.map((route) => route.path);

/** 単一言語ルートのパス一覧（robots では既定ロケールの 1 URL だけを allow する） */
export const SINGLE_SOURCE_ROUTE_PATHS: readonly string[] = SINGLE_SOURCE_ROUTES.map(
  (route) => route.path,
);

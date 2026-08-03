import type { MetadataRoute } from "next";

import { routing } from "../i18n/routing";
import { localeHref } from "../lib/localeAlternates";
import { STATIC_ROUTE_PATHS } from "../lib/staticRoutes";

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.anytime-trial.com";

/**
 * 検索エンジンへ公開するルート。sitemap.ts と同じ `lib/staticRoutes` から導出する
 * （両者へ別々にリテラルを置くと、片方だけ更新しても壊れないまま乖離する）。
 * sitemap は 1 ルートを全ロケール分の URL へ展開するため、こちらも同じ展開をかける
 * （ja は非プレフィックス・en は /en 配下）。
 */
const PUBLIC_PATHS = STATIC_ROUTE_PATHS.flatMap(
  (path) => routing.locales.map((locale) => localeHref(path, locale)),
);

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: PUBLIC_PATHS,
      // Why not: 内部ツール（/trail /graph /database /sheet /cooccurrence /tickets /docs/edit /auth）を
      // ここで disallow しない。robots.txt で crawl を止めると noindex メタタグ自体が読まれず、
      // 被リンク経由で URL だけが検索結果に残る。noindex は各ルートの metadata 側で指定する。
      disallow: ["/api/"],
    },
    sitemap: `${BASE_URL}/sitemap.xml`,
  };
}

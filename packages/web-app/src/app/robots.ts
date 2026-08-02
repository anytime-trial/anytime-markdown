import type { MetadataRoute } from "next";

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.anytime-trial.com";

/** 検索エンジンへ公開するルート。sitemap.ts の静的ページと 1 対 1 で対応させる。 */
const PUBLIC_PATHS = ["/", "/markdown", "/report", "/privacy", "/privacy/services"];

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

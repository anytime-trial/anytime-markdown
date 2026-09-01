import { NextRequest, NextResponse } from "next/server";
import createMiddleware from "next-intl/middleware";

import { routing } from "./i18n/routing";

const handleI18nRouting = createMiddleware(routing);

/**
 * パスをロケールプレフィックスと残りへ分ける（`/en/docs/edit` → `/en` + `/docs/edit`）。
 *
 * Why not: 剥がした後のパスとの長さの差分でプレフィックスを逆算しない。
 * `/en` → `/` のように長さが 1 対 1 で対応しない入力があり、算術が経路依存で壊れる。
 */
function splitLocalePrefix(pathname: string): { prefix: string; rest: string } {
  for (const locale of routing.locales) {
    if (pathname === `/${locale}`) return { prefix: `/${locale}`, rest: "/" };
    if (pathname.startsWith(`/${locale}/`)) {
      return { prefix: `/${locale}`, rest: pathname.slice(locale.length + 1) };
    }
  }
  return { prefix: "", rest: pathname };
}

export function proxy(request: NextRequest) {
  // 本番環境では /docs/edit へのアクセスを /docs/view にリダイレクト。
  // ロケールプレフィックス付き（/en/docs/edit）も同じ扱いにするためプレフィックスを剥がして判定し、
  // リダイレクト先は同じロケールに留める。
  const pathname = request.nextUrl.pathname;
  const { prefix: localePrefix, rest: unprefixed } = splitLocalePrefix(pathname);
  if (
    unprefixed.startsWith("/docs/edit") &&
    process.env.NEXT_PUBLIC_ENABLE_DOCS_EDIT !== "true"
  ) {
    // クエリは引き継ぐ（?key=... を落とすと閲覧側で対象ドキュメントを失う）
    return NextResponse.redirect(
      new URL(`${localePrefix}/docs/view${request.nextUrl.search}`, request.url),
    );
  }

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");

  const isDev = process.env.NODE_ENV === "development";
  // Web 取り込み機能の取得先プロキシ（mcp-cms-remote /fetch）への connect を許可する。
  // 値はオリジンのみに正規化し、未設定なら追加しない。
  const webImportConnectSrc = (() => {
    const raw = process.env.NEXT_PUBLIC_WEB_IMPORT_PROXY_URL;
    if (!raw) return "";
    try {
      return " " + new URL(raw).origin;
    } catch {
      return "";
    }
  })();
  const cspHeader = [
    "default-src 'self'",
    // apis.google.com: Google Picker（Drive から開く）のローダ script
    `script-src 'self' 'nonce-${nonce}'${isDev ? " 'unsafe-eval'" : ""} https://www.googletagmanager.com https://platform.twitter.com https://apis.google.com`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    // Markdown エディタでユーザーが任意の HTTPS 画像を埋め込めるよう広めに許可する
    "img-src 'self' data: blob: https:",
    "font-src 'self' data: https://fonts.gstatic.com",
    `connect-src 'self' https://www.plantuml.com https://www.google-analytics.com https://region1.google-analytics.com https://www.googletagmanager.com https://platform.twitter.com https://apis.google.com https://www.googleapis.com${process.env.NEXT_PUBLIC_SUPABASE_URL ? " " + process.env.NEXT_PUBLIC_SUPABASE_URL : ""}${webImportConnectSrc}`,
    "worker-src 'self' blob:",
    // docs.google.com: Google Picker のファイル選択 UI は iframe で描画される
    // travel.anytime-trial.com: ランディングの街道マップ紹介欄が本番アプリをプレビュー埋め込みする
    "frame-src 'self' https://www.youtube.com https://www.youtube-nocookie.com https://youtube.com https://www.figma.com https://embed.figma.com https://open.spotify.com https://platform.twitter.com https://viewer.diagrams.net https://app.diagrams.net https://docs.google.com https://drive.google.com https://travel.anytime-trial.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", cspHeader);

  // ロケール解決（rewrite / redirect）は next-intl に委ね、その応答へ CSP を載せる。
  // NextResponse.next() を自前で返すとロケールの書き換えが打ち消されるため、
  // x-nonce はヘッダを差し替えた Request として next-intl へ渡す。
  const response = handleI18nRouting(
    new NextRequest(request, { headers: requestHeaders }),
  );
  response.headers.set("Content-Security-Policy", cspHeader);

  return response;
}

export const config = {
  matcher: [
    {
      // robots.txt / sitemap.xml / opengraph-image / twitter-image は app 直下の
      // 特殊ファイルで、public/ 配下のアセット（icon.svg・images/**・sql/**.wasm）は
      // ロケールを持たない。除外しないと next-intl がロケール配下へ書き換えてしまい
      // 404 になる（middleware が rewrite する前は素通りしていたため、除外漏れが
      // 実害になるのはロケール書き換えを足した以降）。
      // Why not: 個別ファイル名を列挙しない。public/ にファイルを足すたびに再発する。
      // 拡張子の一覧で一括除外する（コンテンツのパスは拡張子を持たないため衝突しない）。
      source:
        "/((?!api|_next/static|_next/image|swe-worker|workbox|opengraph-image|twitter-image|.*\\.(?:ico|png|jpe?g|gif|svg|webp|avif|json|txt|xml|js|mjs|css|map|wasm|woff2?|ttf|md|webmanifest)$).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};

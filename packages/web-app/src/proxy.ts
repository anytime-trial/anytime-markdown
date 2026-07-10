import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export function proxy(request: NextRequest) {
  // 本番環境では /docs/edit へのアクセスを /docs/view にリダイレクト
  if (
    request.nextUrl.pathname.startsWith("/docs/edit") &&
    process.env.NEXT_PUBLIC_ENABLE_DOCS_EDIT !== "true"
  ) {
    return NextResponse.redirect(new URL("/docs/view", request.url));
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
    "frame-src 'self' https://www.youtube.com https://www.youtube-nocookie.com https://youtube.com https://www.figma.com https://embed.figma.com https://open.spotify.com https://platform.twitter.com https://viewer.diagrams.net https://app.diagrams.net https://docs.google.com https://drive.google.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", cspHeader);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });
  response.headers.set("Content-Security-Policy", cspHeader);

  return response;
}

export const config = {
  matcher: [
    {
      source:
        "/((?!api|_next/static|_next/image|favicon\\.ico|icons|manifest\\.json|sw\\.js|swe-worker|workbox).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};

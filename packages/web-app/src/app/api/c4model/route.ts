import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { fetchC4Model } from "@anytime-markdown/trail-core/c4";
import { SupabaseC4ModelStore } from "@anytime-markdown/trail-viewer/supabase";

import { resolveSupabaseEnv } from "../../../lib/supabase-env";

/**
 * GET /api/c4model?release=...&repo=...
 *
 * C4モデルデータを返す。データソースの優先順位:
 *   1. Supabase (C4_SOURCE=supabase かつ SUPABASE_URL/SUPABASE_ANON_KEY 設定時)
 *      - trail-core の fetchC4Model + SupabaseC4ModelStore 経由で取得する
 *      - release='current' の場合、repo クエリで該当リポジトリの current を返す
 *   2. GitHub API (DOCS_GITHUB_REPO 設定時) — release='current' のみ対応
 *
 * 環境変数:
 *   C4_SOURCE          — "supabase" | "github" (デフォルト: "github")
 *   SUPABASE_URL       — Supabase プロジェクト URL
 *   SUPABASE_ANON_KEY  — Supabase anon key
 *   DOCS_GITHUB_REPO   — "owner/repo" 形式または "https://github.com/owner/repo" 形式
 *   DOCS_GITHUB_TOKEN  — PAT（private repo 用、省略可）
 */

const CACHE_MAX_AGE = 300; // 5 min
const FILE_PATH = "c4model/c4-model.json";

function extractOwnerRepo(value: string): string | null {
  const urlMatch = /github\.com\/([^/]+\/[^/]+)\/?$/.exec(value);
  if (urlMatch) return urlMatch[1];
  if (/^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/.test(value)) return value;
  return null;
}

interface GitHubBlobResponse {
  content?: string;
  encoding?: string;
}

const cachedDataByKey = new Map<string, { json: unknown; expiresAt: number }>();

export async function GET(request: NextRequest): Promise<NextResponse> {
  const release = request.nextUrl.searchParams.get("release") ?? "current";
  const repo = request.nextUrl.searchParams.get("repo") ?? undefined;

  // Try Supabase first if configured
  const c4Source = process.env.C4_SOURCE ?? "github";
  if (c4Source === "supabase") {
    const env = resolveSupabaseEnv();
    if (env) {
      try {
        const store = new SupabaseC4ModelStore(env.url, env.anonKey);
        const payload = await fetchC4Model(store, release, repo);
        if (payload) {
          return NextResponse.json(payload, {
            headers: { "Cache-Control": `public, max-age=${CACHE_MAX_AGE}` },
          });
        }
        if (release !== "current") {
          return NextResponse.json(
            { error: `C4 model for release '${release}' not found` },
            { status: 404 },
          );
        }
      } catch {
        // Fall through to GitHub
      }
    }
  }

  // GitHub fallback only supports current
  if (release !== "current") {
    return NextResponse.json(
      { error: "Historical C4 models require Supabase backend" },
      { status: 404 },
    );
  }

  const repoRaw = process.env.DOCS_GITHUB_REPO;
  if (!repoRaw) {
    return NextResponse.json(
      { error: "DOCS_GITHUB_REPO is not configured" },
      { status: 404 },
    );
  }

  const repoSlug = extractOwnerRepo(repoRaw);
  if (!repoSlug) {
    return NextResponse.json(
      { error: "DOCS_GITHUB_REPO is invalid" },
      { status: 500 },
    );
  }

  const cacheKey = `${release}:${repo ?? ""}`;
  const cached = cachedDataByKey.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) {
    return NextResponse.json(cached.json, {
      headers: { "Cache-Control": `public, max-age=${CACHE_MAX_AGE}` },
    });
  }

  const token = process.env.DOCS_GITHUB_TOKEN;
  const headers: Record<string, string> = {
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "anytime-markdown-web-app",
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(
    `https://api.github.com/repos/${encodeURI(repoSlug)}/contents/${encodeURI(FILE_PATH)}?ref=main`,
    { headers, next: { revalidate: CACHE_MAX_AGE } },
  );

  if (!res.ok) {
    return NextResponse.json(
      { error: "Failed to fetch c4-model.json from GitHub" },
      { status: res.status },
    );
  }

  const blob = (await res.json()) as GitHubBlobResponse;
  if (!blob.content) {
    return NextResponse.json(
      { error: "Empty content returned from GitHub" },
      { status: 502 },
    );
  }

  const raw = Buffer.from(blob.content, "base64").toString("utf-8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON in c4-model.json" },
      { status: 502 },
    );
  }

  cachedDataByKey.set(cacheKey, { json: parsed, expiresAt: Date.now() + CACHE_MAX_AGE * 1000 });

  return NextResponse.json(parsed, {
    headers: { "Cache-Control": `public, max-age=${CACHE_MAX_AGE}` },
  });
}

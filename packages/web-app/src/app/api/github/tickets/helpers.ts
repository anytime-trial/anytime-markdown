import { NextResponse } from "next/server";

import {
  TicketApiError,
  TicketConflictError,
  type FrontmatterValue,
} from "@anytime-markdown/tickets-core";

import { validateGitHubRepo } from "../../../../lib/fetchWithRetry";
import { getGitHubToken } from "../../../../lib/githubAuth";

export function ticketErrorResponse(error: unknown): NextResponse {
  if (error instanceof TicketConflictError) {
    return NextResponse.json({ error: error.message, conflict: true }, { status: 409 });
  }
  if (error instanceof TicketApiError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  console.error(
    `[${new Date().toISOString()}] [ERROR] /api/github/tickets:`,
    error instanceof Error ? error.stack : error,
  );
  return NextResponse.json({ error: "Internal error" }, { status: 500 });
}

export interface RepoParams {
  token: string;
  repo: string;
  branch: string;
}

/** 認証（401）とリポジトリ/ブランチ検証（400）の共通ガード */
export async function resolveRepoParams(
  repo: string | null,
  branch: string | null,
): Promise<RepoParams | NextResponse> {
  const token = await getGitHubToken();
  if (!token) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (!repo || !validateGitHubRepo(repo) || !branch) {
    return NextResponse.json({ error: "Invalid or missing repo/branch" }, { status: 400 });
  }
  return { token, repo, branch };
}

// frontmatter は 1 行 1 スカラーの自前フォーマットのため、キー / 値に制御文字（改行等）が入ると
// 別キー・別行を注入できる。パーサのキー規則に合わないキー・制御文字を含む値はここで落とす。
const SAFE_EXTRA_KEY_RE = /^[A-Za-z_][\w-]*$/;
const CONTROL_CHARS_RE = new RegExp("[\\u0000-\\u001f]");

function hasControlChars(value: string | string[]): boolean {
  return Array.isArray(value)
    ? value.some((item) => CONTROL_CHARS_RE.test(item))
    : CONTROL_CHARS_RE.test(value);
}

/** クライアント由来の未知キーを FrontmatterValue に絞り込む（型不明値・frontmatter 注入の混入防止） */
export function sanitizeExtras(raw: unknown): Record<string, FrontmatterValue> {
  const extras: Record<string, FrontmatterValue> = {};
  if (typeof raw !== "object" || raw === null) {
    return extras;
  }
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!SAFE_EXTRA_KEY_RE.test(key)) {
      continue;
    }
    if (typeof value === "number") {
      extras[key] = value;
    } else if (typeof value === "string" && !hasControlChars(value)) {
      extras[key] = value;
    } else if (
      Array.isArray(value) &&
      value.every((item) => typeof item === "string") &&
      !hasControlChars(value as string[])
    ) {
      extras[key] = value as string[];
    }
  }
  return extras;
}

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

/** クライアント由来の未知キーを FrontmatterValue に絞り込む（型不明値の混入防止） */
export function sanitizeExtras(raw: unknown): Record<string, FrontmatterValue> {
  const extras: Record<string, FrontmatterValue> = {};
  if (typeof raw !== "object" || raw === null) {
    return extras;
  }
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === "string" || typeof value === "number") {
      extras[key] = value;
    } else if (Array.isArray(value) && value.every((item) => typeof item === "string")) {
      extras[key] = value as string[];
    }
  }
  return extras;
}

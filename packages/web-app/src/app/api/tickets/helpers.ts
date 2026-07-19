import { NextResponse } from "next/server";

import {
  createTicketProvider,
  isTicketProviderKind,
  type TicketProvider,
} from "@anytime-markdown/tickets-core";

import { fetchWithRetry, validateGitHubRepo } from "../../../lib/fetchWithRetry";
import { getGitHubToken } from "../../../lib/githubAuth";

// 互換期間中（旧 /api/github/tickets ルートの併存中）の共有正本は旧位置に置く。旧ルート削除時に本体をこちらへ移す。
export { sanitizeExtras, ticketErrorResponse } from "../github/tickets/helpers";

/**
 * 認証（401）・リポジトリ/ブランチ/プロバイダ検証（400）の共通ガード。
 * `provider` は enum（NFR-7 の切替ポイント）。省略時は既定の `github-contents`。
 */
export async function resolveTicketProvider(
  repo: string | null,
  branch: string | null,
  provider: string | null,
): Promise<TicketProvider | NextResponse> {
  const token = await getGitHubToken();
  if (!token) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const kind = provider ?? "github-contents";
  if (!isTicketProviderKind(kind)) {
    return NextResponse.json({ error: `Invalid provider: ${kind}` }, { status: 400 });
  }
  if (!repo || !validateGitHubRepo(repo)) {
    return NextResponse.json({ error: "Invalid or missing repo" }, { status: 400 });
  }
  if (kind === "github-contents") {
    if (!branch) {
      return NextResponse.json({ error: "Invalid or missing branch" }, { status: 400 });
    }
    return createTicketProvider({ provider: kind, token, repo, branch, fetchFn: fetchWithRetry });
  }
  return createTicketProvider({ provider: kind, token, repo, fetchFn: fetchWithRetry });
}

/** body から repo / branch / provider を取り出して resolveTicketProvider へ渡す */
export async function resolveTicketProviderFromBody(
  body: Record<string, unknown>,
): Promise<TicketProvider | NextResponse> {
  return resolveTicketProvider(
    typeof body.repo === "string" ? body.repo : null,
    typeof body.branch === "string" ? body.branch : null,
    typeof body.provider === "string" ? body.provider : null,
  );
}

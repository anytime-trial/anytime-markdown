import { isTicketProviderKind } from '@anytime-markdown/tickets-core';

import type { TicketsConfig } from './server';

/**
 * `resolveTicketsConfig` が読む環境変数。
 *
 * Why not: `index.ts` の `Env` 全体を受け取らない。`index.ts` は Hono を読み込むため
 * jest から import できず、そこに置いたままではこの解決ロジックを直接テストできない。
 */
export interface TicketsEnv {
  TICKETS_GITHUB_TOKEN?: string;
  TICKETS_REPO?: string;
  TICKETS_BRANCH?: string;
  TICKETS_PROVIDER?: string;
}

/** 環境変数からチケットプロバイダ設定を組み立てる。不正な TICKETS_PROVIDER は登録せずエラーログを残す */
export function resolveTicketsConfig(env: TicketsEnv): TicketsConfig | undefined {
  if (!env.TICKETS_GITHUB_TOKEN || !env.TICKETS_REPO) {
    return undefined;
  }
  // 空文字 secret（CI の変数未設定など）も既定へ倒すため ?? でなく || を使う
  const kind = env.TICKETS_PROVIDER || 'github-contents';
  if (!isTicketProviderKind(kind)) {
    console.error(
      `[${new Date().toISOString()}] [ERROR] TICKETS_PROVIDER が不正なため create_ticket を無効化します: ${kind}`,
    );
    return undefined;
  }
  // local-git はローカルクローンのファイルシステムを直接扱う方式で、Workers 上には
  // 当該クローンが存在しない。enum に含まれるため isTicketProviderKind は通ってしまい、
  // 明示的に弾かないと無言で github-contents として動く。
  if (kind === 'local-git') {
    console.error(
      `[${new Date().toISOString()}] [ERROR] TICKETS_PROVIDER=local-git は Workers では利用できないため create_ticket を無効化します`,
    );
    return undefined;
  }
  if (kind === 'github-issues') {
    return { provider: kind, token: env.TICKETS_GITHUB_TOKEN, repo: env.TICKETS_REPO };
  }
  return {
    provider: 'github-contents',
    token: env.TICKETS_GITHUB_TOKEN,
    repo: env.TICKETS_REPO,
    branch: env.TICKETS_BRANCH || 'main',
  };
}

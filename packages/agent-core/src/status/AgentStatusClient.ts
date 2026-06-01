// status/AgentStatusClient.ts — ワーカーへ HTTP で問い合わせる薄いクライアント
//
// SQLite を一切 import しない。agent / markdown / 将来の任意拡張が import 一行で利用できる公開 API。
// agent-worker.json から URL を解決し、未起動（ファイル無し / 接続失敗）なら空を返す（自分では spawn しない）。

import { agentWorkerJsonPath, readWorkerInfo } from './agentWorkerInfo';
import type {
  AgentSessionRow,
  CommitUpsertInput,
  EditUpsertInput,
} from './types';

export interface AgentStatusClientOptions {
  /** ワークスペースルート。agent-worker.json の解決に使う */
  readonly workspaceRoot: string;
  /** fetch のタイムアウト(ms)。既定 2000 */
  readonly timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 2000;

export class AgentStatusClient {
  private readonly jsonPath: string;
  private readonly timeoutMs: number;

  constructor(opts: AgentStatusClientOptions) {
    this.jsonPath = agentWorkerJsonPath(opts.workspaceRoot);
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  /** ワーカー URL を解決する。未起動なら undefined */
  private resolveUrl(): string | undefined {
    return readWorkerInfo(this.jsonPath)?.url;
  }

  private async request<T>(
    path: string,
    init: RequestInit | undefined,
    fallback: T,
  ): Promise<T> {
    const base = this.resolveUrl();
    if (!base) return fallback;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(`${base}${path}`, { ...init, signal: controller.signal });
      if (!res.ok) return fallback;
      return (await res.json()) as T;
    } catch (err) {
      // ワーカー未起動・接続失敗・タイムアウトは欠落許容。空を返す。
      console.error(`[agent-status] client request failed (${path}): ${String(err)}`);
      return fallback;
    } finally {
      clearTimeout(timer);
    }
  }

  /** 全セッション行を取得。未起動・失敗時は空配列 */
  async queryAll(): Promise<AgentSessionRow[]> {
    const env = await this.request<{ data?: AgentSessionRow[] }>(
      '/api/agent-status',
      undefined,
      { data: [] },
    );
    return env.data ?? [];
  }

  /** 単一セッションを取得。未起動・失敗・未登録時は null */
  async queryOne(sessionId: string): Promise<AgentSessionRow | null> {
    const env = await this.request<{ data?: AgentSessionRow | null }>(
      `/api/agent-status/${encodeURIComponent(sessionId)}`,
      undefined,
      { data: null },
    );
    return env.data ?? null;
  }

  /** 編集系を UPSERT。未起動時は false（書き込みスキップ） */
  async postEdit(input: EditUpsertInput): Promise<boolean> {
    const res = await this.request<{ ok?: boolean }>(
      '/api/agent-status/edit',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      },
      { ok: false },
    );
    return res.ok === true;
  }

  /** commit 系を UPSERT。未起動時は false（書き込みスキップ） */
  async postCommit(input: CommitUpsertInput): Promise<boolean> {
    const res = await this.request<{ ok?: boolean }>(
      '/api/agent-status/commit',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      },
      { ok: false },
    );
    return res.ok === true;
  }
}

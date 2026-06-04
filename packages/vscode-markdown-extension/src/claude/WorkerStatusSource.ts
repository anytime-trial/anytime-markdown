// WorkerStatusSource.ts — agent-status ワーカーへの SQLite 非依存 HTTP クライアント。
//
// markdown 拡張は SQLite モジュール（node:sqlite を含む agent-core の barrel）を一切 import しない。
// editing 監視に必要な read/delete のみを fetch で行う薄いソースを持つ。
//
// HTTP 契約（パス・エンベロープ形）の正は agent-core の AgentStatusWorker / AgentStatusClient。
// 変更時は両者を揃える（agent 拡張は agent-core のクライアントを使う）。

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { AgentStatusRow, AgentStatusSource } from '@anytime-markdown/vscode-common';

const DEFAULT_TIMEOUT_MS = 2000;

export class WorkerStatusSource implements AgentStatusSource {
  private readonly jsonPath: string;

  constructor(
    workspaceRoot: string,
    private readonly timeoutMs: number = DEFAULT_TIMEOUT_MS,
    // Extension Host の console は不可視のため、エラーは OutputChannel 等へ流す（CLAUDE.md 規約）
    private readonly logError?: (message: string) => void,
  ) {
    this.jsonPath = path.join(workspaceRoot, '.anytime', 'agent', 'agent-worker.json');
  }

  /** agent-worker.json から URL を解決する。未起動なら undefined */
  private resolveUrl(): string | undefined {
    try {
      return JSON.parse(fs.readFileSync(this.jsonPath, 'utf8')).url as string;
    } catch {
      // ワーカー未起動・ファイル無しは欠落許容
      return undefined;
    }
  }

  private async request<T>(reqPath: string, init: RequestInit | undefined, fallback: T): Promise<T> {
    const base = this.resolveUrl();
    if (!base) return fallback;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(`${base}${reqPath}`, { ...init, signal: controller.signal });
      if (!res.ok) return fallback;
      return (await res.json()) as T;
    } catch (err) {
      this.logError?.(
        `[${new Date().toISOString()}] [ERROR] [agent-status] markdown source request failed (${reqPath}): ${String(err)}`,
      );
      return fallback;
    } finally {
      clearTimeout(timer);
    }
  }

  async queryAll(): Promise<readonly AgentStatusRow[]> {
    const env = await this.request<{ data?: AgentStatusRow[] }>(
      '/api/agent-status',
      undefined,
      { data: [] },
    );
    return env.data ?? [];
  }

  async deleteSession(sessionId: string): Promise<boolean> {
    const res = await this.request<{ ok?: boolean }>(
      `/api/agent-status/${encodeURIComponent(sessionId)}`,
      { method: 'DELETE' },
      { ok: false },
    );
    return res.ok === true;
  }
}

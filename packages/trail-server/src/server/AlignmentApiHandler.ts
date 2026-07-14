import type * as http from 'node:http';

import { type AlignmentInput,checkArchitecturalAlignment } from '@anytime-markdown/trail-core';
import {
  FileChangeResolver,
  SpecDocIndex,
  TrailDatabase,
  WorkspaceC4ElementProvider,
} from '@anytime-markdown/trail-db';

import type { Logger } from '../runtime/Logger';
import { sendServerError } from './errorResponse';

const JSON_HEADERS = { 'Content-Type': 'application/json' } as const;

function sendJson(res: http.ServerResponse, payload: unknown): void {
  res.writeHead(200, JSON_HEADERS);
  res.end(JSON.stringify(payload));
}

function sendError(res: http.ServerResponse, status: number, message: string): void {
  res.writeHead(status, JSON_HEADERS);
  res.end(JSON.stringify({ error: message }));
}

export interface AlignmentApiOptions {
  /** 既定のコードリポジトリルート（クエリの gitRepoRoot が優先） */
  readonly defaultGitRepoRoot?: string;
}

/**
 * 設計書追随チェック（CheckArchitecturalAlignment）を HTTP へ露出する。
 *
 * `mcp-trail` は `trail-db` に依存していないため、MCP ツール `check_alignment` は
 * discovery 系ツールと同様にこのエンドポイント経由で結果を取得する。
 */
export class AlignmentApiHandler {
  constructor(
    private readonly trailDb: TrailDatabase,
    private readonly logger: Logger,
    private readonly options: AlignmentApiOptions = {},
  ) {}

  async handle(res: http.ServerResponse, params: URLSearchParams): Promise<void> {
    const gitRepoRoot = params.get('gitRepoRoot') ?? this.options.defaultGitRepoRoot ?? '';
    if (!gitRepoRoot) {
      sendError(res, 400, 'gitRepoRoot is required (no server default is configured)');
      return;
    }

    const docsRepoRoot = params.get('docsRepoRoot') ?? '';
    if (!docsRepoRoot) {
      sendError(res, 400, 'docsRepoRoot is required (path to the spec document repository)');
      return;
    }

    const input = parseAlignmentInput(params);
    if (typeof input === 'string') {
      sendError(res, 400, input);
      return;
    }

    // session / range スコープは trail.db を読む。worktree は git だけで完結するため未オープンでも動く。
    const db = this.trailDb.getRawSqliteHandle() ?? undefined;
    if (!db && input.scope !== 'worktree') {
      sendError(res, 409, `trail.db is not open; scope=${input.scope} requires imported session data`);
      return;
    }

    try {
      const report = await checkArchitecturalAlignment(
        {
          changes: new FileChangeResolver({ db, gitRepoRoot }),
          specs: new SpecDocIndex({ db, docsRepoRoot, gitRepoRoot }),
          c4Elements: new WorkspaceC4ElementProvider({ workspaceRoot: gitRepoRoot, db }).listElements(),
        },
        input,
      );

      sendJson(res, report);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.logger.error(`/api/alignment failed: ${error.message}\n${error.stack ?? ''}`);
      sendServerError(res);
    }
  }
}

function parseAlignmentInput(params: URLSearchParams): AlignmentInput | string {
  const scope = params.get('scope') ?? 'worktree';
  const minAddedLinesRaw = params.get('minAddedLines');
  const minAddedLines = minAddedLinesRaw === null ? undefined : Number.parseInt(minAddedLinesRaw, 10);
  if (minAddedLines !== undefined && !Number.isFinite(minAddedLines)) {
    return 'minAddedLines must be an integer';
  }

  const options = minAddedLines === undefined ? undefined : { minAddedLines };

  if (scope === 'worktree') {
    return { scope: 'worktree', options };
  }

  if (scope === 'session') {
    const sessionId = params.get('sessionId');
    if (!sessionId) return 'sessionId is required for scope=session';
    return { scope: 'session', sessionId, options };
  }

  if (scope === 'range') {
    const fromRef = params.get('fromRef');
    const toRef = params.get('toRef');
    if (!fromRef || !toRef) return 'fromRef and toRef are required for scope=range';
    return { scope: 'range', fromRef, toRef, options };
  }

  return "scope must be one of 'worktree', 'session', or 'range'";
}

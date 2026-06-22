import * as http from 'node:http';

import type { TrailDatabase } from '@anytime-markdown/trail-db';

import type { CodeGraphService } from '../analyze/CodeGraphService';
import { GraphQueryEngine } from '../analyze/GraphQueryEngine';
import type { Logger } from '../runtime/Logger';

const JSON_HEADERS = { 'Content-Type': 'application/json' } as const;

/**
 * `/api/code-graph` `/api/code-graph/query` `/api/code-graph/explain` `/api/code-graph/path` の
 * 4 ハンドラ群。codeGraphService の in-memory cache から graph を読み、
 * `GraphQueryEngine` を lazy 構築してクエリ系操作を提供する。
 *
 * `current_graphs` 更新時 (TrailDataServer.notifyCodeGraphUpdated) に invalidate() を呼ぶこと。
 */
export class CodeGraphApiHandler {
  /** key: repo 名 (省略呼び出しはデフォルト repo に解決されるため `__default__` を使用) */
  private readonly cachedEngines = new Map<string, GraphQueryEngine>();
  private codeGraphService: CodeGraphService | undefined;

  constructor(
    private readonly trailDb: TrailDatabase,
    private readonly logger: Logger,
  ) {}

  setCodeGraphService(service: CodeGraphService): void {
    this.codeGraphService = service;
  }

  /**
   * notifyCodeGraphUpdated 時に呼ぶ。次回 query で再構築される。
   * repoName 省略時は全 cache クリア（互換動作）。
   */
  invalidate(repoName?: string): void {
    if (repoName) {
      this.cachedEngines.delete(repoName);
    } else {
      this.cachedEngines.clear();
    }
  }

  // -------------------------------------------------------------------------
  //  GET /api/code-graph?release=<id|current>&repo=<name>
  // -------------------------------------------------------------------------

  async handleGet(res: http.ServerResponse, releaseId: string, repo?: string): Promise<void> {
    if (releaseId !== 'current') {
      // 特定リリース: release_code_graphs から取得（repo 指定時は releases.repo_name で帰属確認）
      const releaseTagBelongsToRepo = this.trailDb.getReleases()
        .some((r) => r.tag === releaseId && (!repo || r.repo_name === repo));
      if (!releaseTagBelongsToRepo) {
        res.writeHead(404, JSON_HEADERS);
        res.end('{}');
        return;
      }
      const graph = this.trailDb.getReleaseCodeGraph(releaseId);
      if (!graph) {
        res.writeHead(404, JSON_HEADERS);
        res.end('{}');
        return;
      }
      res.writeHead(200, JSON_HEADERS);
      res.end(JSON.stringify(graph));
      return;
    }

    // current: cache hit → 返す。miss → DB lazy load。repo 指定があれば
    // 該当 repo のグラフのみ対象（マルチリポジトリ対応）。
    let graph = this.codeGraphService?.getGraph(repo) ?? null;
    graph ??= (await this.codeGraphService?.loadFromDb(repo)) ?? null;
    if (!graph) {
      res.writeHead(404, JSON_HEADERS);
      res.end('{}');
      return;
    }
    res.writeHead(200, JSON_HEADERS);
    res.end(JSON.stringify(graph));
  }

  // -------------------------------------------------------------------------
  //  GET /api/code-graph/query?q=...
  // -------------------------------------------------------------------------

  async handleQuery(res: http.ServerResponse, q: string, repo?: string, depth?: number): Promise<void> {
    const engine = await this.getOrBuildEngine(repo);
    if (!engine) {
      res.writeHead(404, JSON_HEADERS);
      res.end('{}');
      return;
    }
    res.writeHead(200, JSON_HEADERS);
    res.end(JSON.stringify(depth === undefined ? engine.query(q) : engine.query(q, depth)));
  }

  // -------------------------------------------------------------------------
  //  GET /api/code-graph/explain?id=...
  // -------------------------------------------------------------------------

  async handleExplain(res: http.ServerResponse, id: string, repo?: string): Promise<void> {
    const engine = await this.getOrBuildEngine(repo);
    if (!engine) {
      res.writeHead(404, JSON_HEADERS);
      res.end('{}');
      return;
    }
    const result = engine.explain(id);
    res.writeHead(result ? 200 : 404, JSON_HEADERS);
    res.end(JSON.stringify(result ?? {}));
  }

  // -------------------------------------------------------------------------
  //  GET /api/code-graph/path?from=...&to=...
  // -------------------------------------------------------------------------

  async handlePath(res: http.ServerResponse, from: string, to: string, repo?: string): Promise<void> {
    const engine = await this.getOrBuildEngine(repo);
    if (!engine) {
      res.writeHead(404, JSON_HEADERS);
      res.end('{}');
      return;
    }
    res.writeHead(200, JSON_HEADERS);
    res.end(JSON.stringify(engine.path(from, to)));
  }

  // -------------------------------------------------------------------------
  //  Helpers
  // -------------------------------------------------------------------------

  private async getOrBuildEngine(repo?: string): Promise<GraphQueryEngine | null> {
    const key = repo ?? '__default__';
    const cached = this.cachedEngines.get(key);
    if (cached) return cached;
    let graph = this.codeGraphService?.getGraph(repo) ?? null;
    graph ??= (await this.codeGraphService?.loadFromDb(repo)) ?? null;
    if (!graph) return null;
    try {
      const engine = new GraphQueryEngine(graph);
      this.cachedEngines.set(key, engine);
      return engine;
    } catch (err) {
      this.logger.error('[CodeGraphApiHandler] failed to build GraphQueryEngine', err);
      return null;
    }
  }
}

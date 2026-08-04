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

  /**
   * `?commit=<sha>` 指定でコミット時点のスナップショットを返す（Snapshot per Commit）。
   *
   * `release` との同時指定は 400 で断る。どちらを優先しても、指定した側と違う時点の
   * グラフが返ることになり、UI 側では「選んだ時点と違う絵が出る」形でしか現れない。
   */
  handleGetCommit(res: http.ServerResponse, sha: string, repo?: string): void {
    if (!repo) {
      res.writeHead(400, JSON_HEADERS);
      res.end(JSON.stringify({ error: 'repo is required when commit is specified' }));
      return;
    }
    try {
      const graph = this.trailDb.getCommitCodeGraph(sha, repo);
      if (!graph) {
        res.writeHead(404, JSON_HEADERS);
        res.end('{}');
        return;
      }
      res.writeHead(200, JSON_HEADERS);
      res.end(JSON.stringify(graph));
    } catch (err) {
      this.logger.error(`[CodeGraphApiHandler] failed to read commit graph sha=${sha}`, err);
      res.writeHead(500, JSON_HEADERS);
      res.end(JSON.stringify({ error: 'Failed to read commit code graph' }));
    }
  }

  async handleGet(res: http.ServerResponse, releaseId: string, repo?: string): Promise<void> {
    if (releaseId !== 'current') {
      // 特定リリース: release_code_graphs から取得する。
      // タグはリポジトリ内でしか一意でない（`UNIQUE (repo_id, tag)`）ため、repo 無しでは
      // 「どのリポジトリの v1.0.0 か」が決まらない。省略を「どれでもよい」と解釈すると
      // 別リポジトリのグラフを返し得るので、決められない要求として 400 で断る。
      if (!repo) {
        res.writeHead(400, JSON_HEADERS);
        res.end(JSON.stringify({ error: 'repo is required when release is specified' }));
        return;
      }
      const releaseTagBelongsToRepo = this.trailDb.getReleases()
        .some((r) => r.tag === releaseId && r.repo_name === repo);
      if (!releaseTagBelongsToRepo) {
        res.writeHead(404, JSON_HEADERS);
        res.end('{}');
        return;
      }
      const graph = this.trailDb.getReleaseCodeGraph(releaseId, repo);
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
  //  GET /api/code-graph/releases?repo=<name>
  // -------------------------------------------------------------------------

  /**
   * Time Scrubber の目盛り一覧。リリースと履歴版グラフの在庫有無だけを返す
   * （グラフ本体は 1 本 2 MB あるため含めない）。
   *
   * `repo` 省略は全リポジトリの混合ではなく空配列とする。目盛りはリポジトリ単位の
   * 時間軸であり、混ぜると別リポジトリのタグが同じ軸に並んでしまう。
   */
  handleGetReleases(res: http.ServerResponse, repo?: string): void {
    if (!repo) {
      res.writeHead(200, JSON_HEADERS);
      res.end(JSON.stringify({ releases: [] }));
      return;
    }
    try {
      const releases = this.trailDb.listReleaseCodeGraphAvailability(repo);
      res.writeHead(200, JSON_HEADERS);
      res.end(JSON.stringify({ releases }));
    } catch (err) {
      this.logger.error(`[CodeGraphApiHandler] failed to list releases for repo=${repo}`, err);
      res.writeHead(500, JSON_HEADERS);
      res.end(JSON.stringify({ error: 'Failed to list code graph releases' }));
    }
  }

  // -------------------------------------------------------------------------
  //  GET /api/code-graph/commits?repo=<name>&to=<tag>&from=<tag>
  // -------------------------------------------------------------------------

  /**
   * Time Scrubber をコミット粒度へズームしたときの目盛り一覧。
   *
   * `repo` と `to`（区間の上端タグ）は必須。`from` を省略すると最古からになる。
   * `releases` に無い `to` は空配列になる（`listCommitCodeGraphAvailability` 参照）。
   * グラフ本体は含めない（区間には実測 17〜304 件並ぶ）。
   */
  handleGetCommits(res: http.ServerResponse, repo?: string, to?: string, from?: string): void {
    if (!repo || !to) {
      res.writeHead(400, JSON_HEADERS);
      res.end(JSON.stringify({ error: 'repo and to are required' }));
      return;
    }
    try {
      const commits = this.trailDb.listCommitCodeGraphAvailability(repo, to, from);
      res.writeHead(200, JSON_HEADERS);
      res.end(JSON.stringify({ commits }));
    } catch (err) {
      this.logger.error(`[CodeGraphApiHandler] failed to list commits for repo=${repo}`, err);
      res.writeHead(500, JSON_HEADERS);
      res.end(JSON.stringify({ error: 'Failed to list code graph commits' }));
    }
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

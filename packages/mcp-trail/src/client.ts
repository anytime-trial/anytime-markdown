import path from 'node:path';

export interface TrailClientOptions {
  serverUrl: string;
  repoName: string;
}

export function resolveOptions(opts: Partial<TrailClientOptions>): TrailClientOptions {
  return {
    serverUrl: opts.serverUrl ?? 'http://localhost:19841',
    repoName: opts.repoName ?? path.basename(process.cwd()),
  };
}

async function request<T>(
  serverUrl: string,
  pathname: string,
  method: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(`${serverUrl}${pathname}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`TrailDataServer ${method} ${pathname} → ${res.status}: ${text}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export async function getC4Model(serverUrl: string, repoName: string): Promise<unknown> {
  return request(serverUrl, `/api/c4/model?repoName=${encodeURIComponent(repoName)}`, 'GET');
}

export async function addElement(
  serverUrl: string,
  repoName: string,
  body: {
    type: string;
    name: string;
    external: boolean;
    parentId: string | null;
    description?: string;
    serviceType?: string;
  },
): Promise<unknown> {
  return request(serverUrl, `/api/c4/manual-elements?repoName=${encodeURIComponent(repoName)}`, 'POST', body);
}

export async function updateElement(
  serverUrl: string,
  repoName: string,
  id: string,
  changes: { name?: string; description?: string; external?: boolean; serviceType?: string },
): Promise<unknown> {
  return request(serverUrl, `/api/c4/manual-elements/${encodeURIComponent(id)}?repoName=${encodeURIComponent(repoName)}`, 'PATCH', changes);
}

export async function removeElement(
  serverUrl: string,
  repoName: string,
  id: string,
): Promise<void> {
  return request(serverUrl, `/api/c4/manual-elements/${encodeURIComponent(id)}?repoName=${encodeURIComponent(repoName)}`, 'DELETE');
}

export async function listRelationships(
  serverUrl: string,
  repoName: string,
): Promise<unknown> {
  return request(serverUrl, `/api/c4/manual-relationships?repoName=${encodeURIComponent(repoName)}`, 'GET');
}

export async function addRelationship(
  serverUrl: string,
  repoName: string,
  body: { fromId: string; toId: string; label?: string; technology?: string },
): Promise<unknown> {
  return request(serverUrl, `/api/c4/manual-relationships?repoName=${encodeURIComponent(repoName)}`, 'POST', body);
}

export async function removeRelationship(
  serverUrl: string,
  repoName: string,
  id: string,
): Promise<void> {
  return request(serverUrl, `/api/c4/manual-relationships/${encodeURIComponent(id)}?repoName=${encodeURIComponent(repoName)}`, 'DELETE');
}

export async function listGroups(
  serverUrl: string,
  repoName: string,
): Promise<unknown> {
  return request(serverUrl, `/api/c4/manual-groups?repoName=${encodeURIComponent(repoName)}`, 'GET');
}

export async function addGroup(
  serverUrl: string,
  repoName: string,
  body: { memberIds: string[]; label?: string },
): Promise<unknown> {
  return request(serverUrl, `/api/c4/manual-groups?repoName=${encodeURIComponent(repoName)}`, 'POST', body);
}

export async function updateGroup(
  serverUrl: string,
  repoName: string,
  id: string,
  body: { memberIds?: string[]; label?: string | null },
): Promise<void> {
  return request(serverUrl, `/api/c4/manual-groups/${encodeURIComponent(id)}?repoName=${encodeURIComponent(repoName)}`, 'PATCH', body);
}

export async function removeGroup(
  serverUrl: string,
  repoName: string,
  id: string,
): Promise<void> {
  return request(serverUrl, `/api/c4/manual-groups/${encodeURIComponent(id)}?repoName=${encodeURIComponent(repoName)}`, 'DELETE');
}

// ---------------------------------------------------------------------------
//  Analyze pipeline triggers (POST /api/analyze/*)
// ---------------------------------------------------------------------------

export interface AnalyzeCurrentResult {
  repoName: string;
  tsconfigPath: string;
  fileCount: number;
  nodeCount: number;
  edgeCount: number;
  commitId: string;
  durationMs: number;
  warnings: string[];
}

export interface AnalyzeReleaseResult {
  releaseCount: number;
  durationMs: number;
}

export interface AnalyzeAllResult {
  imported: number;
  skipped: number;
  commitsResolved: number;
  releasesResolved: number;
  releasesAnalyzed: number;
  coverageImported: number;
  currentCoverageImported: number;
  messageCommitsBackfilled: number;
  durationMs: number;
}

export interface AnalyzeStatus {
  inProgress: { kind: 'current' | 'release' | 'all'; startedAt: number } | null;
}

/**
 * VS Code 拡張の `Anytime Trail: コード解析` 相当を HTTP 経由で起動する。
 * 引数省略時は拡張の現在ワークスペースで実行される。
 */
export async function analyzeCurrentCode(
  serverUrl: string,
  body: { workspacePath?: string; tsconfigPath?: string } = {},
): Promise<AnalyzeCurrentResult> {
  return request(serverUrl, '/api/analyze/current', 'POST', body);
}

/**
 * `Anytime Trail: リリース別コード解析` 相当を HTTP 経由で起動する。
 */
export async function analyzeReleaseCode(serverUrl: string): Promise<AnalyzeReleaseResult> {
  return request(serverUrl, '/api/analyze/release', 'POST', {});
}

/**
 * `Anytime Trail: 全データ解析` 相当を HTTP 経由で起動する。
 * `~/.claude/projects` から JSONL を取り込み、コミット解決・リリース解析・カバレッジ取り込みを行う。
 */
export async function analyzeAll(serverUrl: string): Promise<AnalyzeAllResult> {
  return request(serverUrl, '/api/analyze/all', 'POST', {});
}

/**
 * 解析の進行状況を確認する。
 * 並行起動を避ける用途や、別エージェントが解析中かを確認する用途で使う。
 */
export async function getAnalyzeStatus(serverUrl: string): Promise<AnalyzeStatus> {
  return request(serverUrl, '/api/analyze/status', 'GET');
}

export interface ProgressEntry {
  phase: string;
  percent: number;
  ts: number;
}

/**
 * `analyzeCurrentCode` 実行中の TrailDataServer WebSocket 進捗イベント
 * （`type: "analysis-progress"`）を購読しつつ HTTP 解析を起動する。
 *
 * Node 22+ の global WebSocket を使用。WS が利用不可の環境では progressLog 空配列で返す。
 */
export async function analyzeCurrentCodeWithProgress(
  serverUrl: string,
  body: { workspacePath?: string; tsconfigPath?: string } = {},
): Promise<AnalyzeCurrentResult & { progressLog: ProgressEntry[] }> {
  const progressLog: ProgressEntry[] = [];
  const WSCtor = (globalThis as { WebSocket?: typeof WebSocket }).WebSocket;
  let ws: WebSocket | undefined;

  if (WSCtor) {
    const wsUrl = serverUrl.replace(/^http/, 'ws');
    try {
      ws = new WSCtor(wsUrl);
      await new Promise<void>((resolve) => {
        const onOpen = (): void => {
          ws?.removeEventListener('open', onOpen);
          ws?.removeEventListener('error', onError);
          resolve();
        };
        const onError = (): void => {
          ws?.removeEventListener('open', onOpen);
          ws?.removeEventListener('error', onError);
          ws = undefined;
          resolve();
        };
        ws?.addEventListener('open', onOpen, { once: true });
        ws?.addEventListener('error', onError, { once: true });
      });
      ws?.addEventListener('message', (event: MessageEvent) => {
        try {
          const data = typeof event.data === 'string' ? event.data : String(event.data);
          const msg = JSON.parse(data) as { type?: string; phase?: string; percent?: number };
          if (msg.type === 'analysis-progress' && typeof msg.phase === 'string') {
            progressLog.push({
              phase: msg.phase,
              percent: typeof msg.percent === 'number' ? msg.percent : -1,
              ts: Date.now(),
            });
          }
        } catch {
          // 不正な JSON は無視
        }
      });
    } catch {
      ws = undefined;
    }
  }

  try {
    const result = await analyzeCurrentCode(serverUrl, body);
    return { ...result, progressLog };
  } finally {
    try {
      ws?.close();
    } catch {
      // close 失敗は無視
    }
  }
}

// ---------------------------------------------------------------------------
//  Discovery / code-graph query API
// ---------------------------------------------------------------------------

/** GraphQueryEngine.explain の結果（{ node, incoming, outgoing }）。影響範囲調査に使う。 */
export async function getCodeGraphExplain(
  serverUrl: string,
  nodeId: string,
  repoName: string,
): Promise<unknown> {
  return request(
    serverUrl,
    `/api/code-graph/explain?id=${encodeURIComponent(nodeId)}&repo=${encodeURIComponent(repoName)}`,
    'GET',
  );
}

/** /api/c4/file-analysis（current tag）の生結果 { entries, elementMatrix }。top-N 射影は呼び出し側。 */
export async function getFileAnalysis(
  serverUrl: string,
  repoName: string,
): Promise<{ entries: unknown[]; elementMatrix: unknown }> {
  return request(
    serverUrl,
    `/api/c4/file-analysis?repo=${encodeURIComponent(repoName)}&tag=current`,
    'GET',
  );
}

export interface AlignmentQuery {
  readonly scope: 'worktree' | 'session' | 'range';
  readonly docsRepoRoot: string;
  readonly gitRepoRoot?: string;
  readonly sessionId?: string;
  readonly fromRef?: string;
  readonly toRef?: string;
  readonly minAddedLines?: number;
}

/** 設計書追随チェック（CheckArchitecturalAlignment）。TrailDataServer /api/alignment を叩く。 */
export async function getAlignmentReport(serverUrl: string, query: AlignmentQuery): Promise<unknown> {
  const params = new URLSearchParams({ scope: query.scope, docsRepoRoot: query.docsRepoRoot });
  if (query.gitRepoRoot) params.set('gitRepoRoot', query.gitRepoRoot);
  if (query.sessionId) params.set('sessionId', query.sessionId);
  if (query.fromRef) params.set('fromRef', query.fromRef);
  if (query.toRef) params.set('toRef', query.toRef);
  if (query.minAddedLines !== undefined) params.set('minAddedLines', String(query.minAddedLines));

  return request(serverUrl, `/api/alignment?${params.toString()}`, 'GET');
}

/** GraphQueryEngine.query。depth で BFS 深さを制御（未指定なら server 既定）。 */
export async function getCodeGraphQuery(
  serverUrl: string,
  q: string,
  repoName: string,
  depth?: number,
): Promise<{ nodes?: string[]; edges?: Array<{ source: string; target: string }> }> {
  const depthParam = depth === undefined ? '' : `&depth=${depth}`;
  return request(
    serverUrl,
    `/api/code-graph/query?q=${encodeURIComponent(q)}&repo=${encodeURIComponent(repoName)}${depthParam}`,
    'GET',
  );
}

/** GraphQueryEngine.path。2 ノード間の接続経路 { found, path, hops }。 */
export async function getCodeGraphPath(
  serverUrl: string,
  from: string,
  to: string,
  repoName: string,
): Promise<unknown> {
  return request(
    serverUrl,
    `/api/code-graph/path?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&repo=${encodeURIComponent(repoName)}`,
    'GET',
  );
}

/** /api/temporal-coupling。リポジトリ全体の共変更ペア。 */
export async function getTemporalCoupling(
  serverUrl: string,
  repoName: string,
  opts: { windowDays?: number; topK?: number; granularity?: string } = {},
): Promise<{ edges?: Array<{ source: string; target: string; jaccard?: number }> }> {
  const params = new URLSearchParams({ repo: repoName, granularity: opts.granularity ?? 'commit' });
  if (opts.windowDays !== undefined) params.set('windowDays', String(opts.windowDays));
  if (opts.topK !== undefined) params.set('topK', String(opts.topK));
  return request(serverUrl, `/api/temporal-coupling?${params.toString()}`, 'GET');
}

// ---------------------------------------------------------------------------
//  Community summary / mapping API
// ---------------------------------------------------------------------------

export interface CommunityRow {
  communityId: number;
  label: string;
  name: string;
  summary: string;
  mappingsJson: string | null;
  /**
   * コミュニティ内ノード ID 集合のコンテンツハッシュ（stable_key）。
   * 古いスキーマでは空文字。AI 付与した name / summary / mappings を community_id 再採番から守る引き継ぎキー。
   */
  stableKey: string;
}

export interface CommunitySummaryInput {
  communityId: number;
  name: string;
  summary: string;
}

export type CommunityRole = 'primary' | 'secondary' | 'dependency';

export interface CommunityMappingEntry {
  elementId: string;
  elementType: string;
  role: CommunityRole;
}

export interface CommunityMappingInput {
  communityId: number;
  mappings: ReadonlyArray<CommunityMappingEntry>;
}

/**
 * 指定リポジトリのコミュニティ一覧（label / name / summary / mappings_json）を取得する。
 */
export async function listCommunities(serverUrl: string, repoName: string): Promise<{ communities: ReadonlyArray<CommunityRow> }> {
  return request(serverUrl, `/api/c4/communities?repoName=${encodeURIComponent(repoName)}`, 'GET');
}

/**
 * AI 生成した name + summary をコミュニティに upsert する。
 * mappings_json は触らないので保持される。
 */
export async function upsertCommunitySummaries(
  serverUrl: string,
  repoName: string,
  summaries: ReadonlyArray<CommunitySummaryInput>,
): Promise<{ updated: number }> {
  return request(serverUrl, '/api/c4/communities/upsert-summaries', 'POST', { repoName, summaries });
}

/**
 * AI 判定したコミュニティ別 C4 要素 role マッピングを upsert する。
 * mappings_json カラムは未存在の DB では自動 ALTER で追加される。
 */
export async function upsertCommunityMappings(
  serverUrl: string,
  repoName: string,
  mappings: ReadonlyArray<CommunityMappingInput>,
): Promise<{ updated: number; inserted: number }> {
  return request(serverUrl, '/api/c4/communities/upsert-mappings', 'POST', { repoName, mappings });
}

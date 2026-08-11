/**
 * computeAndPersistFileAnalysis
 *
 * dead code シグナルを集計し、activity_current_file_analysis / activity_current_function_analysis に
 * 洗い替え方式（clear → upsert）で永続化するメインヘルパー。
 *
 * ## パス変換一覧
 * 本モジュールでは「analysisRoot からの相対パス（拡張子あり）」を共通キーとして使う。
 *
 * | データソース             | 元の形式                                 | 変換方法                                          |
 * |-------------------------|------------------------------------------|----------------------------------------------------|
 * | ScoredFunction.filePath  | 絶対パス                                 | path.relative(analysisRoot, filePath)              |
 * | coverage file_path       | 絶対パス（istanbul coverage-summary.json）| path.relative(analysisRoot, file_path)             |
 * | activity_commit_files.file_path   | git 相対パス（リポジトリルート基準）     | そのまま（analysisRoot = リポジトリルートの前提）  |
 * | CodeGraphNode.id         | "${repoName}:${relPathNoExt}"           | slice(repoName+1) → 拡張子なし相対パスとして照合  |
 *
 * ## CodeGraphNode.id フォーマット調査結果
 * trailGraphToCodeGraphInputs.ts の makeCodeNode() にて構築:
 *   id = `${repoId}:${stripExt(relPath)}`
 * repoId = path.basename(analysisRoot) = repoName。
 * stripExt() は .tsx? と .mdx? を除去する。
 * 例: repoName="anytime-markdown", relPath="packages/core/src/foo.ts"
 *     → id = "anytime-markdown:packages/core/src/foo"
 *
 * ノード照合は「拡張子なし相対パス」で行うため、同名異拡張子（foo.ts / foo.tsx）が
 * 共存する場合は先勝ちになる（実運用では稀）。
 */

import path from 'node:path';
import fs from 'node:fs';

import type { TrailDatabase } from '@anytime-markdown/trail-db';
import {
  parseDeadCodeIgnore,
  matchIgnore,
  computeDeadCodeScore,
  computeNewlyActive,
  aggregateImportanceToFile,
} from '@anytime-markdown/trail-activity/deadCode';
import type {
  FileAnalysisRow,
  FunctionAnalysisRow,
  DeadCodeSignals,
  IgnoreRules,
} from '@anytime-markdown/trail-activity/deadCode';
import type { ScoredFunction } from '@anytime-markdown/trail-activity/importance';
import type { CodeGraph } from '@anytime-markdown/trail-activity/codeGraph';
import { computeCentrality, classifyFunctionRoles } from '@anytime-markdown/trail-activity/centrality';
import type { FunctionRole } from '@anytime-markdown/trail-activity/centrality';
import type { FileCategory } from '@anytime-markdown/trail-activity/classify';

export interface ComputeAndPersistFileAnalysisOpts {
  /** ワークスペースの絶対パス。git リポジトリルートと一致することを想定。 */
  readonly analysisRoot: string;
  /** path.basename(analysisRoot) と同値。セッションの repo_name として使う。 */
  readonly repoName: string;
  readonly trailDb: TrailDatabase;
  readonly scored: readonly ScoredFunction[];
  /** ファイル相対パス → 行数のマップ（tsconfig ディレクトリ基準の相対パス） */
  readonly lineCountByFile: ReadonlyMap<string, number>;
  /**
   * ファイル相対パス → UI / Logic 分類のマップ。
   * 未指定 / 該当キーなしのファイルは 'logic' とみなす。
   */
  readonly categoryByFile?: ReadonlyMap<string, FileCategory>;
}

/** noRecentChurn 判定の "recent" 窓 (日)。activity.db の取り込み履歴が短い (47 日程度) ため
 *  従来の 90 日では everChurned == recentChurn となりシグナルが発火しない。30 日に短縮して
 *  発火可能にする。git 履歴インポート期間が長くなれば再考。 */
const RECENT_CHURN_WINDOW_DAYS = 30;
const RECENT_CHURN_WINDOW_MS = RECENT_CHURN_WINDOW_DAYS * 24 * 60 * 60 * 1000;
/** コミュニティサイズがこの値以下を "isolated" とみなす。 */
const ISOLATED_COMMUNITY_THRESHOLD = 3;

export async function computeAndPersistFileAnalysis(
  opts: ComputeAndPersistFileAnalysisOpts,
): Promise<{ fileRows: number; functionRows: number }> {
  const { analysisRoot, repoName, trailDb, scored, lineCountByFile, categoryByFile } = opts;
  const analyzedAt = new Date().toISOString();
  const sinceIso = new Date(Date.now() - RECENT_CHURN_WINDOW_MS).toISOString();

  // 1. .anytime/dead-code-ignore ルール読み込み
  const ignorePath = path.join(analysisRoot, '.anytime', 'dead-code-ignore');
  const ignoreContent = safeReadFile(ignorePath);
  const ignoreRules: IgnoreRules = ignoreContent
    ? parseDeadCodeIgnore(ignoreContent)
    : { patterns: [], negations: [] };

  // 2. per-file importance 集計（ScoredFunction[] → Map<relPath, aggregate>）
  // ScoredFunction.filePath は絶対パスなので相対化する
  const scoredWithRelPath = scored.map((fn) => ({
    ...fn,
    relPath: path.relative(analysisRoot, fn.filePath),
  }));
  // aggregateImportanceToFile は fn.filePath をキーにするため、
  // 相対パスに差し替えた仮オブジェクトを作成する
  const scoredWithMappedPath = scoredWithRelPath.map((fn) => ({
    ...fn,
    filePath: fn.relPath,
  }));
  const fileAggregates = aggregateImportanceToFile(scoredWithMappedPath);

  // 3. CodeGraph から in-degree とコミュニティサイズを計算
  const codeGraph = trailDb.getCurrentCodeGraph(repoName);
  const inDegree = computeInDegree(codeGraph);
  const communitySize = computeCommunitySize(codeGraph);
  const nodeCommunityMap = buildNodeCommunityMap(codeGraph);

  // 4. node.id → 相対パス(拡張子なし) の逆引きマップを構築
  //    キー: 拡張子なし相対パス（例 "packages/core/src/foo"）
  //    値: node.id（例 "anytime-markdown:packages/core/src/foo"）
  const relPathNoExtToNodeId = buildRelPathNoExtToNodeIdIndex(codeGraph, repoName);

  // 5. recent 窓 (RECENT_CHURN_WINDOW_DAYS 日) 以内のチャーン（activity_commit_files.file_path = git 相対パス）
  const churnMap = trailDb.getCommitFilesChurnSince(repoName, sinceIso);
  // 5b. 全期間の commit 履歴（noRecentChurn 判定用）
  // churnMap は recent 窓のみ返すため、それを hasHistory として使うと
  // hasHistory && churn===0 が論理的に成立しない。全期間の履歴を別途取得する。
  const everChurned = trailDb.getCommitFilesEverChurned(repoName);
  // 5c. Phase 6 S5-D: recent 窓より前の churn と取込履歴の長さ（Newly Active 判定用）
  const priorChurnMap = trailDb.getCommitFilesChurnBefore(repoName, sinceIso);
  const historyDays = computeHistoryDays(trailDb.getEarliestCommitAt(repoName));

  // 6. カバレッジ（coverage file_path = 絶対パス → 相対化）
  const coverageMap = buildCoverageMap(trailDb.getCurrentCoverage(repoName), analysisRoot);

  // 7. 全ファイルパス（相対）の universe を収集
  //    = importance 解析対象 ∪ code graph ノード（lineCountByFile で拡張子復元）
  const allRelFilePaths = collectAllRelFilePaths(fileAggregates, codeGraph, repoName, lineCountByFile);

  // 8a. centrality を計算
  //     CodeGraph.edges は node id (repoName:relPathNoExt) 形式のため、
  //     computeCentrality が期待する relPath (拡張子あり) に変換する
  const nodeIdToRelPath = buildNodeIdToRelPathIndex(codeGraph, repoName, lineCountByFile);
  const centralityEdges = buildCentralityEdges(codeGraph, nodeIdToRelPath);
  const fileMetadata = buildFileMetadata(fileAggregates);

  const centralityResults = computeCentrality({ edges: centralityEdges }, fileMetadata);
  const centralityMap = new Map(centralityResults.map((c) => [c.filePath, c]));

  // 8. FileAnalysisRow を構築
  const fileRows: FileAnalysisRow[] = [];
  for (const relPath of allRelFilePaths) {
    fileRows.push(buildFileAnalysisRow({
      relPath,
      repoName,
      analyzedAt,
      fileAggregates,
      inDegree,
      communitySize,
      nodeCommunityMap,
      relPathNoExtToNodeId,
      churnMap,
      everChurned,
      priorChurnMap,
      historyDays,
      coverageMap,
      centralityMap,
      ignoreRules,
      lineCountByFile,
      categoryByFile,
    }));
  }

  // 9. FunctionAnalysisRow を構築（filePath を相対パスに変換）
  // 9a. classifyFunctionRoles で全関数の role を計算
  const classifiedFunctions = classifyFunctionRoles(
    scored.map((fn) => ({
      filePath: path.relative(analysisRoot, fn.filePath),
      functionName: fn.name,
      fanIn: fn.metrics.fanIn,
      fanOut: fn.metrics.fanOut,
    })),
  );
  // 9b. filePath::functionName をキーにした role マップ
  const roleMap = new Map<string, FunctionRole>();
  for (const cf of classifiedFunctions) {
    roleMap.set(`${cf.filePath}::${cf.functionName}`, cf.role);
  }

  const functionRows: FunctionAnalysisRow[] = scored.map((fn) => {
    const relFilePath = path.relative(analysisRoot, fn.filePath);
    const roleKey = `${relFilePath}::${fn.name}`;
    return {
      repoName,
      filePath: relFilePath,
      functionName: fn.name,
      startLine: fn.startLine,
      endLine: fn.endLine,
      language: fn.language,
      fanIn: fn.metrics.fanIn,
      cognitiveComplexity: fn.metrics.cognitiveComplexity,
      cyclomaticComplexity: fn.metrics.cyclomaticComplexity,
      dataMutationScore: fn.metrics.dataMutationScore,
      sideEffectScore: fn.metrics.sideEffectScore,
      lineCount: fn.metrics.lineCount,
      importanceScore: fn.importanceScore,
      signalFanInZero: fn.metrics.fanIn === 0,
      fanOut: fn.metrics.fanOut,
      distinctCallees: fn.metrics.distinctCallees,
      functionRole: roleMap.get(roleKey) ?? 'peripheral',
      analyzedAt,
    };
  });

  // 10. 洗い替え方式で永続化（CLAUDE.md 21.2 Supabase / 同期方式）
  trailDb.clearCurrentFileAnalysis(repoName);
  trailDb.upsertCurrentFileAnalysis(fileRows);
  trailDb.clearCurrentFunctionAnalysis(repoName);
  trailDb.upsertCurrentFunctionAnalysis(functionRows);

  return { fileRows: fileRows.length, functionRows: functionRows.length };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** 取込済み commit 履歴の長さ（日）。履歴が無ければ 0。 */
function computeHistoryDays(earliestCommitAt: ReturnType<TrailDatabase['getEarliestCommitAt']>): number {
  return earliestCommitAt
    ? Math.max(0, (Date.now() - new Date(earliestCommitAt).getTime()) / (24 * 60 * 60 * 1000))
    : 0;
}

/** coverage 行から「相対パス → 行カバレッジ %」のマップを作る（`__total__` 行は除外）。 */
function buildCoverageMap(
  coverageRows: ReturnType<TrailDatabase['getCurrentCoverage']>,
  analysisRoot: string,
): Map<string, number> {
  const coverageMap = new Map<string, number>(); // key = 相対パス
  for (const r of coverageRows) {
    if (r.file_path === '__total__') continue;
    // istanbul は絶対パスをキーとして使う
    const rel = path.isAbsolute(r.file_path)
      ? path.relative(analysisRoot, r.file_path)
      : r.file_path;
    coverageMap.set(rel, r.lines_pct);
  }
  return coverageMap;
}

/**
 * 拡張子なし相対パスを、TS Compiler が認識している拡張子付き相対パスへ復元する。
 * lineCountByFile に対応キーが無い場合は `.ts` / `.tsx` を推測する（従来挙動を維持）。
 */
function resolveRelPathWithExt(
  relPathNoExt: string,
  noExtToWithExt: ReadonlyMap<string, string>,
  lineCountByFile: ReadonlyMap<string, number>,
): string {
  return (
    noExtToWithExt.get(relPathNoExt) ??
    (lineCountByFile.has(`${relPathNoExt}.ts`) ? `${relPathNoExt}.ts` : `${relPathNoExt}.tsx`)
  );
}

/**
 * node.id → 相対パス（拡張子あり）の逆引きマップ。
 * 同一 node.id が複数回現れた場合は先勝ち（従来挙動）。
 */
function buildNodeIdToRelPathIndex(
  graph: CodeGraph | null,
  repoName: string,
  lineCountByFile: ReadonlyMap<string, number>,
): Map<string, string> {
  const noExtToWithExt = new Map<string, string>();
  for (const key of lineCountByFile.keys()) {
    noExtToWithExt.set(stripExt(key), key);
  }
  const nodeIdToRelPath = new Map<string, string>();
  if (!graph) return nodeIdToRelPath;
  const prefix = `${repoName}:`;
  for (const n of graph.nodes) {
    if (!n.id.startsWith(prefix)) continue;
    const relPathNoExt = n.id.slice(prefix.length);
    const withExt = resolveRelPathWithExt(relPathNoExt, noExtToWithExt, lineCountByFile);
    if (!nodeIdToRelPath.has(n.id)) {
      nodeIdToRelPath.set(n.id, withExt);
    }
  }
  return nodeIdToRelPath;
}

/** computeCentrality 用のエッジ（relPath ベース）。端点を解決できないエッジは落とす。 */
function buildCentralityEdges(
  graph: CodeGraph | null,
  nodeIdToRelPath: ReadonlyMap<string, string>,
): { source: string; target: string }[] {
  return (graph?.edges ?? [])
    .map((e) => ({ source: nodeIdToRelPath.get(e.source) ?? '', target: nodeIdToRelPath.get(e.target) ?? '' }))
    .filter((e) => e.source && e.target);
}

/** computeCentrality へ渡すファイル単位のメタデータを fileAggregates から組む。 */
function buildFileMetadata(
  fileAggregates: ReturnType<typeof aggregateImportanceToFile>,
): Record<string, { functionCount: number; cognitiveComplexityMax: number }> {
  const fileMetadata: Record<string, { functionCount: number; cognitiveComplexityMax: number }> = {};
  for (const [relPath, agg] of fileAggregates.entries()) {
    fileMetadata[relPath] = {
      functionCount: (agg as { functionCount?: number }).functionCount ?? 0,
      cognitiveComplexityMax: (agg as { cognitiveComplexityMax?: number }).cognitiveComplexityMax ?? 0,
    };
  }
  return fileMetadata;
}

interface BuildFileRowCtx {
  relPath: string;
  repoName: string;
  analyzedAt: string;
  fileAggregates: ReadonlyMap<string, {
    importanceScore: number;
    fanInTotal: number;
    cognitiveComplexityMax: number;
    cyclomaticComplexityMax: number;
    functionCount: number;
  }>;
  inDegree: ReadonlyMap<string, number>;
  communitySize: ReadonlyMap<number, number>;
  nodeCommunityMap: ReadonlyMap<string, number>;
  relPathNoExtToNodeId: ReadonlyMap<string, string>;
  churnMap: ReadonlyMap<string, number>;
  everChurned: ReadonlySet<string>;
  priorChurnMap: ReadonlyMap<string, number>;
  historyDays: number;
  coverageMap: ReadonlyMap<string, number>;
  centralityMap: ReadonlyMap<string, { crossPkgIn: number; externalConsumerPkgs: number; totalIn: number; isBarrel: boolean; centralityScore: number }>;
  ignoreRules: IgnoreRules;
  lineCountByFile: ReadonlyMap<string, number>;
  categoryByFile?: ReadonlyMap<string, FileCategory>;
}

function buildFileAnalysisRow(ctx: BuildFileRowCtx): FileAnalysisRow {
  const {
    relPath, repoName, analyzedAt, fileAggregates, inDegree, communitySize,
    nodeCommunityMap, relPathNoExtToNodeId, churnMap, everChurned, priorChurnMap, historyDays,
    coverageMap, centralityMap, ignoreRules, lineCountByFile, categoryByFile,
  } = ctx;

  const agg = fileAggregates.get(relPath) ?? {
    importanceScore: 0,
    fanInTotal: 0,
    cognitiveComplexityMax: 0,
    cyclomaticComplexityMax: 0,
    functionCount: 0,
  };

  // CodeGraph ノード照合（拡張子なし相対パスでマッチング）
  const relPathNoExt = stripExt(relPath);
  const nodeId = relPathNoExtToNodeId.get(relPathNoExt);
  const hasNode = nodeId !== undefined;
  const inDeg = hasNode ? (inDegree.get(nodeId) ?? 0) : 0;

  // commit churn（git 相対パスと照合。通常 relPath と一致する）
  const churn = churnMap.get(relPath) ?? 0;
  const hasHistory = everChurned.has(relPath);

  // カバレッジ
  const coveragePct = coverageMap.get(relPath);
  const coverageKnown = coveragePct !== undefined;

  // コミュニティサイズ
  const communityId = hasNode ? (nodeCommunityMap.get(nodeId) ?? null) : null;
  const commSize = communityId === null ? 0 : (communitySize.get(communityId) ?? 0);

  const signals: DeadCodeSignals = {
    // orphan: グラフに存在するが in-degree = 0
    orphan: hasNode && inDeg === 0,
    // fanInZero: importance 解析対象で全関数の fanIn 合計が 0
    fanInZero: agg.functionCount > 0 && agg.fanInTotal === 0,
    // noRecentChurn: コミット履歴があるが recent 窓内 (30 日) は変更なし
    noRecentChurn: hasHistory && churn === 0,
    // zeroCoverage: カバレッジデータがあり、行カバレッジが 0%
    zeroCoverage: coverageKnown && (coveragePct ?? 0) === 0,
    // isolatedCommunity: 小さいコミュニティ（≤3）に属している
    isolatedCommunity: communityId !== null && commSize > 0 && commSize <= ISOLATED_COMMUNITY_THRESHOLD,
  };

  // Phase 6 S5-D: 最近になって動き始めたコードか（dead code スコアには加算しない）
  const [newlyActiveEntry] = computeNewlyActive(
    [{ filePath: relPath, recentChurn: churn, priorChurn: priorChurnMap.get(relPath) ?? 0 }],
    { historyDays, windowDays: RECENT_CHURN_WINDOW_DAYS },
  );

  const m = matchIgnore(relPath, ignoreRules);
  const isIgnored = m.matched;
  const ignoreReason = m.matched ? `user:${m.pattern}` : '';
  const deadCodeScore = computeDeadCodeScore(signals, isIgnored);
  const lineCount = lineCountByFile.get(relPath) ?? 0;
  const c = centralityMap.get(relPath);
  const category = categoryByFile?.get(relPath) ?? 'logic';

  return {
    repoName,
    filePath: relPath,
    importanceScore: agg.importanceScore,
    fanInTotal: agg.fanInTotal,
    cognitiveComplexityMax: agg.cognitiveComplexityMax,
    lineCount,
    cyclomaticComplexityMax: agg.cyclomaticComplexityMax,
    functionCount: agg.functionCount,
    deadCodeScore,
    newlyActive: newlyActiveEntry.newlyActive,
    signals,
    isIgnored,
    ignoreReason,
    crossPkgInCount: c?.crossPkgIn ?? 0,
    externalConsumerPkgs: c?.externalConsumerPkgs ?? 0,
    totalInCount: c?.totalIn ?? 0,
    isBarrel: c?.isBarrel ?? false,
    centralityScore: c?.centralityScore ?? 0,
    category,
    analyzedAt,
  };
}

function safeReadFile(p: string): string | null {
  try {
    return fs.readFileSync(p, 'utf-8');
  } catch {
    return null;
  }
}

/**
 * エッジの target を集計して in-degree マップを返す。
 * キーは node.id（例: "anytime-markdown:packages/core/src/foo"）。
 */
function computeInDegree(graph: CodeGraph | null): Map<string, number> {
  const out = new Map<string, number>();
  if (!graph) return out;
  for (const e of graph.edges) {
    out.set(e.target, (out.get(e.target) ?? 0) + 1);
  }
  return out;
}

/**
 * 各コミュニティのノード数を返す。
 * キーは community id（number）。
 */
function computeCommunitySize(graph: CodeGraph | null): Map<number, number> {
  const out = new Map<number, number>();
  if (!graph) return out;
  for (const n of graph.nodes) {
    out.set(n.community, (out.get(n.community) ?? 0) + 1);
  }
  return out;
}

/**
 * node.id → community id の逆引きマップを構築する。
 * 呼び出し側でループ前に 1 回だけ作成し、以後 O(1) で community を引く。
 */
function buildNodeCommunityMap(graph: CodeGraph | null): Map<string, number> {
  const out = new Map<string, number>();
  if (!graph) return out;
  for (const n of graph.nodes) out.set(n.id, n.community);
  return out;
}

/**
 * 「拡張子なし相対パス」→「node.id」の逆引きマップを構築する。
 *
 * node.id のフォーマット: "${repoName}:${relPathNoExt}"
 * 例: "anytime-markdown:packages/core/src/foo"
 *
 * キーは "${repoName}:" プレフィックスを除いた部分（拡張子なし相対パス）。
 * 値は node.id 全体（in-degree マップとの照合に使う）。
 *
 * 同名異拡張子（foo.ts / foo.tsx）が共存する場合、最初に見つかったものが優先される。
 */
function buildRelPathNoExtToNodeIdIndex(
  graph: CodeGraph | null,
  repoName: string,
): Map<string, string> {
  const out = new Map<string, string>();
  if (!graph) return out;
  const prefix = `${repoName}:`;
  for (const n of graph.nodes) {
    if (!n.id.startsWith(prefix)) continue;
    const relPathNoExt = n.id.slice(prefix.length);
    if (!out.has(relPathNoExt)) {
      out.set(relPathNoExt, n.id);
    }
  }
  return out;
}

/**
 * 全ファイルパスの universe を収集する（相対パス、拡張子あり）。
 * - importance 解析対象のファイル（fileAggregates のキー）
 * - CodeGraph のノード（node.id から逆引き）
 *
 * CodeGraph のノード id は `<repo>:<stripExt(relPath)>` 形式で拡張子が剥がれている。
 * 当該 noExt パスを `lineCountByFile` の key (TS Compiler が認識している `.ts` /
 * `.tsx` の相対パス) と突き合わせて拡張子付きに復元する。
 *
 * 復元できない node (実在する `.ts` / `.tsx` ソースに対応しない stale な node や
 * code 以外の fileType) はテーブルに登録しない。これにより
 * `activity_current_file_analysis.file_path` 列は常に `.ts` / `.tsx` で終わる。
 */
function collectAllRelFilePaths(
  fileAggregates: ReadonlyMap<string, unknown>,
  graph: CodeGraph | null,
  repoName: string,
  lineCountByFile: ReadonlyMap<string, number>,
): Set<string> {
  const out = new Set<string>();
  // importance 解析済みファイル（相対パス、拡張子あり）
  for (const k of fileAggregates.keys()) out.add(k);
  if (!graph) return out;

  // noExt → withExt の逆引きインデックス。lineCountByFile のキーは
  // tsconfig ディレクトリ基準の相対パス (拡張子付き)。
  const noExtToWithExt = new Map<string, string>();
  for (const key of lineCountByFile.keys()) {
    noExtToWithExt.set(stripExt(key), key);
  }

  // 重複追加判定用に fileAggregates のキーから拡張子を剥がした集合を 1 度だけ作る。
  const aggregateKeysNoExt = new Set<string>();
  for (const k of fileAggregates.keys()) aggregateKeysNoExt.add(stripExt(k));

  const prefix = `${repoName}:`;
  for (const n of graph.nodes) {
    if (n.fileType !== 'code') continue;
    if (!n.id.startsWith(prefix)) continue;
    const relPathNoExt = n.id.slice(prefix.length);

    if (aggregateKeysNoExt.has(relPathNoExt)) continue;

    // TS Compiler が拾った実ファイルのみ登録対象とする
    const withExt = noExtToWithExt.get(relPathNoExt);
    if (!withExt) continue;
    out.add(withExt);
  }
  return out;
}

/**
 * .tsx? / .mdx? 拡張子を除去する（trailGraphToCodeGraphInputs.ts の stripExt と同実装）。
 */
function stripExt(relPath: string): string {
  return relPath.replace(/\.(tsx?|mdx?)$/, '');
}

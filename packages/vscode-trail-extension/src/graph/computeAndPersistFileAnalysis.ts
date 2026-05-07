/**
 * computeAndPersistFileAnalysis
 *
 * dead code シグナルを集計し、current_file_analysis / current_function_analysis に
 * 洗い替え方式（clear → upsert）で永続化するメインヘルパー。
 *
 * ## パス変換一覧
 * 本モジュールでは「analysisRoot からの相対パス（拡張子あり）」を共通キーとして使う。
 *
 * | データソース             | 元の形式                                 | 変換方法                                          |
 * |-------------------------|------------------------------------------|----------------------------------------------------|
 * | ScoredFunction.filePath  | 絶対パス                                 | path.relative(analysisRoot, filePath)              |
 * | coverage file_path       | 絶対パス（istanbul coverage-summary.json）| path.relative(analysisRoot, file_path)             |
 * | commit_files.file_path   | git 相対パス（リポジトリルート基準）     | そのまま（analysisRoot = リポジトリルートの前提）  |
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
  aggregateImportanceToFile,
} from '@anytime-markdown/trail-core/deadCode';
import type {
  FileAnalysisRow,
  FunctionAnalysisRow,
  DeadCodeSignals,
  IgnoreRules,
} from '@anytime-markdown/trail-core/deadCode';
import type { ScoredFunction } from '@anytime-markdown/trail-core/importance';
import type { CodeGraph } from '@anytime-markdown/trail-core/codeGraph';

export interface ComputeAndPersistFileAnalysisOpts {
  /** ワークスペースの絶対パス。git リポジトリルートと一致することを想定。 */
  readonly analysisRoot: string;
  /** path.basename(analysisRoot) と同値。セッションの repo_name として使う。 */
  readonly repoName: string;
  readonly trailDb: TrailDatabase;
  readonly scored: readonly ScoredFunction[];
  /** ファイル相対パス → 行数のマップ（tsconfig ディレクトリ基準の相対パス） */
  readonly lineCountByFile: ReadonlyMap<string, number>;
}

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;
/** コミュニティサイズがこの値以下を "isolated" とみなす。 */
const ISOLATED_COMMUNITY_THRESHOLD = 3;

export async function computeAndPersistFileAnalysis(
  opts: ComputeAndPersistFileAnalysisOpts,
): Promise<{ fileRows: number; functionRows: number }> {
  const { analysisRoot, repoName, trailDb, scored, lineCountByFile } = opts;
  const analyzedAt = new Date().toISOString();
  const sinceIso = new Date(Date.now() - NINETY_DAYS_MS).toISOString();

  // 1. .trail/dead-code-ignore ルール読み込み
  const ignorePath = path.join(analysisRoot, '.trail', 'dead-code-ignore');
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

  // 4. node.id → 相対パス(拡張子なし) の逆引きマップを構築
  //    キー: 拡張子なし相対パス（例 "packages/core/src/foo"）
  //    値: node.id（例 "anytime-markdown:packages/core/src/foo"）
  const relPathNoExtToNodeId = buildRelPathNoExtToNodeIdIndex(codeGraph, repoName);

  // 5. 90 日以内のチャーン（commit_files.file_path = git 相対パス）
  const churnMap = trailDb.getCommitFilesChurnSince(repoName, sinceIso);
  // 5b. 全期間の commit 履歴（noRecentChurn 判定用）
  // churnMap は 90 日窓のみ返すため、それを hasHistory として使うと
  // hasHistory && churn===0 が論理的に成立しない。全期間の履歴を別途取得する。
  const everChurned = trailDb.getCommitFilesEverChurned(repoName);

  // 6. カバレッジ（coverage file_path = 絶対パス → 相対化）
  const coverageRows = trailDb.getCurrentCoverage(repoName);
  const coverageMap = new Map<string, number>(); // key = 相対パス
  for (const r of coverageRows) {
    if (r.file_path === '__total__') continue;
    // istanbul は絶対パスをキーとして使う
    const rel = path.isAbsolute(r.file_path)
      ? path.relative(analysisRoot, r.file_path)
      : r.file_path;
    coverageMap.set(rel, r.lines_pct);
  }

  // 7. 全ファイルパス（相対）の universe を収集
  //    = importance 解析対象 ∪ code graph ノード（lineCountByFile で拡張子復元）
  const allRelFilePaths = collectAllRelFilePaths(fileAggregates, codeGraph, repoName, lineCountByFile);

  // 8. FileAnalysisRow を構築
  const fileRows: FileAnalysisRow[] = [];
  for (const relPath of allRelFilePaths) {
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
    const communityId = hasNode ? findCommunityForNode(codeGraph, nodeId) : null;
    const commSize = communityId !== null ? (communitySize.get(communityId) ?? 0) : 0;

    const signals: DeadCodeSignals = {
      // orphan: グラフに存在するが in-degree = 0
      orphan: hasNode && inDeg === 0,
      // fanInZero: importance 解析対象で全関数の fanIn 合計が 0
      fanInZero: agg.functionCount > 0 && agg.fanInTotal === 0,
      // noRecentChurn: コミット履歴があるがこの 90 日変更なし
      noRecentChurn: hasHistory && churn === 0,
      // zeroCoverage: カバレッジデータがあり、行カバレッジが 0%
      zeroCoverage: coverageKnown && (coveragePct ?? 0) === 0,
      // isolatedCommunity: 小さいコミュニティ（≤3）に属している
      isolatedCommunity: communityId !== null && commSize > 0 && commSize <= ISOLATED_COMMUNITY_THRESHOLD,
    };

    const m = matchIgnore(relPath, ignoreRules);
    const isIgnored = m.matched;
    const ignoreReason = m.matched ? `user:${m.pattern}` : '';

    const deadCodeScore = computeDeadCodeScore(signals, isIgnored);

    const lineCount = lineCountByFile.get(relPath) ?? 0;
    const cyclomaticComplexityMax = agg.cyclomaticComplexityMax;
    fileRows.push({
      repoName,
      filePath: relPath,
      importanceScore: agg.importanceScore,
      fanInTotal: agg.fanInTotal,
      cognitiveComplexityMax: agg.cognitiveComplexityMax,
      lineCount,
      cyclomaticComplexityMax,
      functionCount: agg.functionCount,
      deadCodeScore,
      signals,
      isIgnored,
      ignoreReason,
      analyzedAt,
    });
  }

  // 9. FunctionAnalysisRow を構築（filePath を相対パスに変換）
  const functionRows: FunctionAnalysisRow[] = scored.map((fn) => ({
    repoName,
    filePath: path.relative(analysisRoot, fn.filePath),
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
    analyzedAt,
  }));

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
 * node.id から community id を返す。
 */
function findCommunityForNode(graph: CodeGraph | null, nodeId: string): number | null {
  if (!graph) return null;
  const n = graph.nodes.find((x) => x.id === nodeId);
  return n != null ? n.community : null;
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
 * `current_file_analysis.file_path` 列は常に `.ts` / `.tsx` で終わる。
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

  const prefix = `${repoName}:`;
  for (const n of graph.nodes) {
    if (n.fileType !== 'code') continue;
    if (!n.id.startsWith(prefix)) continue;
    const relPathNoExt = n.id.slice(prefix.length);

    // 既に fileAggregates にあれば重複追加しない
    const alreadyCovered = [...fileAggregates.keys()].some(
      (k) => stripExt(k) === relPathNoExt,
    );
    if (alreadyCovered) continue;

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

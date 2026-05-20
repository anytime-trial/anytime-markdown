import type { C4Model } from './types';
import type { CodeGraph, CodeGraphNode, CommunitySummary } from '../codeGraph';
import { collectDescendantIds } from './view/collectDescendants';

export interface CommunityOverlayEntry {
  /** C4 要素 ID（pkg_* / file::*） */
  readonly elementId: string;
  /** 最頻コミュニティ番号 */
  readonly dominantCommunity: number;
  /** 最頻コミュニティの占有率（0..1） */
  readonly dominantRatio: number;
  /** 配下ノードのコミュニティ別出現回数（降順、同数時は community 番号昇順） */
  readonly breakdown: ReadonlyArray<{ readonly community: number; readonly count: number }>;
  /** L4 のみ true になりうる */
  readonly isGodNode: boolean;
  /** AI 生成のコミュニティ要約（あれば） */
  readonly communitySummary?: CommunitySummary;
}

const FILE_PREFIX = 'file::';
const STRIPPABLE_EXT_RE = /\.(tsx?|mdx?)$/;

function stripExt(filePath: string): string {
  return filePath.replace(STRIPPABLE_EXT_RE, '');
}

/**
 * CodeGraph ノードを「拡張子を除いた相対パス」で索引化する。
 *
 * - キー: `${repo}:${cleaned}` の colon 以降部分（拡張子なし相対パス）
 * - 値: 同じパスを持つノード配列（複数 repo にまたがる場合あり）
 */
function indexByPath(codeGraph: CodeGraph): ReadonlyMap<string, readonly CodeGraphNode[]> {
  const map = new Map<string, CodeGraphNode[]>();
  for (const node of codeGraph.nodes) {
    const colonIdx = node.id.indexOf(':');
    if (colonIdx === -1) continue;
    const path = node.id.slice(colonIdx + 1);
    let arr = map.get(path);
    if (!arr) {
      arr = [];
      map.set(path, arr);
    }
    arr.push(node);
  }
  return map;
}

/**
 * 候補ノード群から `selectedRepo` の repo を優先して返す。
 *
 * - selectedRepo が候補のいずれかの `node.repo` と一致 → そのノードを返す
 * - 一致しない／selectedRepo が null → 先頭候補を返す（パスのみマッチ・全 repo フォールバック）
 *
 * これにより、C4 側の repoName（`path.basename(wsRoot)`）と CodeGraph 側の
 * `repo.id`（拡張機能の設定で別名になる場合あり）の不一致でもオーバーレイが成立する。
 */
function pickByRepo(
  candidates: readonly CodeGraphNode[],
  selectedRepo: string | null,
): CodeGraphNode | undefined {
  if (candidates.length === 0) return undefined;
  if (selectedRepo) {
    const matched = candidates.find((n) => n.repo === selectedRepo);
    if (matched) return matched;
  }
  return candidates[0];
}

/** file:: 要素 ID から拡張子なし相対パスを返す。 */
function cleanedPath(elementId: string): string {
  return stripExt(elementId.slice(FILE_PREFIX.length));
}

/** nodesByPath + selectedRepo から一致 CodeGraphNode を返す。 */
function resolveNode(
  elementId: string,
  nodesByPath: ReadonlyMap<string, readonly CodeGraphNode[]>,
  selectedRepo: string | null,
): CodeGraphNode | undefined {
  const cleaned = cleanedPath(elementId);
  const candidates = nodesByPath.get(cleaned);
  return candidates ? pickByRepo(candidates, selectedRepo) : undefined;
}

/** L4 オーバーレイエントリを生成する。 */
function buildL4Entry(
  el: C4Model['elements'][number],
  nodesByPath: ReadonlyMap<string, readonly CodeGraphNode[]>,
  selectedRepo: string | null,
  godNodeSet: ReadonlySet<string>,
  summaries: CodeGraph['communitySummaries'],
): CommunityOverlayEntry | null {
  if (el.type !== 'code') return null;
  if (!el.id.startsWith(FILE_PREFIX)) return null;
  const node = resolveNode(el.id, nodesByPath, selectedRepo);
  if (!node) return null;
  return {
    elementId: el.id,
    dominantCommunity: node.community,
    dominantRatio: 1,
    breakdown: [{ community: node.community, count: 1 }],
    isGodNode: godNodeSet.has(node.id),
    communitySummary: summaries?.[node.community],
  };
}

/** コミュニティカウント Map からブレークダウン配列を生成する。 */
function buildBreakdown(
  counts: Map<number, number>,
): Array<{ community: number; count: number }> {
  return Array.from(counts, ([community, count]) => ({ community, count }))
    .sort((a, b) => (b.count !== a.count ? b.count - a.count : a.community - b.community));
}

/** L3 component 要素の descendant id から community カウントを集計する。 */
function aggregateCommunityCountsForComponent(
  elementId: string,
  c4Model: C4Model,
  nodesByPath: ReadonlyMap<string, readonly CodeGraphNode[]>,
  selectedRepo: string | null,
): Map<number, number> {
  const descendantIds = collectDescendantIds(c4Model.elements, elementId);
  const counts = new Map<number, number>();
  for (const id of descendantIds) {
    if (!id.startsWith(FILE_PREFIX)) continue;
    const node = resolveNode(id, nodesByPath, selectedRepo);
    if (!node) continue;
    counts.set(node.community, (counts.get(node.community) ?? 0) + 1);
  }
  return counts;
}

/** L3 オーバーレイエントリを生成する。 */
function buildL3Entry(
  el: C4Model['elements'][number],
  c4Model: C4Model,
  nodesByPath: ReadonlyMap<string, readonly CodeGraphNode[]>,
  selectedRepo: string | null,
  summaries: CodeGraph['communitySummaries'],
): CommunityOverlayEntry | null {
  if (el.type !== 'component') return null;
  const counts = aggregateCommunityCountsForComponent(el.id, c4Model, nodesByPath, selectedRepo);
  if (counts.size === 0) return null;

  const breakdown = buildBreakdown(counts);
  const total = breakdown.reduce((sum, e) => sum + e.count, 0);
  const dominant = breakdown[0];

  return {
    elementId: el.id,
    dominantCommunity: dominant.community,
    dominantRatio: dominant.count / total,
    breakdown,
    isGodNode: false,
    communitySummary: summaries?.[dominant.community],
  };
}

/**
 * C4 要素 ID と CodeGraph コミュニティを対応付けるオーバーレイマップを生成する。
 *
 * - L4: `type === 'code'` の要素を CodeGraph ノードと 1:1 対応付ける
 * - L3: `type === 'component'` の要素について配下の `code` を集約し、最頻コミュニティを決定する
 *
 * 同数最頻時は community 番号昇順を優先（決定性確保）。
 *
 * マッチング戦略:
 * 1. C4 要素 ID から `file::` プレフィックスと拡張子を除いた相対パスを取得
 * 2. CodeGraph ノードを「拡張子を除いた相対パス」で索引化済み Map から候補を引く
 * 3. `selectedRepo` が候補内の `node.repo` と一致すればそれを採用、
 *    そうでなければ先頭候補を採用（パスマッチのみで重畳を成立させる）
 */
export function computeCommunityOverlay(
  c4Model: C4Model,
  codeGraph: CodeGraph,
  level: 3 | 4,
  selectedRepo: string | null,
): ReadonlyMap<string, CommunityOverlayEntry> {
  const result = new Map<string, CommunityOverlayEntry>();
  if (level !== 3 && level !== 4) return result;
  if (codeGraph.nodes.length === 0) return result;

  const nodesByPath = indexByPath(codeGraph);
  if (nodesByPath.size === 0) return result;

  const godNodeSet = new Set(codeGraph.godNodes);
  const summaries = codeGraph.communitySummaries;

  if (level === 4) {
    for (const el of c4Model.elements) {
      const entry = buildL4Entry(el, nodesByPath, selectedRepo, godNodeSet, summaries);
      if (entry) result.set(el.id, entry);
    }
    return result;
  }

  // level === 3
  for (const el of c4Model.elements) {
    const entry = buildL3Entry(el, c4Model, nodesByPath, selectedRepo, summaries);
    if (entry) result.set(el.id, entry);
  }
  return result;
}

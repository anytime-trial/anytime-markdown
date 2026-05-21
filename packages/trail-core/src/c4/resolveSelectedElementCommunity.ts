import type { C4Element, C4Model } from './types';
import type { CommunitySummary } from '../codeGraph';
import type { CommunityOverlayEntry } from './computeCommunityOverlay';

export interface ResolveSelectedElementCommunityInput {
  readonly element: C4Element;
  readonly c4Model: C4Model;
  readonly communityOverlayL3: ReadonlyMap<string, CommunityOverlayEntry> | null;
  readonly communityOverlayL4: ReadonlyMap<string, CommunityOverlayEntry> | null;
  readonly communitySummaries?: Record<number, CommunitySummary>;
}

/**
 * 情報パネルに表示する「選択要素のコミュニティ」を解決する。
 *
 * - `code` (C4): L4 オーバーレイの直接ヒットを返す
 * - `component` (C3): L3 オーバーレイの直接ヒットを返す
 * - `container` (C2): 配下 component の breakdown を集約して最頻コミュニティを返す
 * - その他: null
 *
 * 直接ヒットを優先し、なければタイプ別フォールバックを試行する。
 * いずれにも当たらなければ null（パネルに community セクションを描画しない）。
 */
export function resolveSelectedElementCommunity(
  input: ResolveSelectedElementCommunityInput,
): CommunityOverlayEntry | null {
  const { element, c4Model, communityOverlayL3, communityOverlayL4, communitySummaries } = input;

  const direct =
    communityOverlayL3?.get(element.id) ??
    communityOverlayL4?.get(element.id) ??
    null;
  if (direct) return direct;

  if (element.type !== 'container' || !communityOverlayL3) return null;

  const counts = new Map<number, number>();
  for (const child of c4Model.elements) {
    if (child.boundaryId !== element.id || child.type !== 'component') continue;
    const entry = communityOverlayL3.get(child.id);
    if (!entry) continue;
    for (const { community: cid, count } of entry.breakdown) {
      counts.set(cid, (counts.get(cid) ?? 0) + count);
    }
  }
  if (counts.size === 0) return null;

  const breakdown = Array.from(counts, ([community, count]) => ({ community, count }))
    .sort((a, b) => (b.count === a.count ? a.community - b.community : b.count - a.count));
  const total = breakdown.reduce((sum, e) => sum + e.count, 0);
  const dominant = breakdown[0];

  return {
    elementId: element.id,
    dominantCommunity: dominant.community,
    dominantRatio: dominant.count / total,
    breakdown,
    isGodNode: false,
    communitySummary: communitySummaries?.[dominant.community],
  };
}

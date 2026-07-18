import { computeBusFactor } from '@anytime-markdown/trail-core';
import type { BusFactorEntry, FileAuthorCommitRow } from '@anytime-markdown/trail-core';
import { buildC4ElementById, mapFileToC4Elements } from '@anytime-markdown/trail-core/c4';
import type { C4Model } from '@anytime-markdown/trail-core/c4';

/**
 * ファイル×著者×コミットの生行を C4 要素単位の属人度へ集約する（Phase 6 S5-B）。
 *
 * defect-risk のような「子の値を親へ最大値伝播」はしない。属人度は合算前後で意味が変わるため、
 * 要素へ写した生行を合算してから score を再計算する（1 コミットが同一要素内の複数ファイルを
 * 触っても 1 コミットとして数えるため、ファイル単位の結果を足し合わせる方式は使えない）。
 */
export function buildBusFactorElementMap(
  rows: readonly FileAuthorCommitRow[],
  c4Model: C4Model,
  minCommits: number,
  /**
   * サーバー側で生行が上限で切り詰められたか。切り詰められた行から再集計すると
   * 著者比率もコミット数も誤るため、集計せず null を返す（誤った値を出さない）。
   */
  rowsTruncated = false,
): ReadonlyMap<string, BusFactorEntry> | null {
  if (rowsTruncated) return null;
  const elementById = buildC4ElementById(c4Model.elements);
  const entries = computeBusFactor(rows, {
    minCommits,
    unitsOf: (filePath) => mapFileToC4Elements(filePath, elementById).map((m) => m.elementId),
  });
  return new Map(entries.map((e) => [e.unitId, e] as const));
}

/** オーバーレイ着色用に score のみ取り出す（未判定 = null の単位は含めない） */
export function busFactorScoreMap(
  byElement: ReadonlyMap<string, BusFactorEntry>,
): ReadonlyMap<string, number> {
  const out = new Map<string, number>();
  for (const [id, entry] of byElement) {
    if (entry.score !== null) out.set(id, entry.score);
  }
  return out;
}

import type { BusFactorEntry } from '@anytime-markdown/trail-core';

/**
 * C4 要素単位の属人度エントリを ID 索引にする（Phase 6 S5-B）。
 *
 * 集約そのものはサーバー側（`/api/bus-factor?unit=c4`）が行う。生行をクライアントへ送って
 * 再集計する方式は、大規模リポジトリで転送量が上限に当たり、切り詰めた行から算出した属人度が
 * 誤値になるため廃止した。
 */
export function busFactorEntryMap(
  entries: readonly BusFactorEntry[],
): ReadonlyMap<string, BusFactorEntry> {
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

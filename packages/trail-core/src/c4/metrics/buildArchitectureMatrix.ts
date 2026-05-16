import type { C4Element } from '../types';
import { collectDescendantIds } from '../view/collectDescendants';

export type FileCategoryValue = 'ui' | 'logic' | 'excluded';

export interface ArchitectureFileEntry {
  /** L4 (code) C4 要素の ID。例 "file::packages/foo/src/bar.ts" */
  readonly elementId: string;
  readonly category: FileCategoryValue;
}

export interface ArchitectureMetricsEntry {
  /** 配下 (または自身) の UI ファイル数 */
  readonly uiCount: number;
  /** 配下 (または自身) の Logic ファイル数 */
  readonly logicCount: number;
  /**
   * UI 率 = uiCount / (uiCount + logicCount)。
   * excluded は分母に含めない。両方 0 のときは undefined。
   */
  readonly ratio?: number;
}

export type ArchitectureMatrix = Record<string, ArchitectureMetricsEntry>;

/**
 * C4 要素配下のファイルを UI / Logic / Excluded に集計し、UI 率を計算する。
 *
 * - L4 (code 要素) は単一ファイルの category を反映 (ratio = 1 / 0)
 * - L3/L2 (component / container 要素) は子孫の code 要素を集計
 * - excluded は分母に含めない (test / stories / 型のみのファイルを集計から除外)
 * - 配下に code 要素がない、もしくは集計対象 (ui+logic) がゼロの要素は出力に含めない
 */
export function buildArchitectureMatrix(
  fileEntries: readonly ArchitectureFileEntry[],
  elements: readonly C4Element[],
): ArchitectureMatrix {
  const entryById = new Map<string, ArchitectureFileEntry>();
  for (const e of fileEntries) {
    entryById.set(e.elementId, e);
  }

  const out: Record<string, ArchitectureMetricsEntry> = {};
  for (const el of elements) {
    if (el.type === 'code') {
      const entry = entryById.get(el.id);
      if (!entry) continue;
      if (entry.category === 'excluded') continue;
      const isUi = entry.category === 'ui';
      out[el.id] = {
        uiCount: isUi ? 1 : 0,
        logicCount: isUi ? 0 : 1,
        ratio: isUi ? 1 : 0,
      };
      continue;
    }
    // boundary 要素 (system / container / component)
    const descendants = collectDescendantIds(elements, el.id);
    let uiCount = 0;
    let logicCount = 0;
    for (const id of descendants) {
      const desc = elements.find((e) => e.id === id);
      if (desc?.type !== 'code') continue;
      const entry = entryById.get(id);
      if (!entry) continue;
      if (entry.category === 'excluded') continue;
      if (entry.category === 'ui') uiCount += 1;
      else logicCount += 1;
    }
    const total = uiCount + logicCount;
    if (total === 0) continue;
    out[el.id] = {
      uiCount,
      logicCount,
      ratio: uiCount / total,
    };
  }
  return out;
}

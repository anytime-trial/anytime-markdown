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

/** L4 code 要素 1 件のメトリクスを生成する。excluded の場合は null を返す。 */
function buildCodeElementEntry(
  entry: ArchitectureFileEntry,
): ArchitectureMetricsEntry | null {
  if (entry.category === 'excluded') return null;
  const isUi = entry.category === 'ui';
  return {
    uiCount: isUi ? 1 : 0,
    logicCount: isUi ? 0 : 1,
    ratio: isUi ? 1 : 0,
  };
}

/** 子孫の code 要素を集計して ui/logic カウントを返す。 */
function countDescendantCategories(
  elements: readonly C4Element[],
  descendantIds: ReadonlySet<string>,
  entryById: ReadonlyMap<string, ArchitectureFileEntry>,
): { uiCount: number; logicCount: number } {
  let uiCount = 0;
  let logicCount = 0;
  for (const id of descendantIds) {
    const desc = elements.find((e) => e.id === id);
    if (desc?.type !== 'code') continue;
    const entry = entryById.get(id);
    if (!entry || entry.category === 'excluded') continue;
    if (entry.category === 'ui') uiCount += 1;
    else logicCount += 1;
  }
  return { uiCount, logicCount };
}

/** boundary 要素（system/container/component）のメトリクスを生成する。total=0 なら null。 */
function buildBoundaryElementEntry(
  el: C4Element,
  elements: readonly C4Element[],
  entryById: ReadonlyMap<string, ArchitectureFileEntry>,
): ArchitectureMetricsEntry | null {
  const descendants = collectDescendantIds(elements, el.id);
  const { uiCount, logicCount } = countDescendantCategories(elements, descendants, entryById);
  const total = uiCount + logicCount;
  if (total === 0) return null;
  return { uiCount, logicCount, ratio: uiCount / total };
}

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
      const metrics = buildCodeElementEntry(entry);
      if (metrics) out[el.id] = metrics;
      continue;
    }
    // boundary 要素 (system / container / component)
    const metrics = buildBoundaryElementEntry(el, elements, entryById);
    if (metrics) out[el.id] = metrics;
  }
  return out;
}

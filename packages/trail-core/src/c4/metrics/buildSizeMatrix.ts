import type { C4Element } from '../types';
import { collectDescendantIds } from '../view/collectDescendants';

export interface SizeFileEntry {
  readonly elementId: string;   // 例: "file::packages/foo/src/bar.ts"
  readonly lineCount: number;
  readonly functionCount: number;
}

export interface SizeMetricsEntry {
  /** 配下に含まれる code ファイルの行数合計 (boundary 要素の場合)。code 要素ではそのファイルの行数。 */
  readonly loc: number;
  /** 配下の code ファイルのうち、単一ファイルで最大の行数。code 要素では loc と一致する。 */
  readonly locMax: number;
  readonly files: number;
  readonly functions: number;
}

export type SizeMatrix = Record<string, SizeMetricsEntry>;

// code 要素単体のサイズ指標。空ファイル (lineCount 0) は対象外で null を返す。
function buildCodeSize(entry: SizeFileEntry | undefined): SizeMetricsEntry | null {
  if (!entry || entry.lineCount === 0) return null;
  return {
    loc: entry.lineCount,
    locMax: entry.lineCount,
    files: 1,
    functions: entry.functionCount,
  };
}

// boundary 要素配下の code ファイルを合算する。データが無ければ null。
function aggregateBoundarySize(
  elements: readonly C4Element[],
  boundaryId: string,
  entryById: ReadonlyMap<string, SizeFileEntry>,
): SizeMetricsEntry | null {
  const descendants = collectDescendantIds(elements, boundaryId);
  const codeIds = new Set<string>(
    elements.filter((e) => e.type === 'code').map((e) => e.id),
  );
  let loc = 0, locMax = 0, files = 0, functions = 0;
  let hasData = false;
  for (const id of descendants) {
    if (!codeIds.has(id)) continue;
    const entry = entryById.get(id);
    if (!entry || entry.lineCount === 0) continue;
    loc += entry.lineCount;
    if (entry.lineCount > locMax) locMax = entry.lineCount;
    files += 1;
    functions += entry.functionCount;
    hasData = true;
  }
  return hasData ? { loc, locMax, files, functions } : null;
}

export function buildSizeMatrix(
  fileEntries: readonly SizeFileEntry[],
  elements: readonly C4Element[],
): SizeMatrix {
  const entryById = new Map<string, SizeFileEntry>();
  for (const e of fileEntries) {
    entryById.set(e.elementId, e);
  }

  const out: Record<string, SizeMetricsEntry> = {};
  for (const el of elements) {
    const metrics =
      el.type === 'code'
        ? buildCodeSize(entryById.get(el.id))
        : aggregateBoundarySize(elements, el.id, entryById);
    if (metrics) out[el.id] = metrics;
  }
  return out;
}

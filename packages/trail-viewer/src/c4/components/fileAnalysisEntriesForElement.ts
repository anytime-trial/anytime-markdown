import type { C4Element } from '@anytime-markdown/trail-activity/c4';
import { buildC4ElementById, mapFileToC4Elements } from '@anytime-markdown/trail-activity/c4';
import type { FileAnalysisApiEntry } from '../hooks/fetchFileAnalysisApi';

/**
 * `fileAnalysisEntries` の中から、指定した C4 要素 ID に紐付くエントリだけを返す。
 *
 * mapFileToC4Elements で file → element のマッピングを解決し、
 * いずれかのマッピング結果が `elementId` と一致するエントリを収集する。
 */
export function fileAnalysisEntriesForElement(
  entries: readonly FileAnalysisApiEntry[],
  elementId: string,
  elements: readonly C4Element[],
): readonly FileAnalysisApiEntry[] {
  const elementById = buildC4ElementById(elements);
  const out: FileAnalysisApiEntry[] = [];
  for (const e of entries) {
    const mappings = mapFileToC4Elements(e.filePath, elementById);
    if (mappings.some((m) => m.elementId === elementId)) {
      out.push(e);
    }
  }
  return out;
}

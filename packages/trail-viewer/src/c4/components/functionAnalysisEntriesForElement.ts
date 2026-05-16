import type { C4Element } from '@anytime-markdown/trail-core/c4';
import { buildC4ElementById, mapFileToC4Elements } from '@anytime-markdown/trail-core/c4';
import type { FunctionAnalysisApiEntry } from '../hooks/fetchFunctionAnalysisApi';

/**
 * `functionAnalysisEntries` の中から、指定した C4 要素 ID に紐付く関数だけを返す。
 *
 * mapFileToC4Elements で entry.filePath → element のマッピングを解決し、
 * いずれかのマッピング結果が `elementId` と一致する関数を収集する。
 */
export function functionAnalysisEntriesForElement(
  entries: readonly FunctionAnalysisApiEntry[],
  elementId: string,
  elements: readonly C4Element[],
): readonly FunctionAnalysisApiEntry[] {
  const elementById = buildC4ElementById(elements);
  const out: FunctionAnalysisApiEntry[] = [];
  for (const e of entries) {
    const mappings = mapFileToC4Elements(e.filePath, elementById);
    if (mappings.some((m) => m.elementId === elementId)) {
      out.push(e);
    }
  }
  return out;
}

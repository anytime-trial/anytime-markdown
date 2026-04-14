import { classifyByFeatures } from '../../domain/engine/CostOptimizer';
import { mapFilesToC4Elements } from '../../domain/engine/c4Mapper';
import type { C4Element, ComplexityClass, ComplexityEntry, ComplexityMatrix } from '../types';

// ─── Types ────────────────────────────────────────────────────────────────────

/** trail-core が受け取るメッセージの最小データ */
export interface MessageInput {
  readonly outputTokens: number;
  readonly toolCallNames: readonly string[];
  /** Edit / Write ツールで触れたファイルパスの一覧 */
  readonly editedFilePaths: readonly string[];
}

// ─── Complexity ordering ──────────────────────────────────────────────────────

const COMPLEXITY_ORDER: Record<ComplexityClass, number> = {
  'low-complexity':  0,
  'search-only':     1,
  'multi-file-edit': 2,
  'high-complexity': 3,
};

function higherClass(a: ComplexityClass, b: ComplexityClass): ComplexityClass {
  return COMPLEXITY_ORDER[a] >= COMPLEXITY_ORDER[b] ? a : b;
}

// label が ComplexityClass に該当しない場合（'default' 等）は 'low-complexity' 扱い
function toComplexityClass(label: string | undefined): ComplexityClass {
  if (
    label === 'low-complexity' ||
    label === 'search-only' ||
    label === 'multi-file-edit' ||
    label === 'high-complexity'
  ) {
    return label;
  }
  return 'low-complexity';
}

const SEARCH_TOOLS = new Set(['Grep', 'Glob', 'Read', 'WebSearch', 'WebFetch']);
const EDIT_TOOLS = new Set(['Edit', 'Write', 'NotebookEdit']);

/**
 * 全ルールを独立評価して最高クラスを返す。
 * classifyByFeatures は first-match のため、複数ルールが同時に成立する場合は
 * 高い方を見逃す可能性がある。highest 計算にはこちらを使う。
 */
function classifyHighest(features: {
  outputTokens: number;
  toolCallNames: readonly string[];
  uniqueFileCount: number;
}): ComplexityClass {
  const { outputTokens, toolCallNames, uniqueFileCount } = features;
  let highest: ComplexityClass = 'low-complexity';

  if (
    toolCallNames.length > 0 &&
    toolCallNames.every(n => SEARCH_TOOLS.has(n))
  ) {
    highest = higherClass(highest, 'search-only');
  }

  if (
    toolCallNames.some(n => EDIT_TOOLS.has(n)) &&
    uniqueFileCount >= 3
  ) {
    highest = higherClass(highest, 'multi-file-edit');
  }

  const uniqueToolTypes = new Set(toolCallNames).size;
  if (outputTokens > 3000 && uniqueToolTypes >= 3) {
    highest = higherClass(highest, 'high-complexity');
  }

  return highest;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function computeComplexityMatrix(
  messages: readonly MessageInput[],
  c4Elements: readonly C4Element[],
): ComplexityMatrix {
  // elementId → { counts per class, highest }
  const perElement = new Map<string, { counts: Record<ComplexityClass, number>; highest: ComplexityClass }>();

  function getOrCreate(elementId: string) {
    let e = perElement.get(elementId);
    if (!e) {
      e = {
        counts: { 'low-complexity': 0, 'search-only': 0, 'multi-file-edit': 0, 'high-complexity': 0 },
        highest: 'low-complexity',
      };
      perElement.set(elementId, e);
    }
    return e;
  }

  for (const msg of messages) {
    const uniqueFileCount = msg.editedFilePaths.length;
    const features = {
      outputTokens: msg.outputTokens,
      toolCallNames: msg.toolCallNames,
      uniqueFileCount,
    };

    // mostFrequent 集計用: first-match による単一ラベル
    const cls = toComplexityClass(classifyByFeatures(features).label);
    // highest 計算用: 全ルール独立評価
    const highestCls = classifyHighest(features);

    // ファイルパス → C4要素へのマッピング
    const mappings = mapFilesToC4Elements(msg.editedFilePaths, c4Elements);
    for (const mapping of mappings) {
      const e = getOrCreate(mapping.elementId);
      e.counts[cls]++;
      e.highest = higherClass(e.highest, highestCls);
    }
  }

  const entries: ComplexityEntry[] = [];
  for (const [elementId, data] of perElement) {
    // 最多分類を求める（同率は高い方を優先）
    let mostFrequent: ComplexityClass = 'low-complexity';
    let maxCount = -1;
    for (const [cls, count] of Object.entries(data.counts) as [ComplexityClass, number][]) {
      if (count > maxCount || (count === maxCount && COMPLEXITY_ORDER[cls] > COMPLEXITY_ORDER[mostFrequent])) {
        mostFrequent = cls;
        maxCount = count;
      }
    }
    entries.push({
      elementId,
      mostFrequent,
      highest: data.highest,
      totalCount: Object.values(data.counts).reduce((a, b) => a + b, 0),
    });
  }

  return { entries, generatedAt: Date.now() };
}

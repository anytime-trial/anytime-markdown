// domain/engine/CostOptimizer.ts — Cost classification logic

export interface CostRule {
  readonly pattern: string;
  readonly model: string;
  readonly label: string;
}

export interface CostRulesConfig {
  readonly rules: readonly CostRule[];
  readonly default: string;
}

export interface CostClassification {
  readonly model: string;
  readonly label?: string;
}

export interface MessageFeatures {
  readonly outputTokens: number;
  readonly toolCallNames: readonly string[];
  readonly uniqueFileCount: number;
}

const SEARCH_TOOLS = new Set(['Grep', 'Glob', 'Read', 'WebSearch', 'WebFetch']);
const EDIT_TOOLS = new Set(['Edit', 'Write', 'NotebookEdit']);

export function classifyByRules(
  userContent: string,
  config: CostRulesConfig,
): CostClassification {
  const text = userContent.trim();
  for (const rule of config.rules) {
    const regex = new RegExp(rule.pattern, 'i');
    if (regex.test(text)) {
      return { model: rule.model, label: rule.label };
    }
  }
  return { model: config.default, label: undefined };
}

export function classifyByFeatures(features: MessageFeatures): CostClassification {
  const { outputTokens, toolCallNames, uniqueFileCount } = features;

  // Low output, no tools -> haiku
  if (outputTokens < 500 && toolCallNames.length === 0) {
    return { model: 'haiku', label: 'low-complexity' };
  }

  // Search-only tools -> sonnet
  if (
    toolCallNames.length > 0 &&
    toolCallNames.every((name) => SEARCH_TOOLS.has(name))
  ) {
    return { model: 'sonnet', label: 'search-only' };
  }

  // Multi-file edits -> opus
  if (
    toolCallNames.some((name) => EDIT_TOOLS.has(name)) &&
    uniqueFileCount >= 3
  ) {
    return { model: 'opus', label: 'multi-file-edit' };
  }

  // High output + diverse tools -> opus
  const uniqueToolTypes = new Set(toolCallNames).size;
  if (outputTokens > 3000 && uniqueToolTypes >= 3) {
    return { model: 'opus', label: 'high-complexity' };
  }

  return { model: 'sonnet', label: 'default' };
}

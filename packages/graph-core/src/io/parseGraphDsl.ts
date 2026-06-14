/**
 * anytime-graph フェンスの図種専用 DSL を解析し、`ThinkingDiagramSpec` に変換する。
 *
 * 設計方針:
 * - 先頭行に `type: <図種>` を必須とする。
 * - 図種ごとに最小限の宣言的構文（header `key: value` ＋ `- bullet`）を使う。
 * - 不正入力は黙って無視せず、原因と修正方法を含む明示エラーを投げる
 *   （`~/.claude/CLAUDE.md` のログ方針: silent catch 禁止）。
 */

import type { ThinkingDiagramSpec, ThinkingDiagramType } from '../presets/index';
import type { TreeNodeSpec } from '../presets/trees';

export class GraphDslError extends Error {
  constructor(message: string) {
    super(`anytime-graph: ${message}`);
    this.name = 'GraphDslError';
  }
}

const TYPE_ALIASES: Record<string, ThinkingDiagramType> = {
  fishbone: 'fishbone',
  ishikawa: 'fishbone',
  'cause-effect': 'fishbone',
  'causal-loop': 'causal-loop',
  cld: 'causal-loop',
  loop: 'causal-loop',
  pyramid: 'pyramid',
  abstraction: 'pyramid',
  mindmap: 'mindmap',
  'mind-map': 'mindmap',
  'double-diamond': 'double-diamond',
  doublediamond: 'double-diamond',
  'logic-tree': 'logic-tree',
  'issue-tree': 'logic-tree',
  logictree: 'logic-tree',
  'why-chain': 'why-chain',
  why: 'why-chain',
  '5why': 'why-chain',
  whychain: 'why-chain',
  swot: 'swot',
  'morph-box': 'morph-box',
  morphbox: 'morph-box',
  morphology: 'morph-box',
  affinity: 'affinity',
  kj: 'affinity',
  'kj-method': 'affinity',
};

function splitItems(value: string): string[] {
  return value
    .split(/[,，、]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function firstColonIndex(s: string): number {
  const a = s.indexOf(':');
  const b = s.indexOf('：');
  if (a === -1) return b;
  if (b === -1) return a;
  return Math.min(a, b);
}

/** `key: value` のヘッダ行から値を取得（大文字小文字無視・先頭一致）。bullet 行は対象外。 */
function headerValue(lines: string[], key: string): string | undefined {
  const lower = key.toLowerCase();
  for (const raw of lines) {
    const t = raw.trim();
    if (t.startsWith('-')) continue;
    const ci = firstColonIndex(t);
    if (ci === -1) continue;
    if (t.slice(0, ci).trim().toLowerCase() === lower) {
      return t.slice(ci + 1).trim();
    }
  }
  return undefined;
}

interface LabeledBullet {
  label: string;
  items: string[];
}

/** トップレベルの `- label: a, b` 形式の bullet を抽出する。 */
function labeledBullets(lines: string[]): LabeledBullet[] {
  const out: LabeledBullet[] = [];
  for (const raw of lines) {
    const t = raw.trim();
    const m = /^-\s+(.*)$/.exec(t);
    if (!m) continue;
    const rest = m[1];
    const ci = firstColonIndex(rest);
    if (ci === -1) {
      out.push({ label: rest.trim(), items: [] });
    } else {
      out.push({ label: rest.slice(0, ci).trim(), items: splitItems(rest.slice(ci + 1)) });
    }
  }
  return out;
}

/** インデント（2スペース/レベル）から TreeNodeSpec ツリーを構築する。 */
function parseIndentTree(lines: string[]): TreeNodeSpec[] {
  const roots: TreeNodeSpec[] = [];
  const stack: Array<{ node: TreeNodeSpec; level: number }> = [];
  for (const raw of lines) {
    const m = /^(\s*)-\s+(.*)$/.exec(raw.replace(/\t/g, '  '));
    if (!m) continue;
    const level = Math.floor(m[1].length / 2);
    const label = m[2].trim();
    if (!label) continue;
    const node: TreeNodeSpec = { label };
    while (stack.length > 0 && stack[stack.length - 1].level >= level) stack.pop();
    if (stack.length === 0) {
      roots.push(node);
    } else {
      const parent = stack[stack.length - 1].node;
      (parent.children ??= []).push(node);
    }
    stack.push({ node, level });
  }
  return roots;
}

function normalizeType(rawType: string): ThinkingDiagramType {
  const key = rawType.toLowerCase().replace(/\s+/g, '');
  const direct = TYPE_ALIASES[rawType.toLowerCase()] ?? TYPE_ALIASES[key];
  if (!direct) {
    const known = Array.from(new Set(Object.values(TYPE_ALIASES))).join(', ');
    throw new GraphDslError(`未知の図種 "${rawType}" です。利用可能: ${known}`);
  }
  return direct;
}

function requireValue(value: string | undefined, field: string, type: string): string {
  if (value === undefined || value === '') {
    throw new GraphDslError(`${type} には "${field}:" が必要です`);
  }
  return value;
}

export function parseGraphDsl(text: string): ThinkingDiagramSpec {
  const allLines = text.split(/\r?\n/);
  const lines = allLines.filter((l) => l.trim() !== '');
  if (lines.length === 0) {
    throw new GraphDslError('内容が空です。先頭に "type: <図種>" を記述してください');
  }
  const typeLine = lines.find((l) => firstColonIndex(l) !== -1 && l.slice(0, firstColonIndex(l)).trim().toLowerCase() === 'type');
  if (!typeLine) {
    throw new GraphDslError('先頭に "type: <図種>" を記述してください');
  }
  const rawType = typeLine.slice(firstColonIndex(typeLine) + 1).trim();
  const type = normalizeType(rawType);

  switch (type) {
    case 'fishbone': {
      const problem = requireValue(headerValue(lines, 'problem'), 'problem', 'fishbone');
      const categories = labeledBullets(lines)
        .filter((b) => b.label.length > 0)
        .map((b) => ({ label: b.label, causes: b.items }));
      if (categories.length === 0) {
        throw new GraphDslError('fishbone には "- カテゴリ: 要因, 要因" を1つ以上記述してください');
      }
      return { type, problem, categories };
    }

    case 'causal-loop': {
      const title = headerValue(lines, 'title');
      const links = [];
      const polarityMap: Record<string, '+' | '-'> = { '+': '+', '＋': '+', '-': '-', '－': '-' };
      for (const raw of lines) {
        const t = raw.trim();
        if (!t.includes('->')) continue;
        const m = /^(.+?)->(.+?)(?::|：)?\s*([+\-＋－])\s*$/.exec(t);
        if (!m) {
          throw new GraphDslError(`リンク行を解釈できません: "${t}"（例: "在庫 -> 出荷: +"）`);
        }
        links.push({ from: m[1].trim(), to: m[2].trim(), polarity: polarityMap[m[3]] });
      }
      if (links.length === 0) {
        throw new GraphDslError('causal-loop には "A -> B: +" 形式のリンクを1つ以上記述してください');
      }
      return { type, title, links };
    }

    case 'pyramid': {
      const title = headerValue(lines, 'title');
      const tiers = labeledBullets(lines)
        .filter((b) => b.label.length > 0)
        .map((b) => ({ label: b.label, desc: b.items[0] }));
      if (tiers.length === 0) {
        throw new GraphDslError('pyramid には "- 段ラベル" を上から順に1つ以上記述してください');
      }
      return { type, title, tiers };
    }

    case 'mindmap': {
      const root = requireValue(headerValue(lines, 'root'), 'root', 'mindmap');
      const branches = parseIndentTree(lines);
      if (branches.length === 0) {
        throw new GraphDslError('mindmap には "- ブランチ" を1つ以上記述してください');
      }
      return { type, root, branches };
    }

    case 'logic-tree': {
      const root = requireValue(headerValue(lines, 'root'), 'root', 'logic-tree');
      const children = parseIndentTree(lines);
      if (children.length === 0) {
        throw new GraphDslError('logic-tree には "- 要素" を1つ以上記述してください');
      }
      return { type, root, children };
    }

    case 'why-chain': {
      const problem = requireValue(headerValue(lines, 'problem'), 'problem', 'why-chain');
      const steps = labeledBullets(lines)
        .map((b) => b.label)
        .filter((s) => s.length > 0);
      if (steps.length === 0) {
        throw new GraphDslError('why-chain には "- なぜ..." を1つ以上記述してください');
      }
      return { type, problem, steps };
    }

    case 'double-diamond': {
      return {
        type,
        discover: splitItems(headerValue(lines, 'discover') ?? ''),
        define: splitItems(headerValue(lines, 'define') ?? ''),
        develop: splitItems(headerValue(lines, 'develop') ?? ''),
        deliver: splitItems(headerValue(lines, 'deliver') ?? ''),
      };
    }

    case 'swot': {
      return {
        type,
        strengths: splitItems(headerValue(lines, 'strengths') ?? ''),
        weaknesses: splitItems(headerValue(lines, 'weaknesses') ?? ''),
        opportunities: splitItems(headerValue(lines, 'opportunities') ?? ''),
        threats: splitItems(headerValue(lines, 'threats') ?? ''),
      };
    }

    case 'morph-box': {
      const title = headerValue(lines, 'title');
      const parameters = labeledBullets(lines)
        .filter((b) => b.label.length > 0)
        .map((b) => ({ label: b.label, options: b.items }));
      if (parameters.length === 0) {
        throw new GraphDslError('morph-box には "- パラメータ: 選択肢, 選択肢" を1つ以上記述してください');
      }
      return { type, title, parameters };
    }

    case 'affinity': {
      const title = headerValue(lines, 'title');
      const groups = labeledBullets(lines)
        .filter((b) => b.label.length > 0)
        .map((b) => ({ label: b.label, notes: b.items }));
      if (groups.length === 0) {
        throw new GraphDslError('affinity には "- グループ: 付箋, 付箋" を1つ以上記述してください');
      }
      return { type, title, groups };
    }

    default: {
      const _exhaustive: never = type;
      throw new GraphDslError(`未対応の図種: ${String(_exhaustive)}`);
    }
  }
}

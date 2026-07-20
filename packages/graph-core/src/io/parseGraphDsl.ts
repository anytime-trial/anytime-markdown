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
  'structure-map': 'structure-map',
  structuremap: 'structure-map',
  structure: 'structure-map',
  'whole-part': 'structure-map',
  cooccurrence: 'cooccurrence',
  'co-occurrence': 'cooccurrence',
  共起: 'cooccurrence',
  共起ネットワーク: 'cooccurrence',
  kh: 'cooccurrence',
  'kh-coder': 'cooccurrence',
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

/** スペース・ハイフンを無視した正規化キーで図種エイリアスを引く。 */
const NORMALIZED_TYPE_ALIASES: Map<string, ThinkingDiagramType> = new Map(
  Object.entries(TYPE_ALIASES).map(([k, v]) => [k.replace(/[\s-]+/g, ''), v]),
);

function normalizeType(rawType: string): ThinkingDiagramType {
  const key = rawType.toLowerCase().replace(/[\s-]+/g, '');
  const direct = NORMALIZED_TYPE_ALIASES.get(key);
  if (!direct) {
    const known = Array.from(new Set(Object.values(TYPE_ALIASES))).join(', ');
    throw new GraphDslError(`未知の図種 "${rawType}" です。利用可能: ${known}`);
  }
  return direct;
}

const POLARITY_MAP: Record<string, '+' | '-'> = { '+': '+', '＋': '+', '-': '-', '－': '-' };

/**
 * causal-loop のリンク行 `<from> -> <to>[:] <極性>` を解析する。解釈できなければ undefined。
 *
 * 正規表現 1 本（`^(.+?)->(.+?)(?::|：)?\s*([+\-＋－])\s*$`）で書くと、`->` を多数含み極性を欠く行に
 * 対して遅延量指定子どうしが二重にバックトラックし O(n^2) になる（CodeQL js/polynomial-redos #941）。
 * 分割位置と極性は端から決まるため、文字列操作で線形に解く。
 */
export function parseCausalLink(line: string): { from: string; to: string; polarity: '+' | '-' } | undefined {
  const arrow = line.indexOf('->');
  if (arrow < 0) return undefined;

  const from = line.slice(0, arrow).trim();
  const tail = line.slice(arrow + 2).trimEnd();
  const polarity = POLARITY_MAP[tail.at(-1) ?? ''];
  if (!from || !polarity) return undefined;

  const to = tail.slice(0, -1).trimEnd().replace(/[:：]$/, '').trim();
  if (!to) return undefined;

  return { from, to, polarity };
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
      for (const raw of lines) {
        const t = raw.trim();
        if (!t.includes('->')) continue;
        const link = parseCausalLink(t);
        if (!link) {
          throw new GraphDslError(`リンク行を解釈できません: "${t}"（例: "在庫 -> 出荷: +"）`);
        }
        if (link.from === link.to) {
          throw new GraphDslError(`自己参照リンクは未対応です: "${t}"（異なる変数を指定してください）`);
        }
        links.push(link);
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

    case 'structure-map': {
      const whole = requireValue(headerValue(lines, 'whole'), 'whole', 'structure-map');
      // 部分（`- ラベル: 要素…`）。関係行（`->` を含む）は除外する。
      const parts = labeledBullets(lines)
        .filter((b) => b.label.length > 0 && !b.label.includes('->'))
        .map((b) => ({ label: b.label, items: b.items }));
      if (parts.length === 0) {
        throw new GraphDslError('structure-map には "- 部分: 要素, 要素" を1つ以上記述してください');
      }
      const partLabels = new Set(parts.map((p) => p.label));
      // 関係（`A -> B`）。先頭の `- ` は任意。端点は部分ラベルで実在検証する。
      const relations: Array<{ from: string; to: string }> = [];
      for (const raw of lines) {
        const t = raw.trim().replace(/^-\s+/, '');
        if (!t.includes('->')) continue;
        const m = /^(.+?)->(.+)$/.exec(t);
        if (!m) {
          throw new GraphDslError(`関係行を解釈できません: "${t}"（例: "入力 -> ランキング"）`);
        }
        const from = m[1].trim();
        const to = m[2].trim();
        if (!from || !to) {
          throw new GraphDslError(`関係行を解釈できません: "${t}"（例: "入力 -> ランキング"）`);
        }
        if (!partLabels.has(from) || !partLabels.has(to)) {
          const missing = partLabels.has(from) ? to : from;
          throw new GraphDslError(`関係の端点 "${missing}" が部分に存在しません（"- ${missing}: …" を定義してください）`);
        }
        relations.push({ from, to });
      }
      const domains = splitItems(headerValue(lines, 'domains') ?? '');
      return { type, whole, parts, relations, domains };
    }

    case 'cooccurrence': {
      // 語（`- ラベル: 頻度`）と共起（`- A -- B: 強度`）は同じ bullet 記法なので、
      // `--` の有無で振り分ける。数値が読めない場合は黙って 0 に落とさずエラーにする。
      const title = headerValue(lines, 'title');
      const nodes: Array<{ label: string; frequency: number }> = [];
      const links: Array<{ a: string; b: string; strength: number }> = [];
      for (const raw of lines) {
        const t = raw.trim();
        if (!t.startsWith('-')) continue;
        const rest = t.replace(/^-\s*/, '');
        const ci = firstColonIndex(rest);
        if (ci === -1) {
          throw new GraphDslError(
            `cooccurrence の行に値がありません: "${t}"（例: "- 納期遅延: 40" / "- A -- B: 0.8"）`,
          );
        }
        const head = rest.slice(0, ci).trim();
        const valueText = rest.slice(ci + 1).trim();
        const value = Number(valueText);
        if (!Number.isFinite(value)) {
          throw new GraphDslError(
            `数値として解釈できません: "${valueText}"（"${head}" の行。頻度・共起強度は数値で書いてください）`,
          );
        }
        const pair = /^(.+?)--(.+)$/.exec(head);
        if (pair) {
          const a = pair[1].trim();
          const b = pair[2].trim();
          if (!a || !b) {
            throw new GraphDslError(`共起行を解釈できません: "${t}"（例: "- 納期遅延 -- 仕様変更: 0.8"）`);
          }
          // 自己共起は長さ 0 の線になるうえ強度の正規化も歪めるため拒否する
          // （causal-loop の自己参照リンクと同方針）。
          if (a === b) {
            throw new GraphDslError(`自己共起 "${a} -- ${b}" は未対応です（異なる語どうしを書いてください）`);
          }
          if (value < 0) {
            throw new GraphDslError(`共起強度に負の値は指定できません: "${t}"`);
          }
          links.push({ a, b, strength: value });
        } else {
          if (!head) {
            throw new GraphDslError(`語のラベルが空です: "${t}"`);
          }
          if (value < 0) {
            throw new GraphDslError(`出現頻度に負の値は指定できません: "${t}"`);
          }
          if (nodes.some((n) => n.label === head)) {
            throw new GraphDslError(`語 "${head}" が複数回定義されています（"- ${head}: 頻度" は1回だけ書いてください）`);
          }
          nodes.push({ label: head, frequency: value });
        }
      }
      if (nodes.length === 0) {
        throw new GraphDslError('cooccurrence には "- 語: 頻度" を1つ以上記述してください');
      }
      const labels = new Set(nodes.map((n) => n.label));
      for (const link of links) {
        for (const endpoint of [link.a, link.b]) {
          if (!labels.has(endpoint)) {
            throw new GraphDslError(
              `共起の端点 "${endpoint}" が語に存在しません（"- ${endpoint}: 頻度" を定義してください）`,
            );
          }
        }
      }
      // クラスタは `cluster <名前>: 語, 語` 行。bullet ではないので別途拾う。
      const clusters: Array<{ label: string; members: string[] }> = [];
      for (const raw of lines) {
        const t = raw.trim();
        const m = /^cluster\s+(.+)$/i.exec(t);
        if (!m) continue;
        const body = m[1];
        const ci = firstColonIndex(body);
        if (ci === -1) {
          throw new GraphDslError(`cluster 行を解釈できません: "${t}"（例: "cluster 工程: 納期遅延, レビュー待ち"）`);
        }
        const label = body.slice(0, ci).trim();
        const members = splitItems(body.slice(ci + 1));
        for (const member of members) {
          if (!labels.has(member)) {
            throw new GraphDslError(
              `cluster "${label}" の "${member}" が語に存在しません（"- ${member}: 頻度" を定義してください）`,
            );
          }
        }
        clusters.push({ label, members });
      }
      const subject = headerValue(lines, 'subject');
      if (subject !== undefined && !labels.has(subject)) {
        throw new GraphDslError(`subject "${subject}" が語に存在しません（"- ${subject}: 頻度" を定義してください）`);
      }
      return {
        type,
        ...(title !== undefined ? { title } : {}),
        ...(subject !== undefined ? { subject } : {}),
        nodes,
        links,
        clusters,
      };
    }

    default: {
      const _exhaustive: never = type;
      throw new GraphDslError(`未対応の図種: ${String(_exhaustive)}`);
    }
  }
}

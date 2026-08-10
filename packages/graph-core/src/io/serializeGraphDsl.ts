/**
 * `ThinkingDiagramSpec` を anytime-thinking-model フェンスの DSL 文字列へ逆変換する。
 *
 * 設計方針:
 * - `parseGraphDsl` の各 case と対をなす行フォーマットを出力し、ラウンドトリップを保証する
 *   （任意の妥当な DSL `d` について `parseGraphDsl(serializeGraphDsl(parseGraphDsl(d)))` が
 *    元の spec と構造一致する）。
 * - コメント・空行・手書きの整形は保持せず、正規形へ整形する（プレビュー WYSIWYG 編集の前提）。
 * - 純粋関数（副作用なし）。プレビュー操作層が parse → mutate → serialize → 書き戻しに使う。
 */

import type {
  AffinitySpec,
  CausalLoopSpec,
  CooccurrenceSpec,
  FishboneSpec,
  MorphBoxSpec,
  PyramidSpec,
  StructureMapSpec,
  ThinkingDiagramSpec,
  WhyChainSpec,
} from '../presets/index';
import type { CooccurrenceLinkDirection } from '../presets/cooccurrence';

/** 共起の向きに対応する DSL の矢印。parseGraphDsl の解釈と対をなす（設計書 §2.5）。 */
const COOCCURRENCE_ARROW: Record<CooccurrenceLinkDirection | 'none', string> = {
  none: '--',
  forward: '-->',
  backward: '<--',
  both: '<-->',
};
import type { TreeNodeSpec } from '../presets/trees';

/** カンマ区切り項目（parser の splitItems と対）。 */
function joinItems(items: string[]): string {
  return items.join(', ');
}

/** `- label: a, b` 形式の bullet 行（items が空なら `- label`）。 */
function labeledBulletLine(label: string, items: string[]): string {
  return items.length > 0 ? `- ${label}: ${joinItems(items)}` : `- ${label}`;
}

/** インデントツリー（2 スペース/レベル）を行配列へ展開する（parseIndentTree と対）。 */
function serializeTree(nodes: TreeNodeSpec[], depth: number): string[] {
  const out: string[] = [];
  for (const node of nodes) {
    out.push(`${'  '.repeat(depth)}- ${node.label}`);
    if (node.children && node.children.length > 0) {
      out.push(...serializeTree(node.children, depth + 1));
    }
  }
  return out;
}

/** 任意のヘッダ行を、値が存在する場合のみ push する。 */
function pushHeader(lines: string[], key: string, value: string | undefined): void {
  if (value !== undefined && value !== '') {
    lines.push(`${key}: ${value}`);
  }
}

/** fishbone: 問題行と、カテゴリごとの bullet 行。 */
function fishboneLines(spec: FishboneSpec): string[] {
  const lines: string[] = [`problem: ${spec.problem}`];
  for (const cat of spec.categories) {
    lines.push(labeledBulletLine(cat.label, cat.causes));
  }
  return lines;
}

/** causal-loop: 任意の title と、`A -> B: 極性` 行。 */
function causalLoopLines(spec: CausalLoopSpec): string[] {
  const lines: string[] = [];
  pushHeader(lines, 'title', spec.title);
  for (const link of spec.links) {
    lines.push(`${link.from} -> ${link.to}: ${link.polarity}`);
  }
  return lines;
}

/** pyramid: 任意の title と、階層ごとの bullet 行（desc があれば `: ` で続ける）。 */
function pyramidLines(spec: PyramidSpec): string[] {
  const lines: string[] = [];
  pushHeader(lines, 'title', spec.title);
  for (const tier of spec.tiers) {
    lines.push(tier.desc ? `- ${tier.label}: ${tier.desc}` : `- ${tier.label}`);
  }
  return lines;
}

/** why-chain: 問題行と、なぜの段ごとの bullet 行。 */
function whyChainLines(spec: WhyChainSpec): string[] {
  const lines: string[] = [`problem: ${spec.problem}`];
  for (const step of spec.steps) {
    lines.push(`- ${step}`);
  }
  return lines;
}

/** morph-box: 任意の title と、パラメータごとの bullet 行。 */
function morphBoxLines(spec: MorphBoxSpec): string[] {
  const lines: string[] = [];
  pushHeader(lines, 'title', spec.title);
  for (const param of spec.parameters) {
    lines.push(labeledBulletLine(param.label, param.options));
  }
  return lines;
}

/** affinity: 任意の title と、グループごとの bullet 行。 */
function affinityLines(spec: AffinitySpec): string[] {
  const lines: string[] = [];
  pushHeader(lines, 'title', spec.title);
  for (const group of spec.groups) {
    lines.push(labeledBulletLine(group.label, group.notes));
  }
  return lines;
}

/** structure-map: 全体・部分の bullet 行と、関係行・domains ヘッダ。 */
function structureMapLines(spec: StructureMapSpec): string[] {
  const lines: string[] = [`whole: ${spec.whole}`];
  for (const part of spec.parts) {
    lines.push(labeledBulletLine(part.label, part.items));
  }
  // 関係は `relations:` 見出しに続けて `A -> B` 行で出力する（parser は `->` 行を関係として拾う）。
  if (spec.relations.length > 0) {
    lines.push('relations:');
    for (const rel of spec.relations) {
      lines.push(`- ${rel.from} -> ${rel.to}`);
    }
  }
  pushHeader(lines, 'domains', spec.domains.length > 0 ? joinItems(spec.domains) : undefined);
  return lines;
}

/** cooccurrence: 任意ヘッダ・語の bullet 行・共起行・クラスタ行。 */
function cooccurrenceLines(spec: CooccurrenceSpec): string[] {
  const lines: string[] = [];
  pushHeader(lines, 'title', spec.title);
  pushHeader(lines, 'subject', spec.subject);
  for (const node of spec.nodes) {
    lines.push(`- ${node.label}: ${node.frequency}`);
  }
  // 共起は `A -- B: 強度`（parser は bullet 行の `--` の有無で語と振り分ける）。
  // 向きは矢印で書く。書かないと、DSL へ書き出した時点で向きが黙って消える（設計書 §2.5）。
  for (const link of spec.links) {
    lines.push(`- ${link.a} ${COOCCURRENCE_ARROW[link.direction ?? 'none']} ${link.b}: ${link.strength}`);
  }
  for (const cluster of spec.clusters ?? []) {
    lines.push(`cluster ${cluster.label}: ${joinItems(cluster.members)}`);
  }
  return lines;
}

export function serializeGraphDsl(spec: ThinkingDiagramSpec): string {
  const lines: string[] = [`type: ${spec.type}`];

  switch (spec.type) {
    case 'fishbone': {
      lines.push(...fishboneLines(spec));
      break;
    }

    case 'causal-loop': {
      lines.push(...causalLoopLines(spec));
      break;
    }

    case 'pyramid': {
      lines.push(...pyramidLines(spec));
      break;
    }

    case 'mindmap': {
      lines.push(`root: ${spec.root}`);
      lines.push(...serializeTree(spec.branches, 0));
      break;
    }

    case 'logic-tree': {
      lines.push(`root: ${spec.root}`);
      lines.push(...serializeTree(spec.children, 0));
      break;
    }

    case 'why-chain': {
      lines.push(...whyChainLines(spec));
      break;
    }

    case 'double-diamond': {
      // 固定スキーマ。空フェーズもキーを保持し WYSIWYG で項目追加できるようにする。
      lines.push(`discover: ${joinItems(spec.discover)}`);
      lines.push(`define: ${joinItems(spec.define)}`);
      lines.push(`develop: ${joinItems(spec.develop)}`);
      lines.push(`deliver: ${joinItems(spec.deliver)}`);
      break;
    }

    case 'swot': {
      lines.push(`strengths: ${joinItems(spec.strengths)}`);
      lines.push(`weaknesses: ${joinItems(spec.weaknesses)}`);
      lines.push(`opportunities: ${joinItems(spec.opportunities)}`);
      lines.push(`threats: ${joinItems(spec.threats)}`);
      break;
    }

    case 'morph-box': {
      lines.push(...morphBoxLines(spec));
      break;
    }

    case 'affinity': {
      lines.push(...affinityLines(spec));
      break;
    }

    case 'structure-map': {
      lines.push(...structureMapLines(spec));
      break;
    }

    case 'cooccurrence': {
      lines.push(...cooccurrenceLines(spec));
      break;
    }

    default: {
      const _exhaustive: never = spec;
      throw new Error(`Unknown thinking diagram type: ${JSON.stringify(_exhaustive)}`);
    }
  }

  return lines.join('\n');
}

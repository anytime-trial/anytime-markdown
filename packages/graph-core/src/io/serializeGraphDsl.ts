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

import type { ThinkingDiagramSpec } from '../presets/index';
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

export function serializeGraphDsl(spec: ThinkingDiagramSpec): string {
  const lines: string[] = [`type: ${spec.type}`];

  switch (spec.type) {
    case 'fishbone': {
      lines.push(`problem: ${spec.problem}`);
      for (const cat of spec.categories) {
        lines.push(labeledBulletLine(cat.label, cat.causes));
      }
      break;
    }

    case 'causal-loop': {
      pushHeader(lines, 'title', spec.title);
      for (const link of spec.links) {
        lines.push(`${link.from} -> ${link.to}: ${link.polarity}`);
      }
      break;
    }

    case 'pyramid': {
      pushHeader(lines, 'title', spec.title);
      for (const tier of spec.tiers) {
        lines.push(tier.desc ? `- ${tier.label}: ${tier.desc}` : `- ${tier.label}`);
      }
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
      lines.push(`problem: ${spec.problem}`);
      for (const step of spec.steps) {
        lines.push(`- ${step}`);
      }
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
      pushHeader(lines, 'title', spec.title);
      for (const param of spec.parameters) {
        lines.push(labeledBulletLine(param.label, param.options));
      }
      break;
    }

    case 'affinity': {
      pushHeader(lines, 'title', spec.title);
      for (const group of spec.groups) {
        lines.push(labeledBulletLine(group.label, group.notes));
      }
      break;
    }

    default: {
      const _exhaustive: never = spec;
      throw new Error(`Unknown thinking diagram type: ${JSON.stringify(_exhaustive)}`);
    }
  }

  return lines.join('\n');
}

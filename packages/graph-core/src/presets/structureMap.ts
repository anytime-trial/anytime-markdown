/**
 * 構造マップ（structure-map）プリセット。
 * 「全体↔部分↔他領域の関係を一枚で見る」構造化思考向け。
 *
 * - 全体（whole）を上部中央に置く。
 * - 部分（parts）を下段に横並びのグループ（見出し＋構成要素）で配置し、全体から接続する。
 * - 部分間の関係（relations）を破線矢印で描く。
 * - 隣接領域（domains）を右側に淡色ノードで置き、全体から点線で接続する。
 *
 * 既存 10 図種（tree 系＝分解、causal-loop＝関係、affinity＝クラスタ）が
 * 個別に表す操作を、構造化の文脈で 1 枚に束ねる図種。
 */

import type { GraphDocument, GraphNode, GraphEdge } from '../types';
import { thinkingPalette, categoryColor, withAlpha } from './palette';
import { mkNode, connectorEdge, mkDoc, type NodeOpts } from './build';

export interface StructureMapPart {
  label: string;
  items: string[];
}

export interface StructureMapRelation {
  from: string;
  to: string;
}

export interface StructureMapSpec {
  type: 'structure-map';
  whole: string;
  parts: StructureMapPart[];
  relations: StructureMapRelation[];
  domains: string[];
}

const WHOLE_W = 220;
const WHOLE_H = 80;
const PART_W = 190;
const PART_GAP = 36;
const HEADER_H = 48;
const ITEM_H = 42;
const ITEM_GAP = 8;
const PARTS_Y = 170;
const DOMAIN_W = 150;
const DOMAIN_H = 44;
const DOMAIN_GAP = 18;

export function buildStructureMap(spec: StructureMapSpec, isDark: boolean): GraphDocument {
  const pal = thinkingPalette(isDark);
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  // 部分グループの横並び配置。行全体を x=0 中心に揃える。
  const count = spec.parts.length;
  const rowWidth = count > 0 ? count * PART_W + (count - 1) * PART_GAP : 0;
  const rowStartX = -rowWidth / 2;

  // 全体（whole）— 上部中央の楕円
  nodes.push(
    mkNode('whole', 'ellipse', { x: -WHOLE_W / 2, y: 0, width: WHOLE_W, height: WHOLE_H }, spec.whole, {
      fill: withAlpha(pal.accent, isDark ? 0.24 : 0.18),
      stroke: pal.accent,
      strokeWidth: 2.5,
      fontColor: pal.text,
      fontSize: 16,
      fontStyle: 1,
      metadata: { path: 'whole' },
    } satisfies NodeOpts),
  );

  // 部分（parts）— 見出し＋構成要素。ラベル→見出しノード id を関係解決用に保持する。
  const partIdByLabel = new Map<string, string>();
  spec.parts.forEach((part, i) => {
    const color = categoryColor(i, isDark);
    const x = rowStartX + i * (PART_W + PART_GAP);
    const headerId = `part-${i}`;
    partIdByLabel.set(part.label, headerId);

    nodes.push(
      mkNode(headerId, 'rect', { x, y: PARTS_Y, width: PART_W, height: HEADER_H }, part.label, {
        fill: withAlpha(color, isDark ? 0.2 : 0.14),
        stroke: color,
        strokeWidth: 2,
        fontColor: pal.text,
        fontSize: 14,
        fontStyle: 1,
        borderRadius: 8,
        metadata: { path: `parts.${i}` },
      } satisfies NodeOpts),
    );
    edges.push(connectorEdge(`whole->${headerId}`, 'whole', headerId, { stroke: color, strokeWidth: 2 }));

    let itemY = PARTS_Y + HEADER_H + 12;
    part.items.forEach((item, j) => {
      nodes.push(
        mkNode(`item-${i}-${j}`, 'rect', { x: x + 12, y: itemY, width: PART_W - 24, height: ITEM_H }, item, {
          fill: pal.surface,
          stroke: pal.stroke,
          strokeWidth: 1.5,
          fontColor: pal.text,
          fontSize: 13,
          borderRadius: 6,
          metadata: { path: `parts.${i}.items.${j}` },
        } satisfies NodeOpts),
      );
      itemY += ITEM_H + ITEM_GAP;
    });
  });

  // 部分間の関係（relations）— 破線矢印。端点はラベルで解決する。
  // パーサが端点の実在を検証済みのため、未知ラベルは防御的にスキップする。
  spec.relations.forEach((rel, idx) => {
    const fromId = partIdByLabel.get(rel.from);
    const toId = partIdByLabel.get(rel.to);
    if (!fromId || !toId) return;
    edges.push(
      connectorEdge(`rel-${idx}`, fromId, toId, {
        stroke: pal.textMuted,
        strokeWidth: 1.5,
        dashed: true,
      }),
    );
  });

  // 隣接領域（domains）— 右側に淡色ノードを縦に並べ、全体から点線で接続する。
  const domainX = rowStartX + rowWidth + 60;
  spec.domains.forEach((domain, k) => {
    const domainId = `domain-${k}`;
    const y = k * (DOMAIN_H + DOMAIN_GAP);
    nodes.push(
      mkNode(domainId, 'rect', { x: domainX, y, width: DOMAIN_W, height: DOMAIN_H }, domain, {
        fill: withAlpha(pal.textMuted, isDark ? 0.1 : 0.08),
        stroke: pal.textMuted,
        strokeWidth: 1.5,
        dashed: true,
        fontColor: pal.textMuted,
        fontSize: 12,
        borderRadius: 6,
        metadata: { path: `domains.${k}` },
      } satisfies NodeOpts),
    );
    edges.push(
      connectorEdge(`whole->${domainId}`, 'whole', domainId, {
        stroke: pal.textMuted,
        strokeWidth: 1.5,
        dashed: true,
      }),
    );
  });

  return mkDoc(spec.whole || 'structure-map', nodes, edges);
}

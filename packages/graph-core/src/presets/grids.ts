/**
 * グリッド系プリセット。
 * - swot: SWOT 分析（2×2 グリッド）
 * - morph-box: モルフォロジカルボックス（パラメータ × 選択肢の行列）
 * - affinity: KJ法 / 親和図（グループ見出し＋付箋）
 */

import type { GraphDocument, GraphNode } from '../types';
import { gridCells } from './layout';
import { thinkingPalette, categoryColor, withAlpha } from './palette';
import { mkNode, mkDoc, type NodeOpts } from './build';

// ── SWOT ──────────────────────────────────────────────

export interface SwotSpec {
  type: 'swot';
  strengths: string[];
  weaknesses: string[];
  opportunities: string[];
  threats: string[];
}

const SWOT_QUADRANTS: Array<{ key: keyof Omit<SwotSpec, 'type'>; label: string }> = [
  { key: 'strengths', label: 'Strengths（強み）' },
  { key: 'weaknesses', label: 'Weaknesses（弱み）' },
  { key: 'opportunities', label: 'Opportunities（機会）' },
  { key: 'threats', label: 'Threats（脅威）' },
];

export function buildSwot(spec: SwotSpec, isDark: boolean): GraphDocument {
  const pal = thinkingPalette(isDark);
  const cells = gridCells(2, 2, { cellWidth: 280, cellHeight: 200, gap: 18 });
  const nodes: GraphNode[] = SWOT_QUADRANTS.map((q, i) => {
    const color = categoryColor(i, isDark);
    const items = spec[q.key];
    const body = items.length ? items.map((s) => `・${s}`).join('\n') : '—';
    return mkNode(`swot-${i}`, 'rect', cells[i], `${q.label}\n${body}`, {
      fill: withAlpha(color, isDark ? 0.16 : 0.1),
      stroke: color,
      strokeWidth: 2,
      fontColor: pal.text,
      fontSize: 13,
      borderRadius: 8,
    } satisfies NodeOpts);
  });
  return mkDoc('swot', nodes, []);
}

// ── Morphological Box ─────────────────────────────────

export interface MorphParameter {
  label: string;
  options: string[];
}

export interface MorphBoxSpec {
  type: 'morph-box';
  title?: string;
  parameters: MorphParameter[];
}

export function buildMorphBox(spec: MorphBoxSpec, isDark: boolean): GraphDocument {
  const pal = thinkingPalette(isDark);
  const labelW = 180;
  const optW = 150;
  const cellH = 60;
  const labelGap = 14; // 見出し列と選択肢列の間隔(px)
  const optGap = 8; // 選択肢セル間の間隔(px)
  const nodes: GraphNode[] = [];

  spec.parameters.forEach((param, r) => {
    const y = r * (cellH + 10);
    const color = categoryColor(r, isDark);
    // パラメータ見出し（左列）
    nodes.push(
      mkNode(`param-${r}`, 'rect', { x: 0, y, width: labelW, height: cellH }, param.label, {
        fill: withAlpha(color, isDark ? 0.2 : 0.14),
        stroke: color,
        strokeWidth: 2,
        fontColor: pal.text,
        fontSize: 14,
        fontStyle: 1,
        borderRadius: 4,
      } satisfies NodeOpts),
    );
    // 選択肢セル（右側に並ぶ）
    param.options.forEach((opt, c) => {
      const x = labelW + labelGap + c * (optW + optGap);
      nodes.push(
        mkNode(`opt-${r}-${c}`, 'rect', { x, y, width: optW, height: cellH }, opt, {
          fill: pal.surface,
          stroke: pal.stroke,
          strokeWidth: 1.5,
          fontColor: pal.text,
          fontSize: 13,
          borderRadius: 4,
        } satisfies NodeOpts),
      );
    });
  });

  return mkDoc(spec.title ?? 'morph-box', nodes, []);
}

// ── Affinity (KJ法) ───────────────────────────────────

export interface AffinityGroup {
  label: string;
  notes: string[];
}

export interface AffinitySpec {
  type: 'affinity';
  title?: string;
  groups: AffinityGroup[];
}

const AFFINITY_COLS = 3;
const GROUP_W = 220;
const NOTE_H = 48;
const HEADER_H = 48;

export function buildAffinity(spec: AffinitySpec, isDark: boolean): GraphDocument {
  const pal = thinkingPalette(isDark);
  const nodes: GraphNode[] = [];
  const colGap = 28;
  const rowGap = 36;

  // 各グループの高さは付箋数で変わるため、列ごとに y カーソルを進める
  const colBottom = new Array<number>(AFFINITY_COLS).fill(0);

  spec.groups.forEach((group, i) => {
    const col = i % AFFINITY_COLS;
    const x = col * (GROUP_W + colGap);
    let y = colBottom[col];
    const color = categoryColor(i, isDark);

    // グループ見出し
    nodes.push(
      mkNode(`group-${i}`, 'rect', { x, y, width: GROUP_W, height: HEADER_H }, group.label, {
        fill: withAlpha(color, isDark ? 0.22 : 0.16),
        stroke: color,
        strokeWidth: 2,
        fontColor: pal.text,
        fontSize: 14,
        fontStyle: 1,
        borderRadius: 6,
      } satisfies NodeOpts),
    );
    y += HEADER_H + 10;

    // 付箋（sticky）
    group.notes.forEach((note, n) => {
      nodes.push(
        mkNode(`note-${i}-${n}`, 'sticky', { x: x + 12, y, width: GROUP_W - 24, height: NOTE_H }, note, {
          fill: withAlpha(color, isDark ? 0.3 : 0.2),
          stroke: color,
          strokeWidth: 1,
          fontColor: pal.text,
          fontSize: 12,
        } satisfies NodeOpts),
      );
      y += NOTE_H + 8;
    });

    colBottom[col] = y + rowGap;
  });

  return mkDoc(spec.title ?? 'affinity', nodes, []);
}

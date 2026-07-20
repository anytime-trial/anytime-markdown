/**
 * 共起ネットワーク（テキストマイニング / 共起分析）プリセット。
 *
 * 「ある事象に対して、どの要因事象が一緒に語られるか」を一枚で見るための図種。
 * 視覚エンコーディングは KH Coder 等の共起ネットワークに合わせる。
 *   - 円の大きさ = 出現頻度（面積が頻度に比例するよう半径は sqrt スケール）
 *   - 線の太さ   = 共起強度（無向のため矢印は付けない）
 *   - 色         = クラスタ
 * 配置は乱数を使わない力学レイアウトで解き、同一入力→同一出力を保つ。
 */

import type { GraphDocument } from '../types';
import { forceDirectedLayout, type ForceLink, type Point } from './layout';
import { thinkingPalette, categoryColor, withAlpha } from './palette';
import { mkNode, lineEdge, mkDoc, type NodeOpts } from './build';

export interface CooccurrenceNode {
  label: string;
  /** 出現頻度。円の面積に比例させる。 */
  frequency: number;
}

export interface CooccurrenceLink {
  a: string;
  b: string;
  /** 共起の強さ。線の太さと引力に比例させる。 */
  strength: number;
}

export interface CooccurrenceCluster {
  label: string;
  members: string[];
}

export interface CooccurrenceSpec {
  type: 'cooccurrence';
  title?: string;
  /** 中心となる事象。指定した語だけ差し色の太枠で強調する。 */
  subject?: string;
  nodes: CooccurrenceNode[];
  links: CooccurrenceLink[];
  clusters?: CooccurrenceCluster[];
}

/** 円半径の下限・上限。頻度差がこの範囲へ写像される。 */
const RADIUS_MIN = 28;
const RADIUS_MAX = 64;
/** 線の太さの下限・上限。 */
const STROKE_MIN = 1;
const STROKE_MAX = 6;
/** ラベルのフォントサイズ。円が小さいときは縮めるが下限を割らない。 */
const FONT_MAX = 14;
const FONT_MIN = 10;
/** 強調（subject）の枠線幅と通常の枠線幅。 */
const STROKE_NORMAL = 2;
const STROKE_SUBJECT = 4;

/**
 * 値を 0〜1 へ正規化する。全要素が同値（レンジ 0）の場合は 1 に倒し、
 * 「全部最小サイズ」ではなく「全部同じ大きさ」に見えるようにする。
 */
function normalize(value: number, min: number, max: number): number {
  if (max <= min) return 1;
  return (value - min) / (max - min);
}

/** ラベル → クラスタ添字。未指定の語は undefined。 */
function buildClusterIndex(clusters: CooccurrenceCluster[] | undefined): Map<string, number> {
  const index = new Map<string, number>();
  clusters?.forEach((cluster, i) => {
    for (const member of cluster.members) {
      if (!index.has(member)) index.set(member, i);
    }
  });
  return index;
}

export function buildCooccurrence(spec: CooccurrenceSpec, isDark: boolean): GraphDocument {
  const pal = thinkingPalette(isDark);
  const specNodes = spec.nodes;

  const indexOf = new Map<string, number>();
  specNodes.forEach((node, i) => {
    if (!indexOf.has(node.label)) indexOf.set(node.label, i);
  });

  // ── 円の大きさ: 面積を頻度に比例させるため半径は sqrt スケール ──
  const freqs = specNodes.map((n) => n.frequency);
  const freqMin = Math.min(...freqs);
  const freqMax = Math.max(...freqs);
  const radii = specNodes.map((n) => {
    const t = Math.sqrt(normalize(n.frequency, freqMin, freqMax));
    return RADIUS_MIN + (RADIUS_MAX - RADIUS_MIN) * t;
  });

  // ── 配置: クラスタを初期区画に反映した決定論的フォースレイアウト ──
  const clusterIndex = buildClusterIndex(spec.clusters);
  const groups = specNodes.map((n) => clusterIndex.get(n.label) ?? -1);
  const strengths = spec.links.map((l) => l.strength);
  const strengthMin = strengths.length > 0 ? Math.min(...strengths) : 0;
  const strengthMax = strengths.length > 0 ? Math.max(...strengths) : 0;

  const forceLinks: ForceLink[] = [];
  for (const link of spec.links) {
    const source = indexOf.get(link.a);
    const target = indexOf.get(link.b);
    if (source === undefined || target === undefined) continue;
    // 引力には正規化した強度を渡す。強度を生値のまま使うと、頻度を実数(0〜1)で書くか
    // 共起回数(数十)で書くかによって図全体のスケールが変わってしまう。
    forceLinks.push({
      source,
      target,
      weight: 0.3 + 0.7 * normalize(link.strength, strengthMin, strengthMax),
    });
  }
  const centers = forceDirectedLayout(specNodes.length, forceLinks, { groups, radii });

  // ── ノード ──
  const nodes = specNodes.map((node, i) => {
    const r = radii[i];
    const center = centers[i] ?? { x: 0, y: 0 };
    const cluster = clusterIndex.get(node.label);
    const accent = cluster === undefined ? pal.stroke : categoryColor(cluster, isDark);
    const fill = cluster === undefined ? pal.surface : withAlpha(accent, isDark ? 0.28 : 0.18);
    const isSubject = spec.subject !== undefined && spec.subject === node.label;
    // 円が小さいほどラベルを縮める（下限を割らない範囲で）
    const fontSize = Math.max(FONT_MIN, Math.min(FONT_MAX, Math.round((r / RADIUS_MAX) * FONT_MAX)));
    return mkNode(
      `word-${i}`,
      'ellipse',
      { x: center.x - r, y: center.y - r, width: r * 2, height: r * 2 },
      node.label,
      {
        fill,
        // 色は「クラスタ」を表す符号なので subject でも変えない。強調は枠線の太さだけで行う。
        stroke: accent,
        strokeWidth: isSubject ? STROKE_SUBJECT : STROKE_NORMAL,
        fontColor: pal.text,
        fontSize,
        metadata: { path: `nodes.${i}.label` },
      } satisfies NodeOpts,
    );
  });

  // ── 共起（無向。矢印は付けない） ──
  const centerOf = (label: string): Point | undefined => {
    const i = indexOf.get(label);
    return i === undefined ? undefined : centers[i];
  };
  const edgeColor = withAlpha(isDark ? '#FFFFFF' : '#1F1E1C', isDark ? 0.34 : 0.32);
  const edges = spec.links.flatMap((link, i) => {
    const from = centerOf(link.a);
    const to = centerOf(link.b);
    if (!from || !to) return [];
    const t = normalize(link.strength, strengthMin, strengthMax);
    return [
      lineEdge(`co-${i}`, from, to, {
        stroke: edgeColor,
        strokeWidth: STROKE_MIN + (STROKE_MAX - STROKE_MIN) * t,
        metadata: { path: `links.${i}.strength` },
      }),
    ];
  });

  // 線を円の下に敷くため、エッジを先に描く（GraphDocument はノード→エッジ順で重なる）
  return mkDoc(spec.title ?? 'cooccurrence', nodes, edges);
}

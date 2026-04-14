import { detectCycles } from '../dsm/detectCycles';
import type { DsmMatrix } from '../dsm/types';
import type { CoverageMatrix, ComplexityMatrix, MetricOverlay, ComplexityClass } from '../types';

// ─── Color constants ──────────────────────────────────────────────────────────

const COLOR_HIGH_PCT = '#2e7d32';   // >=80%
const COLOR_MID_PCT  = '#f9a825';   // 50-79%
const COLOR_LOW_PCT  = '#c62828';   // <50%
const COLOR_NO_DATA  = '#616161';   // データなし

const COLOR_CYCLIC    = '#c62828';
const COLOR_NO_CYCLIC = '#2e7d32';

const COMPLEXITY_COLORS: Record<ComplexityClass, string> = {
  'low-complexity':  '#2e7d32',
  'search-only':     '#1565c0',
  'multi-file-edit': '#f9a825',
  'high-complexity': '#c62828',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function coverageHeatColor(pct: number): string {
  if (pct >= 80) return COLOR_HIGH_PCT;
  if (pct >= 50) return COLOR_MID_PCT;
  return COLOR_LOW_PCT;
}

/** 0〜100 のスコアで 緑(low)→黄(mid)→赤(high) を返す */
function importanceHeatColor(score: number): string {
  if (score >= 70) return COLOR_LOW_PCT;   // 赤
  if (score >= 40) return COLOR_MID_PCT;   // 黄
  return COLOR_HIGH_PCT;                   // 緑
}

/** 0〜1 の t で青(min)→赤(max) を線形補間する */
function interpolateDsmColor(t: number): string {
  // blue #1565c0 → red #c62828
  const r = Math.round(0x15 + (0xc6 - 0x15) * t);
  const g = Math.round(0x65 + (0x28 - 0x65) * t);
  const b = Math.round(0xc0 + (0x28 - 0xc0) * t);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function computeColorMap(
  overlay: MetricOverlay,
  coverageMatrix: CoverageMatrix | null,
  dsmMatrix: DsmMatrix | null,
  complexityMatrix: ComplexityMatrix | null,
  importanceMatrix: Record<string, number> | null = null,
): Map<string, string> {
  if (overlay === 'none') return new Map();

  // ── Coverage ──
  if (overlay === 'coverage-lines' || overlay === 'coverage-branches' || overlay === 'coverage-functions') {
    if (!coverageMatrix) return new Map();
    const map = new Map<string, string>();
    const field = overlay === 'coverage-lines' ? 'lines'
      : overlay === 'coverage-branches' ? 'branches'
      : 'functions';
    for (const entry of coverageMatrix.entries) {
      const metric = entry[field];
      map.set(entry.elementId, metric.total > 0 ? coverageHeatColor(metric.pct) : COLOR_NO_DATA);
    }
    return map;
  }

  // ── DSM out/in ──
  if (overlay === 'dsm-out' || overlay === 'dsm-in') {
    if (!dsmMatrix) return new Map();
    const map = new Map<string, string>();
    const counts = dsmMatrix.nodes.map((_node, i) => {
      if (overlay === 'dsm-out') {
        return dsmMatrix.adjacency[i].reduce((s: number, v: number) => s + (v > 0 ? 1 : 0), 0);
      } else {
        return dsmMatrix.adjacency.reduce((s: number, row: readonly number[]) => s + (row[i] > 0 ? 1 : 0), 0);
      }
    });
    const maxCount = Math.max(...counts, 1);
    for (let i = 0; i < dsmMatrix.nodes.length; i++) {
      const t = counts[i] / maxCount;
      map.set(dsmMatrix.nodes[i].id, interpolateDsmColor(t));
    }
    return map;
  }

  // ── DSM cyclic ──
  if (overlay === 'dsm-cyclic') {
    if (!dsmMatrix) return new Map();
    const nodeIds = dsmMatrix.nodes.map((n) => n.id);
    const sccs = detectCycles(dsmMatrix.adjacency, nodeIds);
    const cyclic = new Set<string>();
    for (const scc of sccs) {
      for (const id of scc) {
        cyclic.add(id);
      }
    }
    const map = new Map<string, string>();
    for (const node of dsmMatrix.nodes) {
      map.set(node.id, cyclic.has(node.id) ? COLOR_CYCLIC : COLOR_NO_CYCLIC);
    }
    return map;
  }

  // ── Complexity ──
  if (overlay === 'complexity-most' || overlay === 'complexity-highest') {
    if (!complexityMatrix) return new Map();
    const map = new Map<string, string>();
    const field = overlay === 'complexity-most' ? 'mostFrequent' : 'highest';
    for (const entry of complexityMatrix.entries) {
      map.set(entry.elementId, COMPLEXITY_COLORS[entry[field]]);
    }
    return map;
  }

  // ── Importance ──
  if (overlay === 'importance') {
    if (!importanceMatrix) return new Map();
    const map = new Map<string, string>();
    for (const [elementId, score] of Object.entries(importanceMatrix)) {
      map.set(elementId, importanceHeatColor(score));
    }
    return map;
  }

  return new Map();
}

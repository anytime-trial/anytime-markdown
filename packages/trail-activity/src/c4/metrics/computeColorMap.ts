import { detectCycles } from '../dsm/detectCycles';
import type { DsmMatrix } from '../dsm/types';
import type { CoverageMatrix, ComplexityMatrix, MetricOverlay, ComplexityClass } from '../types';
import type { ImportanceMatrix } from '../../importance/types';
import type { CentralityMatrix, RoleMatrix, FunctionRole } from '../../centrality/types';
import type { HotspotMap } from '../../hotspot/types';
import type { SizeMatrix } from './buildSizeMatrix';
import type { ArchitectureMatrix } from './buildArchitectureMatrix';
import type { LayerMatrix } from './buildLayerMatrix';
import type { ArchitectureLayer } from '../../codeGraph';

// ─── Color constants ──────────────────────────────────────────────────────────

const COLOR_HIGH_PCT = '#2e7d32';   // >=80%
const COLOR_MID_PCT  = '#f9a825';   // 50-79%
const COLOR_LOW_PCT  = '#c62828';   // <50%
const COLOR_NO_DATA  = '#616161';   // データなし

const COLOR_CYCLIC    = '#c62828';
const COLOR_NO_CYCLIC = '#2e7d32';

// 重要度ヒートマップ用（高スコア=重要=赤、低スコア=問題なし=緑）
const COLOR_IMPORTANCE_HIGH = '#c62828';
const COLOR_IMPORTANCE_MID  = '#f9a825';
const COLOR_IMPORTANCE_LOW  = '#2e7d32';

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
  if (score >= 70) return COLOR_IMPORTANCE_HIGH;   // 赤
  if (score >= 40) return COLOR_IMPORTANCE_MID;    // 黄
  return COLOR_IMPORTANCE_LOW;                     // 緑
}

/** 0〜1 の t で青(min)→赤(max) を線形補間する */
export function interpolateDsmColor(t: number): string {
  // blue #1565c0 → red #c62828
  const r = Math.round(0x15 + (0xc6 - 0x15) * t);
  const g = Math.round(0x65 + (0x28 - 0x65) * t);
  const b = Math.round(0xc0 + (0x28 - 0xc0) * t);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function defectRiskHeatColor(score: number): string {
  if (score >= 0.7) return '#c62828';
  if (score >= 0.35) return '#f9a825';
  return '#2e7d32';
}

/**
 * 属人度（0-1）で 緑(分散)→黄→赤(属人化) を返す。
 * 閾値は defect risk と揃えず、0.8 以上（主著者が 8 割）を危険域とする。
 */
function busFactorHeatColor(score: number): string {
  if (score >= 0.8) return '#c62828';
  if (score >= 0.6) return '#f9a825';
  return '#2e7d32';
}

/** 0〜100 のデッドコードスコアで 緑(low)→黄(mid)→赤(high) を返す */
function deadCodeColor(score: number): string {
  if (score >= 70) return '#f44336';   // 赤
  if (score >= 40) return '#ffc107';   // 黄
  return '#4caf50';                    // 緑
}

// ─── Size metric color helpers (緑=小、黄=中、赤=大) ───
// 閾値はファイル単位 p90 ≈ 100 LOC、関数 19 を踏まえつつ集約レベルでも視認可能な値に固定。
function sizeLocColor(value: number): string {
  if (value >= 1000) return '#c62828';   // 赤
  if (value >= 500)  return '#f9a825';   // 黄
  return '#2e7d32';                      // 緑
}

function sizeFilesColor(value: number): string {
  if (value >= 50) return '#c62828';
  if (value >= 20) return '#f9a825';
  return '#2e7d32';
}

function sizeFunctionsColor(value: number): string {
  if (value >= 50) return '#c62828';
  if (value >= 10) return '#f9a825';
  return '#2e7d32';
}

// ─── Architecture (UI / Logic) ratio color ───
// 0% (全 logic) = グレー / 100% (全 UI) = アクセントブルー の線形補間。
// 実際の色トークンはビューワ側 (theme) から渡してもよいが、ここでは
// design.md と整合するデフォルト色 (logic=#757575 / ui=#1976d2) を使う。
const ARCHITECTURE_LOGIC_RGB = { r: 0x75, g: 0x75, b: 0x75 } as const;
const ARCHITECTURE_UI_RGB = { r: 0x19, g: 0x76, b: 0xd2 } as const;

function architectureUiColor(ratio: number): string {
  const t = Math.max(0, Math.min(1, ratio));
  const r = Math.round(ARCHITECTURE_LOGIC_RGB.r + (ARCHITECTURE_UI_RGB.r - ARCHITECTURE_LOGIC_RGB.r) * t);
  const g = Math.round(ARCHITECTURE_LOGIC_RGB.g + (ARCHITECTURE_UI_RGB.g - ARCHITECTURE_LOGIC_RGB.g) * t);
  const b = Math.round(ARCHITECTURE_LOGIC_RGB.b + (ARCHITECTURE_UI_RGB.b - ARCHITECTURE_LOGIC_RGB.b) * t);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

// ─── Function-roles categorical colors ───
const COLOR_ROLE_HUB        = '#c62828';
const COLOR_ROLE_LEAF       = '#2e7d32';
const COLOR_ROLE_ORCH       = '#f9a825';
const COLOR_ROLE_PERIPHERAL = '#9e9e9e';

// FunctionRole → 色の網羅 lookup (nested ternary を避ける / S3358)。
const ROLE_COLORS: Record<FunctionRole, string> = {
  hub: COLOR_ROLE_HUB,
  leaf: COLOR_ROLE_LEAF,
  orchestrator: COLOR_ROLE_ORCH,
  peripheral: COLOR_ROLE_PERIPHERAL,
};

const HOTSPOT_FREQ_BASE = { r: 232, g: 160, b: 18 } as const; // amber #E8A012
const HOTSPOT_RISK_BASE = { r: 232, g: 80, b: 28 } as const;  // red-orange #E8501C

function hotspotColor(t: number, base: { r: number; g: number; b: number }): string {
  const clamped = Math.max(0, Math.min(1, t));
  // alpha ≈ 0.10 (cold) → 1.0 (hot)
  const alpha = 0.1 + clamped * 0.9;
  return `rgba(${base.r}, ${base.g}, ${base.b}, ${alpha.toFixed(3)})`;
}

function computeHotspotColorMap(
  overlay: 'hotspot-frequency' | 'hotspot-risk',
  hotspotMap: HotspotMap,
): Map<string, string> {
  const map = new Map<string, string>();
  const base = overlay === 'hotspot-risk' ? HOTSPOT_RISK_BASE : HOTSPOT_FREQ_BASE;
  for (const [elementId, entry] of hotspotMap) {
    const value = overlay === 'hotspot-risk' ? entry.risk : entry.churnNorm;
    map.set(elementId, hotspotColor(value, base));
  }
  return map;
}

function computeCoverageColorMap(
  overlay: 'coverage-lines' | 'coverage-branches' | 'coverage-functions',
  coverageMatrix: CoverageMatrix,
): Map<string, string> {
  const field: 'lines' | 'branches' | 'functions' =
    overlay === 'coverage-lines' ? 'lines' : overlay === 'coverage-branches' ? 'branches' : 'functions';
  const map = new Map<string, string>();
  for (const entry of coverageMatrix.entries) {
    const metric = entry[field];
    map.set(entry.elementId, metric.total > 0 ? coverageHeatColor(metric.pct) : COLOR_NO_DATA);
  }
  return map;
}

function computeDsmOutInColorMap(overlay: 'dsm-out' | 'dsm-in', dsmMatrix: DsmMatrix): Map<string, string> {
  const counts = dsmMatrix.nodes.map((_node, i) => {
    if (overlay === 'dsm-out') {
      return dsmMatrix.adjacency[i].reduce((s: number, v: number) => s + (v > 0 ? 1 : 0), 0);
    }
    return dsmMatrix.adjacency.reduce((s: number, row: readonly number[]) => s + (row[i] > 0 ? 1 : 0), 0);
  });
  const maxCount = Math.max(...counts, 1);
  const map = new Map<string, string>();
  for (let i = 0; i < dsmMatrix.nodes.length; i++) {
    map.set(dsmMatrix.nodes[i].id, interpolateDsmColor(counts[i] / maxCount));
  }
  return map;
}

function computeDsmCyclicColorMap(dsmMatrix: DsmMatrix): Map<string, string> {
  const nodeIds = dsmMatrix.nodes.map((n) => n.id);
  const sccs = detectCycles(dsmMatrix.adjacency, nodeIds);
  const cyclic = new Set<string>();
  for (const scc of sccs) {
    for (const id of scc) cyclic.add(id);
  }
  const map = new Map<string, string>();
  for (const node of dsmMatrix.nodes) {
    map.set(node.id, cyclic.has(node.id) ? COLOR_CYCLIC : COLOR_NO_CYCLIC);
  }
  return map;
}

// ── Size metrics (LOC / files / functions) ──
// size-loc は単一ファイルの最大行数 (locMax) で色判定する。
// 集約レベル (component / container / system) で SUM ベースだと
// 大きな package がほぼ全て赤になり差が見えなくなるため、
// 「巨大ファイルが含まれているか」を可視化する Max ベースに統一する。
function computeSizeColorMap(
  overlay: 'size-loc' | 'size-files' | 'size-functions',
  sizeMatrix: SizeMatrix,
): Map<string, string> {
  const colorFn =
    overlay === 'size-loc' ? sizeLocColor : overlay === 'size-files' ? sizeFilesColor : sizeFunctionsColor;
  const field: keyof SizeMatrix[string] =
    overlay === 'size-loc' ? 'locMax' : overlay === 'size-files' ? 'files' : 'functions';
  const map = new Map<string, string>();
  for (const [elementId, entry] of Object.entries(sizeMatrix)) {
    map.set(elementId, colorFn(entry[field]));
  }
  return map;
}

// ─── Per-overlay color maps ───────────────────────────────────────────────────

function computeComplexityColorMap(
  overlay: 'edit-complexity-most' | 'edit-complexity-highest',
  complexityMatrix: ComplexityMatrix,
): Map<string, string> {
  const field = overlay === 'edit-complexity-most' ? 'mostFrequent' : 'highest';
  const map = new Map<string, string>();
  for (const entry of complexityMatrix.entries) {
    map.set(entry.elementId, COMPLEXITY_COLORS[entry[field]]);
  }
  return map;
}

function computeImportanceColorMap(importanceMatrix: ImportanceMatrix): Map<string, string> {
  const map = new Map<string, string>();
  for (const [elementId, score] of Object.entries(importanceMatrix)) {
    map.set(elementId, importanceHeatColor(score));
  }
  return map;
}

function computeCentralityColorMap(centralityMatrix: CentralityMatrix): Map<string, string> {
  const map = new Map<string, string>();
  for (const [elementId, score] of Object.entries(centralityMatrix)) {
    map.set(elementId, importanceHeatColor(score));
  }
  return map;
}

function computeRoleColorMap(roleMatrix: RoleMatrix): Map<string, string> {
  const map = new Map<string, string>();
  for (const [elementId, entry] of Object.entries(roleMatrix)) {
    map.set(elementId, ROLE_COLORS[entry.dominantRole]);
  }
  return map;
}

function computeDefectRiskColorMap(
  defectRiskMap: ReadonlyMap<string, number>,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const [elementId, score] of defectRiskMap) {
    map.set(elementId, defectRiskHeatColor(score));
  }
  return map;
}

function computeBusFactorColorMap(
  busFactorMap: ReadonlyMap<string, number>,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const [elementId, score] of busFactorMap) {
    map.set(elementId, busFactorHeatColor(score));
  }
  return map;
}

function computeDeadCodeColorMap(deadCodeMatrix: Record<string, number>): Map<string, string> {
  const map = new Map<string, string>();
  for (const [elementId, score] of Object.entries(deadCodeMatrix)) {
    map.set(elementId, deadCodeColor(score));
  }
  return map;
}

// L4 (code) は二値 (ratio = 0 or 1)、L3/L2 はグラデーション。
// ratio が undefined (集計対象なし) の要素は出力に含めない。
function computeArchitectureUiColorMap(
  architectureMatrix: ArchitectureMatrix,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const [elementId, entry] of Object.entries(architectureMatrix)) {
    if (entry.ratio === undefined) continue;
    map.set(elementId, architectureUiColor(entry.ratio));
  }
  return map;
}

// 層の色はテーマ依存のため呼び出し側（trail-viewer）から layerColors を受け取る。
function computeLayerColorMap(
  layerMatrix: LayerMatrix,
  layerColors: Readonly<Record<ArchitectureLayer, string>>,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const [elementId, layer] of Object.entries(layerMatrix)) {
    map.set(elementId, layerColors[layer]);
  }
  return map;
}

// ─── Overlay dispatch ─────────────────────────────────────────────────────────

/**
 * overlay の色決定に使う入力一式。
 * 引数が 15 個あるため、分岐グループへは 1 オブジェクトに束ねて渡す。
 */
interface ColorMapInputs {
  coverageMatrix: CoverageMatrix | null;
  dsmMatrix: DsmMatrix | null;
  complexityMatrix: ComplexityMatrix | null;
  importanceMatrix: ImportanceMatrix | null;
  defectRiskMap: ReadonlyMap<string, number> | null;
  hotspotMap: HotspotMap | null;
  deadCodeMatrix: Record<string, number> | null;
  sizeMatrix: SizeMatrix | null;
  centralityMatrix: CentralityMatrix | null;
  architectureMatrix: ArchitectureMatrix | null;
  roleMatrix: RoleMatrix | null;
  layerMatrix: LayerMatrix | null;
  layerColors: Readonly<Record<ArchitectureLayer, string>> | null;
  busFactorMap: ReadonlyMap<string, number> | null;
}

/** 元になる行列が無い overlay は空 Map へ縮退する（元の `matrix ? build : new Map()` と同一）。 */
function mapOrEmpty<T>(
  input: T | null,
  build: (value: T) => Map<string, string>,
): Map<string, string> {
  return input ? build(input) : new Map();
}

/**
 * グラフ構造系 overlay（none / coverage / DSM / 編集複雑度）を担当する。
 * どれにも該当しなければ null を返し、呼び出し側が次のグループへ委ねる。
 */
function computeGraphOverlayColorMap(
  overlay: MetricOverlay,
  inputs: ColorMapInputs,
): Map<string, string> | null {
  if (overlay === 'none') return new Map();

  // ── Coverage ──
  if (overlay === 'coverage-lines' || overlay === 'coverage-branches' || overlay === 'coverage-functions') {
    return mapOrEmpty(inputs.coverageMatrix, (m) => computeCoverageColorMap(overlay, m));
  }

  // ── DSM out/in ──
  if (overlay === 'dsm-out' || overlay === 'dsm-in') {
    return mapOrEmpty(inputs.dsmMatrix, (m) => computeDsmOutInColorMap(overlay, m));
  }

  // ── DSM cyclic ──
  if (overlay === 'dsm-cyclic') {
    return mapOrEmpty(inputs.dsmMatrix, computeDsmCyclicColorMap);
  }

  // ── Complexity ──
  if (overlay === 'edit-complexity-most' || overlay === 'edit-complexity-highest') {
    return mapOrEmpty(inputs.complexityMatrix, (m) => computeComplexityColorMap(overlay, m));
  }

  return null;
}

/**
 * スコア系 overlay（重要度 / 中心性 / 関数ロール / 欠陥リスク / 属人度 / デッドコード）を担当する。
 * どれにも該当しなければ null を返し、呼び出し側が次のグループへ委ねる。
 */
function computeScoreOverlayColorMap(
  overlay: MetricOverlay,
  inputs: ColorMapInputs,
): Map<string, string> | null {
  // ── Importance ──
  if (overlay === 'importance') {
    return mapOrEmpty(inputs.importanceMatrix, computeImportanceColorMap);
  }

  // ── Centrality ──
  if (overlay === 'centrality') {
    return mapOrEmpty(inputs.centralityMatrix, computeCentralityColorMap);
  }

  // ── Function Roles ──
  if (overlay === 'function-roles') {
    return mapOrEmpty(inputs.roleMatrix, computeRoleColorMap);
  }

  // ── Defect Risk ──
  if (overlay === 'defect-risk') {
    return mapOrEmpty(inputs.defectRiskMap, computeDefectRiskColorMap);
  }

  // ── Bus Factor（属人度。高いほど「その人しか触っていない」） ──
  if (overlay === 'bus-factor') {
    return mapOrEmpty(inputs.busFactorMap, computeBusFactorColorMap);
  }

  // ── Dead Code Score ──
  if (overlay === 'dead-code-score') {
    return mapOrEmpty(inputs.deadCodeMatrix, computeDeadCodeColorMap);
  }

  return null;
}

/**
 * 規模・変更頻度・アーキテクチャ系 overlay（hotspot / size / architecture）を担当する。
 * どれにも該当しなければ null を返し、呼び出し側が空 Map へ落とす。
 */
function computeVolumeOverlayColorMap(
  overlay: MetricOverlay,
  inputs: ColorMapInputs,
): Map<string, string> | null {
  // ── Hotspot ──
  if (overlay === 'hotspot-frequency' || overlay === 'hotspot-risk') {
    return mapOrEmpty(inputs.hotspotMap, (m) => computeHotspotColorMap(overlay, m));
  }

  // ── Size metrics (LOC / files / functions) ──
  if (overlay === 'size-loc' || overlay === 'size-files' || overlay === 'size-functions') {
    return mapOrEmpty(inputs.sizeMatrix, (m) => computeSizeColorMap(overlay, m));
  }

  // ── Architecture: UI / Logic 比率 ──
  if (overlay === 'architecture-ui') {
    return mapOrEmpty(inputs.architectureMatrix, computeArchitectureUiColorMap);
  }

  // ── Architecture: レイヤー（9 層・モジュール粒度）──
  if (overlay === 'architecture-layer') {
    if (!inputs.layerMatrix || !inputs.layerColors) return new Map();
    return computeLayerColorMap(inputs.layerMatrix, inputs.layerColors);
  }

  return null;
}

export function computeColorMap(
  overlay: MetricOverlay,
  coverageMatrix: CoverageMatrix | null,
  dsmMatrix: DsmMatrix | null,
  complexityMatrix: ComplexityMatrix | null,
  importanceMatrix: ImportanceMatrix | null = null,
  defectRiskMap: ReadonlyMap<string, number> | null = null,
  hotspotMap: HotspotMap | null = null,
  deadCodeMatrix: Record<string, number> | null = null,
  sizeMatrix: SizeMatrix | null = null,
  centralityMatrix: CentralityMatrix | null = null,
  architectureMatrix: ArchitectureMatrix | null = null,
  roleMatrix: RoleMatrix | null = null,
  layerMatrix: LayerMatrix | null = null,
  layerColors: Readonly<Record<ArchitectureLayer, string>> | null = null,
  /** Phase 6 S5-B: 属人度スコア（0-1）。score 未判定の要素は含まれない */
  busFactorMap: ReadonlyMap<string, number> | null = null,
): Map<string, string> {
  const inputs: ColorMapInputs = {
    coverageMatrix,
    dsmMatrix,
    complexityMatrix,
    importanceMatrix,
    defectRiskMap,
    hotspotMap,
    deadCodeMatrix,
    sizeMatrix,
    centralityMatrix,
    architectureMatrix,
    roleMatrix,
    layerMatrix,
    layerColors,
    busFactorMap,
  };

  // 判定順序は元の if 連鎖のまま（overlay 値はグループ間で重複しない）。
  return (
    computeGraphOverlayColorMap(overlay, inputs) ??
    computeScoreOverlayColorMap(overlay, inputs) ??
    computeVolumeOverlayColorMap(overlay, inputs) ??
    new Map()
  );
}

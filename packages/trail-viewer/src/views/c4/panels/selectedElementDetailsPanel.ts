/**
 * C4 選択要素 詳細パネルの DSM / Metrics / Community セクションを vanilla DOM で描画する。
 *
 * React 版 `C4ViewerCore.tsx`（選択要素 details 内の DSM / メトリクス / コミュニティ JSX）の
 * 等価実装。vanilla 移行（commit e42b06fde）で欠落した 3 セクションを復元する。
 * 表示データは {@link SelectedElementInfo}（純粋関数 buildSelectedElementInfo の出力）で受け取る。
 *
 * 注: 本セクションは `updateElementInfoPanels` の再構築（host の innerHTML クリア後）の一部として
 * 呼ばれる前提のため、永続ハンドルを持たず host へ追記するだけの関数として提供する。
 */
import type { CodeGraph } from '@anytime-markdown/trail-core/codeGraph';
import type { FeatureMatrix } from '@anytime-markdown/trail-core/c4';
import { communityColor } from '../../../components/communityColors';
import { COMMUNITY_ROLE_LABELS, getCommunityRoleBgColors } from '../../../c4/communityRoleColors';
import { formatPct } from '../../../c4/utils/c4ViewerHelpers';
import type { SelectedElementInfo } from './selectedElementInfo';

export interface SelectedElementDetailColors {
  readonly border: string;
  readonly text: string;
  readonly textSecondary: string;
  readonly textMuted: string;
  readonly accent: string;
  readonly hover: string;
  readonly bg: string;
}

export interface SelectedElementDetailOptions {
  readonly colors: SelectedElementDetailColors;
  readonly t: (key: string) => string;
  readonly isDark: boolean;
  readonly codeGraph: CodeGraph | null;
  readonly featureMatrix: FeatureMatrix | null;
  /** Matrix ジャンプアイコンの SVG path（呼び出し側 ICONS.tableChart） */
  readonly matrixIconPath: string;
  /** Graph ジャンプアイコンの SVG path（呼び出し側 ICONS.accountTree） */
  readonly graphIconPath: string;
  readonly onOpenMatrix: () => void;
  readonly onOpenGraph: () => void;
}

function el(tag: string, cssText: string, attrs?: Record<string, string>): HTMLElement {
  const node = document.createElement(tag);
  node.style.cssText = cssText;
  if (attrs) for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}

function makeSvgIcon(path: string, color: string, size = 14): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.style.cssText = `width:${size}px;height:${size}px;fill:${color};flex-shrink:0;`;
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('d', path);
  svg.appendChild(p);
  return svg;
}

function sectionDivider(border: string): HTMLElement {
  return el('div', `border-top:1px solid ${border};margin-top:10px;padding-top:8px;`);
}

function metricCell(c: SelectedElementDetailColors, label: string, value: string): HTMLElement {
  const cell = el('div', '');
  const labelEl = el('div', `font-size:0.58rem;color:${c.textMuted};`);
  labelEl.textContent = label;
  const valueEl = el('div', `font-size:0.72rem;color:${c.text};font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;`);
  valueEl.textContent = value;
  cell.append(labelEl, valueEl);
  return cell;
}

function iconButton(c: SelectedElementDetailColors, iconPath: string, label: string, onClick: () => void): HTMLButtonElement {
  const btn = el('button', `display:inline-flex;align-items:center;justify-content:center;padding:2px;background:transparent;border:none;cursor:pointer;color:${c.accent};border-radius:4px;`, { type: 'button', title: label, 'aria-label': label }) as HTMLButtonElement;
  btn.appendChild(makeSvgIcon(iconPath, c.accent, 14));
  btn.addEventListener('click', (e) => { e.stopPropagation(); onClick(); });
  return btn;
}

// ── DSM (In/Out) ──
function appendDsmSection(host: HTMLElement, info: SelectedElementInfo, opts: SelectedElementDetailOptions): void {
  const c = opts.colors;
  const sec = sectionDivider(c.border);
  const title = el('div', `font-size:0.68rem;color:${c.textSecondary};font-weight:700;margin-bottom:6px;`);
  title.textContent = 'DSM';
  sec.appendChild(title);
  const grid = el('div', 'display:grid;grid-template-columns:1fr 1fr;gap:8px;');
  grid.append(
    metricCell(c, 'In', info.incoming != null ? String(info.incoming) : '-'),
    metricCell(c, 'Out', info.outgoing != null ? String(info.outgoing) : '-'),
  );
  sec.appendChild(grid);
  host.appendChild(sec);
}

// ── Metrics (Size / Quality / Structure) ──
function appendSizeRow(host: HTMLElement, info: SelectedElementInfo, opts: SelectedElementDetailOptions): void {
  const c = opts.colors;
  const t = opts.t;
  const block = el('div', '');
  const label = el('div', `font-size:0.62rem;color:${c.textSecondary};font-weight:600;margin-bottom:4px;`);
  label.textContent = t('c4.popup.size');
  block.appendChild(label);
  const s = info.sizeMetrics;
  // LOC は SUM(MAX) 形式（MAX は size-loc オーバーレイの色判定値）
  const locDisplay = s.loc != null ? `${s.loc}(${s.locMax ?? '-'})` : '-';
  const grid = el('div', 'display:grid;grid-template-columns:1fr 1fr 1fr;gap:4px;');
  grid.append(
    metricCell(c, t('c4.popup.metric.loc'), locDisplay),
    metricCell(c, t('c4.popup.metric.files'), s.fileCount != null ? String(s.fileCount) : '-'),
    metricCell(c, t('c4.popup.metric.functionCount'), s.functionCount != null ? String(s.functionCount) : '-'),
  );
  block.appendChild(grid);
  host.appendChild(block);
}

function appendQualityRow(host: HTMLElement, info: SelectedElementInfo, opts: SelectedElementDetailOptions): void {
  const c = opts.colors;
  const t = opts.t;
  const block = el('div', 'margin-top:8px;');
  const label = el('div', `font-size:0.62rem;color:${c.textSecondary};font-weight:600;margin-bottom:4px;`);
  label.textContent = t('c4.popup.quality');
  block.appendChild(label);
  const cov = info.coverage;
  const covGrid = el('div', 'display:grid;grid-template-columns:1fr 1fr 1fr;gap:4px;');
  covGrid.append(
    metricCell(c, t('c4.popup.metric.coverage'), cov ? formatPct(cov.lines.pct) : '-'),
    metricCell(c, t('c4.popup.metric.branches'), cov ? formatPct(cov.branches.pct) : '-'),
    metricCell(c, t('c4.popup.metric.functions'), cov ? formatPct(cov.functions.pct) : '-'),
  );
  block.appendChild(covGrid);
  const riskGrid = el('div', 'display:grid;grid-template-columns:1fr 1fr;gap:4px;margin-top:6px;');
  riskGrid.append(
    metricCell(c, t('c4.popup.metric.defectRisk'), info.defectRisk != null ? String(Math.round(info.defectRisk)) : '-'),
    metricCell(c, t('c4.popup.metric.churn'), info.hotspot?.churn != null ? String(info.hotspot.churn) : '-'),
  );
  block.appendChild(riskGrid);
  host.appendChild(block);
}

function appendStructureRow(host: HTMLElement, info: SelectedElementInfo, opts: SelectedElementDetailOptions): void {
  const c = opts.colors;
  const t = opts.t;
  const block = el('div', 'margin-top:8px;');
  const label = el('div', `font-size:0.62rem;color:${c.textSecondary};font-weight:600;margin-bottom:4px;`);
  label.textContent = t('c4.popup.structure');
  block.appendChild(label);
  const grid = el('div', 'display:grid;grid-template-columns:1fr 1fr;gap:6px;');
  grid.append(
    metricCell(c, t('c4.popup.metric.complexity'), info.complexity?.highest ?? '-'),
    metricCell(c, t('c4.popup.metric.importance'), info.importance != null ? String(Math.round(info.importance)) : '-'),
  );
  block.appendChild(grid);
  host.appendChild(block);
}

function appendMetricsSection(host: HTMLElement, info: SelectedElementInfo, opts: SelectedElementDetailOptions): void {
  const c = opts.colors;
  const sec = sectionDivider(c.border);
  const header = el('div', 'display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;');
  const title = el('div', `font-size:0.68rem;color:${c.textSecondary};font-weight:700;`);
  title.textContent = opts.t('c4.popup.metrics');
  header.append(title, iconButton(c, opts.matrixIconPath, opts.t('viewer.tab.matrix'), opts.onOpenMatrix));
  sec.appendChild(header);
  appendSizeRow(sec, info, opts);
  appendQualityRow(sec, info, opts);
  appendStructureRow(sec, info, opts);
  host.appendChild(sec);
}

// ── Community ──
function communityDisplayName(opts: SelectedElementDetailOptions, communityId: number): string {
  const summary = opts.codeGraph?.communitySummaries?.[communityId];
  const fallback = opts.codeGraph?.communities[communityId];
  return summary?.name ?? fallback ?? `#${communityId}`;
}

function roleForCommunity(opts: SelectedElementDetailOptions, elementId: string, communityId: number): string | null {
  const fm = opts.featureMatrix;
  if (!fm) return null;
  const featureId = `f_community_${communityId}`;
  return fm.mappings.find((m) => m.featureId === featureId && m.elementId === elementId)?.role ?? null;
}

function roleBadge(role: string): HTMLElement {
  const bg = getCommunityRoleBgColors();
  const color = bg[role as keyof typeof bg] ?? bg.dependency;
  const label = COMMUNITY_ROLE_LABELS[role as keyof typeof COMMUNITY_ROLE_LABELS] ?? role;
  const badge = el('span', `display:inline-block;padding:1px 4px;border-radius:4px;background:${color};color:#fff;font-size:0.6rem;font-weight:700;flex-shrink:0;`);
  badge.textContent = label;
  return badge;
}

function appendCommunityBreakdown(sec: HTMLElement, info: SelectedElementInfo, opts: SelectedElementDetailOptions): void {
  const community = info.community;
  if (!community || community.breakdown.length <= 1) return;
  const c = opts.colors;
  const elementId = info.element.id;
  const total = community.breakdown.reduce((sum, e) => sum + e.count, 0);
  const block = el('div', 'margin-top:6px;');
  const label = el('div', `font-size:0.6rem;color:${c.textMuted};margin-bottom:2px;`);
  label.textContent = opts.t('c4.community.breakdown');
  block.appendChild(label);
  for (const entry of community.breakdown.slice(0, 3)) {
    const pct = total > 0 ? Math.round((entry.count / total) * 100) : 0;
    const name = communityDisplayName(opts, entry.community);
    const row = el('div', 'display:flex;align-items:center;gap:4px;margin-bottom:2px;', { title: `${name} #${entry.community} — ${entry.count}/${total} (${pct}%)` });
    const dot = el('div', `width:8px;height:8px;border-radius:2px;background:${communityColor(entry.community)};flex-shrink:0;`);
    const bar = el('div', `flex:1;height:4px;background:${c.hover};border-radius:2px;overflow:hidden;`);
    bar.appendChild(el('div', `width:${pct}%;height:100%;background:${communityColor(entry.community)};`));
    const role = roleForCommunity(opts, elementId, entry.community);
    const pctEl = el('span', `font-size:0.6rem;color:${c.textSecondary};min-width:30px;text-align:right;`);
    pctEl.textContent = `${pct}%`;
    row.append(dot, bar);
    if (role) row.appendChild(roleBadge(role));
    row.appendChild(pctEl);
    block.appendChild(row);
  }
  const otherCount = community.breakdown.slice(3).reduce((sum, e) => sum + e.count, 0);
  if (otherCount > 0) {
    const otherPct = total > 0 ? Math.round((otherCount / total) * 100) : 0;
    const other = el('div', `font-size:0.58rem;color:${c.textMuted};`);
    other.textContent = `${opts.t('c4.community.other')}: ${otherPct}%`;
    block.appendChild(other);
  }
  sec.appendChild(block);
}

function appendCommunitySection(host: HTMLElement, info: SelectedElementInfo, opts: SelectedElementDetailOptions): void {
  const community = info.community;
  if (!community) return;
  const c = opts.colors;
  const elementId = info.element.id;
  const sec = sectionDivider(c.border);

  const header = el('div', 'display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;');
  const title = el('div', `font-size:0.68rem;color:${c.textSecondary};font-weight:700;`);
  title.textContent = opts.t('c4.community.title');
  header.append(title, iconButton(c, opts.graphIconPath, opts.t('viewer.tab.graph'), opts.onOpenGraph));
  sec.appendChild(header);

  const nameRow = el('div', 'display:flex;align-items:center;gap:6px;flex-wrap:wrap;');
  nameRow.appendChild(el('div', `width:10px;height:10px;border-radius:50%;background:${communityColor(community.dominantCommunity)};flex-shrink:0;`));
  const nameEl = el('div', `font-size:0.74rem;color:${c.text};font-weight:600;word-break:break-word;`);
  nameEl.textContent = communityDisplayName(opts, community.dominantCommunity);
  nameRow.appendChild(nameEl);
  const dominantRole = roleForCommunity(opts, elementId, community.dominantCommunity);
  if (dominantRole) nameRow.appendChild(roleBadge(dominantRole));
  sec.appendChild(nameRow);

  const summaryText = community.communitySummary?.summary;
  if (summaryText) {
    const sum = el('div', `font-size:0.66rem;color:${c.textSecondary};margin-top:4px;line-height:1.4;`);
    sum.textContent = summaryText;
    sec.appendChild(sum);
  }

  if (community.isGodNode) {
    const hub = el('span', `display:inline-block;margin-top:4px;padding:1px 4px;border-radius:4px;background:${c.accent};color:${opts.isDark ? c.bg : '#fff'};font-size:0.6rem;font-weight:700;`);
    hub.textContent = `★ ${opts.t('c4.community.hubNode')}`;
    sec.appendChild(hub);
  }

  appendCommunityBreakdown(sec, info, opts);
  host.appendChild(sec);
}

/**
 * 選択要素の DSM / Metrics / Community セクションを host へ追記する。
 * host は呼び出し側が描画ごとにクリア・再構築する前提（永続ハンドルは持たない）。
 */
export function appendSelectedElementDetailSections(
  host: HTMLElement,
  info: SelectedElementInfo,
  opts: SelectedElementDetailOptions,
): void {
  appendDsmSection(host, info, opts);
  appendMetricsSection(host, info, opts);
  appendCommunitySection(host, info, opts);
}

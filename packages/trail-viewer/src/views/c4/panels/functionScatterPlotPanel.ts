/**
 * FunctionScatterPlot のツールバー + 凡例部分の vanilla DOM 等価実装。
 * キャンバス (BubbleCanvas / GalaxyCanvas / CodeCityCanvas / TourMode) は
 * React 側に残るため、このビューはツールバーと凡例のみを担当する。
 */
import { createButton } from '@anytime-markdown/ui-core';
import type { VanillaViewHandle } from '../../../shared/vanillaIsland';
import type { COMPLEXITY_TIERS, ComplexityTier } from '../../../c4/components/panels/FunctionScatterPlot';
import type { FunctionRole } from '@anytime-markdown/trail-core/c4';

type ViewMode = 'scatter' | 'galaxy' | 'city';

interface LegendColor {
  readonly role: string;
  readonly color: string;
}

interface TierLegend {
  readonly tier: ComplexityTier;
  readonly markerSize: number;
  readonly label: string;
}

const ROLE_COLORS_LIST: readonly LegendColor[] = [
  { role: 'hub',          color: '#c62828' },
  { role: 'orchestrator', color: '#f9a825' },
  { role: 'leaf',         color: '#2e7d32' },
  { role: 'peripheral',   color: '#9e9e9e' },
];

const TIER_LEGENDS: readonly TierLegend[] = [
  { tier: 'low',  markerSize: 4,  label: '0–4' },
  { tier: 'mid',  markerSize: 9,  label: '5–14' },
  { tier: 'high', markerSize: 16, label: '15+' },
];

export interface FunctionScatterPlotPanelColors {
  readonly border: string;
  readonly text: string;
  readonly textSecondary: string;
  readonly textMuted: string;
}

export interface FunctionScatterPlotPanelProps {
  readonly view: ViewMode;
  readonly tourActive: boolean;
  readonly tourStepsCount: number;
  readonly onViewChange: (mode: ViewMode) => void;
  readonly onTourToggle: () => void;
  readonly colors: FunctionScatterPlotPanelColors;
  readonly t: (key: string) => string;
}

const VIEW_MODES: ReadonlyArray<{ readonly value: ViewMode; readonly i18n: string }> = [
  { value: 'scatter', i18n: 'c4.scatter.tabScatter' },
  { value: 'galaxy',  i18n: 'c4.scatter.tabGalaxy'  },
  { value: 'city',    i18n: 'c4.scatter.tabCity'    },
];

export function mountFunctionScatterPlotPanel(
  container: HTMLElement,
  initial: FunctionScatterPlotPanelProps,
): VanillaViewHandle<FunctionScatterPlotPanelProps> {
  let props = initial;

  const root = document.createElement('div');
  root.style.cssText = 'display:flex;flex-direction:column;gap:6px;padding-bottom:6px;';
  container.appendChild(root);

  // Title
  const titleEl = document.createElement('span');
  titleEl.style.cssText = 'font-size:0.75rem;font-weight:500;';
  root.appendChild(titleEl);

  // ── Toolbar row ──────────────────────────────────────────────────────────
  const toolbarEl = document.createElement('div');
  toolbarEl.style.cssText = 'display:flex;align-items:center;gap:4px;flex-wrap:wrap;';
  root.appendChild(toolbarEl);

  // View-mode toggle buttons
  const viewBtnGroup = document.createElement('div');
  viewBtnGroup.style.cssText = 'display:flex;border-radius:4px;overflow:hidden;flex-shrink:0;';
  toolbarEl.appendChild(viewBtnGroup);

  const viewButtons: Array<{ value: ViewMode; el: HTMLButtonElement }> = VIEW_MODES.map(({ value, i18n }) => {
    const { el } = createButton({
      label: props.t(i18n),
      variant: 'outlined',
      size: 'small',
      onClick: () => props.onViewChange(value),
    });
    el.style.borderRadius = '0';
    el.style.border = 'none';
    viewBtnGroup.appendChild(el);
    return { value, el };
  });

  // Tour toggle button
  const { el: tourBtnEl } = createButton({
    label: props.t('c4.scatter.tour'),
    variant: 'outlined',
    size: 'small',
    onClick: () => props.onTourToggle(),
  });
  tourBtnEl.setAttribute('aria-label', 'tour');
  toolbarEl.appendChild(tourBtnEl);

  // ── Legend row ───────────────────────────────────────────────────────────
  const legendEl = document.createElement('div');
  legendEl.style.cssText = 'display:flex;flex-wrap:wrap;gap:10px;';
  root.appendChild(legendEl);

  // Role legend
  const roleLegend = document.createElement('div');
  roleLegend.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;';
  legendEl.appendChild(roleLegend);

  for (const { role, color } of ROLE_COLORS_LIST) {
    const item = document.createElement('div');
    item.style.cssText = 'display:flex;align-items:center;gap:3px;';
    const dot = document.createElement('span');
    dot.setAttribute('aria-hidden', 'true');
    dot.style.cssText = `width:8px;height:8px;border-radius:50%;background:${color};flex-shrink:0;`;
    const label = document.createElement('span');
    label.style.cssText = `font-size:0.65rem;color:${props.colors.textSecondary};`;
    label.textContent = role;
    item.append(dot, label);
    roleLegend.appendChild(item);
  }

  // Tier legend (complexity circles)
  const tierLegend = document.createElement('div');
  tierLegend.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;align-items:center;';
  legendEl.appendChild(tierLegend);

  for (const { markerSize, label } of TIER_LEGENDS) {
    const item = document.createElement('div');
    item.style.cssText = 'display:flex;align-items:center;gap:3px;';
    const circle = document.createElement('span');
    circle.setAttribute('aria-hidden', 'true');
    circle.style.cssText = `display:inline-block;border-radius:50%;background:${props.colors.textMuted};flex-shrink:0;`;
    circle.style.width = `${markerSize}px`;
    circle.style.height = `${markerSize}px`;
    const labelEl = document.createElement('span');
    labelEl.style.cssText = `font-size:0.65rem;color:${props.colors.textSecondary};`;
    labelEl.textContent = `CC ${label}`;
    item.append(circle, labelEl);
    tierLegend.appendChild(item);
  }

  function render(): void {
    const c = props.colors;

    // Title
    titleEl.textContent = props.t('c4.scatter.title');
    titleEl.style.color = c.text;

    // Update view button states
    for (const { value, el } of viewButtons) {
      const active = props.view === value;
      el.style.backgroundColor = active ? c.border : 'transparent';
      el.style.color = c.text;
      el.setAttribute('aria-pressed', active ? 'true' : 'false');
    }

    // Update tour button
    const hasTour = props.tourStepsCount > 0;
    tourBtnEl.disabled = !hasTour;
    tourBtnEl.textContent = props.tourActive
      ? props.t('c4.scatter.tourStop')
      : props.t('c4.scatter.tour');
    tourBtnEl.style.color = props.tourActive ? '#ef5350' : c.text;

    // Hide legend in non-scatter modes
    legendEl.style.display = props.view === 'scatter' ? 'flex' : 'none';

    // Apply border color for role legend items
    for (let i = 0; i < ROLE_COLORS_LIST.length; i++) {
      const roleItem = roleLegend.children[i] as HTMLElement | undefined;
      if (!roleItem) continue;
      const labelEl = roleItem.lastElementChild as HTMLElement | null;
      if (labelEl) labelEl.style.color = c.textSecondary;
    }
    for (let i = 0; i < TIER_LEGENDS.length; i++) {
      const tierItem = tierLegend.children[i] as HTMLElement | undefined;
      if (!tierItem) continue;
      const circle = tierItem.firstElementChild as HTMLElement | null;
      if (circle) circle.style.background = c.textMuted;
      const labelEl = tierItem.lastElementChild as HTMLElement | null;
      if (labelEl) labelEl.style.color = c.textSecondary;
    }
  }

  render();

  return {
    update(next) {
      props = next;
      render();
    },
    destroy() {
      root.remove();
    },
  };
}

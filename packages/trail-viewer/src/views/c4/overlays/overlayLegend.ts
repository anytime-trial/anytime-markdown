/**
 * OverlayLegend — vanilla DOM view.
 * Thin port of c4/components/overlays/OverlayLegend.tsx.
 */
import type { MetricOverlay } from '@anytime-markdown/trail-core/c4';
import type { VanillaViewHandle } from '../../../shared/vanillaIsland';
import {
  COVERAGE_HIGH,
  COVERAGE_MID,
  COVERAGE_LOW,
  METRIC_LEGEND_BLUE,
} from '../../../c4/c4MetricColors';
import {
  ARCHITECTURE_LAYER_ORDER,
  LAYER_LABEL_KEYS,
  layerColor,
} from '../../../components/communityColors';

export interface CommunityLegendItem {
  readonly community: number;
  readonly color: string;
  readonly name: string;
  readonly summary?: string;
}

export interface OverlayLegendVanillaProps {
  readonly overlay: MetricOverlay;
  readonly isDark: boolean;
  readonly dsmMax?: number;
  readonly sizeMax?: number;
  readonly communityLegend?: readonly CommunityLegendItem[];
  readonly communityTitle?: string;
  readonly inline?: boolean;
  readonly t: (key: string) => string;
  readonly textColor: string;
  readonly bg: string;
  readonly dividerColor: string;
}

// ---- helpers ----------------------------------------------------------------

const HOTSPOT_FREQ_RGB = '232, 160, 18';
const HOTSPOT_RISK_RGB = '232, 80, 28';
const HOTSPOT_FREQ_GRADIENT = `linear-gradient(to right, rgba(${HOTSPOT_FREQ_RGB}, 0.10), rgba(${HOTSPOT_FREQ_RGB}, 1.0))`;
const HOTSPOT_RISK_GRADIENT = `linear-gradient(to right, rgba(${HOTSPOT_RISK_RGB}, 0.10), rgba(${HOTSPOT_RISK_RGB}, 1.0))`;
const DSM_NEIGHBORS_GRADIENT = `linear-gradient(to right, ${METRIC_LEGEND_BLUE}, ${COVERAGE_LOW})`;
const ARCHITECTURE_UI_GRADIENT = 'linear-gradient(to right, #757575, #1976d2)';

interface SegmentBarItem {
  readonly color: string;
  readonly label: string;
}

function makeSwatch(color: string, label: string): HTMLDivElement {
  const wrap = document.createElement('div');
  wrap.style.cssText = 'display:flex;align-items:center;gap:4px;';
  const swatch = document.createElement('div');
  swatch.style.cssText = `width:12px;height:12px;border-radius:2px;background:${color};flex-shrink:0;`;
  const text = document.createElement('span');
  text.style.cssText = 'font-size:0.65rem;line-height:1;';
  text.textContent = label;
  wrap.appendChild(swatch);
  wrap.appendChild(text);
  return wrap;
}

function makeGradientBar(
  background: string,
  lowLabel: string,
  highLabel: string,
  textColor: string,
): HTMLDivElement {
  const wrap = document.createElement('div');
  wrap.style.cssText = 'width:100%;';
  const bar = document.createElement('div');
  bar.setAttribute('role', 'img');
  bar.setAttribute('aria-label', `${lowLabel} → ${highLabel}`);
  bar.style.cssText = `width:100%;height:10px;border-radius:2px;background:${background};`;
  const labels = document.createElement('div');
  labels.style.cssText = 'display:flex;justify-content:space-between;margin-top:2px;';
  const low = document.createElement('span');
  low.style.cssText = `font-size:0.65rem;line-height:1;color:${textColor};`;
  low.textContent = lowLabel;
  const high = document.createElement('span');
  high.style.cssText = `font-size:0.65rem;line-height:1;color:${textColor};`;
  high.textContent = highLabel;
  labels.appendChild(low);
  labels.appendChild(high);
  wrap.appendChild(bar);
  wrap.appendChild(labels);
  return wrap;
}

function makeSegmentBar(
  segments: readonly SegmentBarItem[],
  textColor: string,
  boundaries?: readonly string[],
  startLabel?: string,
  endLabel?: string,
): HTMLDivElement {
  const wrap = document.createElement('div');
  wrap.style.cssText = 'width:100%;';

  const ariaLabel = boundaries
    ? `boundaries: ${boundaries.join(', ')}`
    : segments.map((s) => s.label).join(' / ');

  const bar = document.createElement('div');
  bar.setAttribute('role', 'img');
  bar.setAttribute('aria-label', ariaLabel);
  bar.style.cssText = 'display:flex;width:100%;height:10px;border-radius:2px;overflow:hidden;';
  for (const seg of segments) {
    const cell = document.createElement('div');
    cell.style.cssText = `flex:1;background:${seg.color};`;
    bar.appendChild(cell);
  }
  wrap.appendChild(bar);

  if (boundaries) {
    const tickRow = document.createElement('div');
    tickRow.style.cssText = 'position:relative;height:12px;margin-top:2px;';

    const ticks: Array<{ label: string; leftPct: number; transform: string }> = [];
    boundaries.forEach((label, i) => {
      ticks.push({
        label,
        leftPct: ((i + 1) / segments.length) * 100,
        transform: 'translateX(-50%)',
      });
    });
    if (startLabel !== undefined) {
      ticks.unshift({ label: startLabel, leftPct: 0, transform: 'translateX(0)' });
    }
    if (endLabel !== undefined) {
      ticks.push({ label: endLabel, leftPct: 100, transform: 'translateX(-100%)' });
    }

    for (const tick of ticks) {
      const t = document.createElement('span');
      t.style.cssText =
        `position:absolute;left:${tick.leftPct}%;transform:${tick.transform};` +
        `font-size:0.65rem;line-height:1;color:${textColor};`;
      t.textContent = tick.label;
      tickRow.appendChild(t);
    }
    wrap.appendChild(tickRow);
  } else {
    const labelRow = document.createElement('div');
    labelRow.style.cssText = 'display:flex;margin-top:2px;';
    for (const seg of segments) {
      const lbl = document.createElement('span');
      lbl.style.cssText =
        `flex:1;font-size:0.65rem;line-height:1;color:${textColor};text-align:center;`;
      lbl.textContent = seg.label;
      labelRow.appendChild(lbl);
    }
    wrap.appendChild(labelRow);
  }
  return wrap;
}

const ASCENDING_BAD: readonly SegmentBarItem[] = [
  { color: COVERAGE_HIGH, label: 'low' },
  { color: COVERAGE_MID, label: 'mid' },
  { color: COVERAGE_LOW, label: 'high' },
];
const ASCENDING_GOOD: readonly SegmentBarItem[] = [
  { color: COVERAGE_LOW, label: 'low' },
  { color: COVERAGE_MID, label: 'mid' },
  { color: COVERAGE_HIGH, label: 'high' },
];
const DSM_CYCLIC_SEGMENTS: readonly SegmentBarItem[] = [
  { color: COVERAGE_HIGH, label: 'ok' },
  { color: COVERAGE_LOW, label: 'cyclic' },
];

function buildMetricItems(
  overlay: MetricOverlay,
  dsmMax: number | undefined,
  sizeMax: number | undefined,
  textColor: string,
  t: (key: string) => string,
  isDark: boolean,
): HTMLElement | null {
  switch (overlay) {
    case 'coverage-lines':
    case 'coverage-branches':
    case 'coverage-functions':
      return makeSegmentBar(ASCENDING_GOOD, textColor, ['50', '80'], '0%', '100%');
    case 'dsm-out':
    case 'dsm-in':
      return makeGradientBar(
        DSM_NEIGHBORS_GRADIENT,
        '0',
        `max${dsmMax !== undefined ? ` (${dsmMax})` : ''}`,
        textColor,
      );
    case 'dsm-cyclic':
      return makeSegmentBar(DSM_CYCLIC_SEGMENTS, textColor);
    case 'edit-complexity-most':
    case 'edit-complexity-highest': {
      const wrap = document.createElement('div');
      wrap.style.cssText = 'display:flex;flex-direction:column;gap:2px;';
      wrap.appendChild(makeSwatch(COVERAGE_LOW, 'high'));
      wrap.appendChild(makeSwatch(COVERAGE_MID, 'multi-file'));
      wrap.appendChild(makeSwatch(METRIC_LEGEND_BLUE, 'search'));
      wrap.appendChild(makeSwatch(COVERAGE_HIGH, 'low'));
      return wrap;
    }
    case 'importance':
    case 'centrality':
      return makeSegmentBar(ASCENDING_BAD, textColor, ['40', '70'], '0', '100');
    case 'defect-risk':
      return makeSegmentBar(ASCENDING_BAD, textColor, ['0.35', '0.7'], '0', '1');
    case 'hotspot-frequency':
      return makeGradientBar(HOTSPOT_FREQ_GRADIENT, 'low', 'high', textColor);
    case 'hotspot-risk':
      return makeGradientBar(HOTSPOT_RISK_GRADIENT, 'low', 'high', textColor);
    case 'dead-code-score':
      return makeSegmentBar(ASCENDING_BAD, textColor, ['40', '70'], '0', '100');
    case 'size-loc':
      return makeSegmentBar(
        ASCENDING_BAD,
        textColor,
        ['500', '1000'],
        '0',
        sizeMax !== undefined ? String(sizeMax) : undefined,
      );
    case 'size-files':
      return makeSegmentBar(
        ASCENDING_BAD,
        textColor,
        ['20', '50'],
        '0',
        sizeMax !== undefined ? String(sizeMax) : undefined,
      );
    case 'size-functions':
      return makeSegmentBar(
        ASCENDING_BAD,
        textColor,
        ['10', '50'],
        '0',
        sizeMax !== undefined ? String(sizeMax) : undefined,
      );
    case 'architecture-ui':
      return makeGradientBar(ARCHITECTURE_UI_GRADIENT, 'Logic', 'UI', textColor);
    case 'architecture-layer': {
      const wrap = document.createElement('div');
      wrap.style.cssText = 'display:flex;flex-direction:row;flex-wrap:wrap;gap:8px;';
      for (const layer of ARCHITECTURE_LAYER_ORDER) {
        wrap.appendChild(makeSwatch(layerColor(layer, isDark), t(LAYER_LABEL_KEYS[layer])));
      }
      return wrap;
    }
    case 'function-roles': {
      const wrap = document.createElement('div');
      wrap.style.cssText = 'display:flex;flex-direction:row;flex-wrap:wrap;gap:8px;';
      wrap.appendChild(makeSwatch('#c62828', t('c4.functionRole.hub')));
      wrap.appendChild(makeSwatch('#f9a825', t('c4.functionRole.orchestrator')));
      wrap.appendChild(makeSwatch('#2e7d32', t('c4.functionRole.leaf')));
      wrap.appendChild(makeSwatch('#9e9e9e', t('c4.functionRole.peripheral')));
      return wrap;
    }
    case 'none':
    case 'fcmap':
      return null;
    default: {
      // exhaustive check
      const _exhaustive: never = overlay;
      return null;
    }
  }
}

function buildHelpHeader(
  overlay: MetricOverlay,
  textColor: string,
  t: (key: string) => string,
): HTMLElement | null {
  type HelpKey = { titleKey: string; descKey: string };
  const helpMap: Partial<Record<MetricOverlay, HelpKey>> = {
    'coverage-lines': { titleKey: 'c4.overlayHelp.coverage', descKey: 'c4.overlayHelp.coverage.description' },
    'coverage-branches': { titleKey: 'c4.overlayHelp.coverage', descKey: 'c4.overlayHelp.coverage.description' },
    'coverage-functions': { titleKey: 'c4.overlayHelp.coverage', descKey: 'c4.overlayHelp.coverage.description' },
    'dsm-out': { titleKey: 'c4.overlayHelp.dsmNeighbors', descKey: 'c4.overlayHelp.dsmNeighbors.description' },
    'dsm-in': { titleKey: 'c4.overlayHelp.dsmNeighbors', descKey: 'c4.overlayHelp.dsmNeighbors.description' },
    'dsm-cyclic': { titleKey: 'c4.overlayHelp.dsmCyclic', descKey: 'c4.overlayHelp.dsmCyclic.description' },
    'edit-complexity-most': { titleKey: 'c4.overlayHelp.editComplexity', descKey: 'c4.overlayHelp.editComplexity.description' },
    'edit-complexity-highest': { titleKey: 'c4.overlayHelp.editComplexity', descKey: 'c4.overlayHelp.editComplexity.description' },
    'importance': { titleKey: 'c4.overlayHelp.importance', descKey: 'c4.overlayHelp.importance.description' },
    'centrality': { titleKey: 'c4.overlayHelp.centrality', descKey: 'c4.overlayHelp.centrality.description' },
    'defect-risk': { titleKey: 'c4.overlayHelp.defectRisk', descKey: 'c4.overlayHelp.defectRisk.description' },
    'hotspot-frequency': { titleKey: 'c4.overlayHelp.hotspot', descKey: 'c4.overlayHelp.hotspot.description' },
    'hotspot-risk': { titleKey: 'c4.overlayHelp.hotspot', descKey: 'c4.overlayHelp.hotspot.description' },
    'dead-code-score': { titleKey: 'c4.overlayHelp.deadCode', descKey: 'c4.overlayHelp.deadCode.description' },
    'size-loc': { titleKey: 'c4.overlayHelp.size', descKey: 'c4.overlayHelp.size.description' },
    'size-files': { titleKey: 'c4.overlayHelp.size', descKey: 'c4.overlayHelp.size.description' },
    'size-functions': { titleKey: 'c4.overlayHelp.size', descKey: 'c4.overlayHelp.size.description' },
    'architecture-ui': { titleKey: 'c4.overlayHelp.architectureUi', descKey: 'c4.overlayHelp.architectureUi.description' },
    'architecture-layer': { titleKey: 'c4.overlayHelp.architectureLayer', descKey: 'c4.overlayHelp.architectureLayer.description' },
    'function-roles': { titleKey: 'c4.overlayHelp.functionRoles', descKey: 'c4.overlayHelp.functionRoles.description' },
  };
  const help = helpMap[overlay];
  if (!help) return null;

  const title = t(help.titleKey);
  const description = t(help.descKey);

  const header = document.createElement('div');
  header.style.cssText =
    'display:flex;align-items:center;justify-content:space-between;gap:4px;min-height:16px;';

  const titleEl = document.createElement('span');
  titleEl.style.cssText = 'font-size:0.65rem;font-weight:700;opacity:0.85;line-height:1;';
  titleEl.textContent = title;
  header.appendChild(titleEl);

  // Simple help icon with title tooltip (no Floating UI needed for static legend)
  const helpBtn = document.createElement('span');
  helpBtn.setAttribute('role', 'img');
  helpBtn.setAttribute('aria-label', title);
  helpBtn.title = description;
  helpBtn.style.cssText =
    `opacity:0.7;cursor:help;flex-shrink:0;font-size:12px;color:${textColor};`;
  helpBtn.textContent = '?';
  header.appendChild(helpBtn);

  return header;
}

export function mountOverlayLegend(
  container: HTMLElement,
  initial: OverlayLegendVanillaProps,
): VanillaViewHandle<OverlayLegendVanillaProps> {
  let props = initial;

  const root = document.createElement('div');
  root.style.cssText = 'display:flex;flex-direction:column;gap:3px;';

  function applyPositionStyle(): void {
    const baseStyle =
      `background:${props.bg};color:${props.textColor};` +
      'border-radius:4px;padding:6px 8px;';
    if (props.inline) {
      root.style.cssText = 'display:flex;flex-direction:column;gap:3px;' + baseStyle;
    } else {
      root.style.cssText =
        'display:flex;flex-direction:column;gap:3px;' + baseStyle +
        'position:absolute;bottom:12px;right:12px;' +
        'max-height:calc(100% - 180px);overflow-y:auto;overflow-x:hidden;' +
        'pointer-events:auto;z-index:10;backdrop-filter:blur(4px);' +
        'min-width:80px;max-width:220px;';
    }
  }

  function render(): void {
    root.replaceChildren();
    const hasCommunity = !!(props.communityLegend && props.communityLegend.length > 0);
    const hasMetric = props.overlay !== 'none';
    if (!hasCommunity && !hasMetric) {
      root.style.display = 'none';
      return;
    }
    root.style.display = 'flex';
    applyPositionStyle();

    if (hasCommunity && props.communityLegend) {
      if (props.communityTitle) {
        const titleEl = document.createElement('span');
        titleEl.style.cssText = 'font-size:0.65rem;font-weight:700;opacity:0.85;';
        titleEl.textContent = props.communityTitle;
        root.appendChild(titleEl);
      }
      for (const item of props.communityLegend) {
        const label = item.summary ? `${item.name} — ${item.summary}` : item.name;
        root.appendChild(makeSwatch(item.color, label));
      }
    }

    if (hasCommunity && hasMetric) {
      const divider = document.createElement('div');
      divider.style.cssText = `height:1px;background:${props.dividerColor};margin:2px 0;`;
      root.appendChild(divider);
    }

    if (hasMetric) {
      const header = buildHelpHeader(props.overlay, props.textColor, props.t);
      if (header) root.appendChild(header);
      const metricItems = buildMetricItems(props.overlay, props.dsmMax, props.sizeMax, props.textColor, props.t, props.isDark);
      if (metricItems) root.appendChild(metricItems);
    }
  }

  render();
  container.appendChild(root);

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

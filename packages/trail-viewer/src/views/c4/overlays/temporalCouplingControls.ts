/**
 * TemporalCouplingControls + TemporalCouplingSettingsPopup — vanilla DOM views.
 * Thin ports of c4/components/overlays/TemporalCouplingControls.tsx.
 */
import {
  createSwitch,
  createSelect,
  createSlider,
  createRadio,
  createFormControlLabel,
  createRadioGroup,
} from '@anytime-markdown/ui-core';
import type { VanillaViewHandle } from '../../../shared/vanillaIsland';
import type {
  TemporalCouplingControlsValue,
  TemporalCouplingGranularity,
  GhostEdgeMode,
} from '../../../c4/components/overlays/TemporalCouplingControls';
import {
  applyGhostEdgeMode,
  computeGranularityChangeValue,
  getGhostEdgeMode,
  getTemporalCouplingGranularities,
  shouldShowTemporalCouplingInlineSettings,
} from '../../../c4/components/overlays/TemporalCouplingControls';

export type { TemporalCouplingControlsValue, TemporalCouplingGranularity, GhostEdgeMode };

export interface TemporalCouplingControlsVanillaProps {
  readonly value: TemporalCouplingControlsValue;
  readonly onChange: (next: TemporalCouplingControlsValue) => void;
  readonly resultCount: number;
  readonly loading: boolean;
  readonly showDirectionalControls?: boolean;
  readonly showSubagentGranularity?: boolean;
  readonly showCombinedGhostEdgeSelector?: boolean;
}

export interface TemporalCouplingSettingsPopupVanillaProps {
  readonly value: TemporalCouplingControlsValue;
  readonly onChange: (next: TemporalCouplingControlsValue) => void;
  readonly resultCount: number;
  readonly loading: boolean;
  readonly isDark?: boolean;
}

const WINDOW_OPTIONS = [
  { label: '7d', days: 7 },
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
  { label: 'All', days: 365 },
] as const;

const TOP_K_OPTIONS = [10, 50, 100] as const;
const GHOST_EDGE_OPTIONS: ReadonlyArray<GhostEdgeMode> = ['none', 'commit', 'session'];

// ---- helper: caption text ---------------------------------------------------

function makeCaption(text: string): HTMLSpanElement {
  const el = document.createElement('span');
  el.style.cssText = 'font-size:0.75rem;white-space:nowrap;';
  el.textContent = text;
  return el;
}

function makeStatusText(): HTMLSpanElement {
  const el = document.createElement('span');
  el.setAttribute('aria-live', 'polite');
  el.style.cssText = 'font-size:0.75rem;color:var(--am-color-text-secondary);';
  return el;
}

function setStatusText(
  el: HTMLSpanElement,
  value: TemporalCouplingControlsValue,
  resultCount: number,
  loading: boolean,
): void {
  if (value.enabled) {
    el.textContent = loading
      ? '計算中...'
      : `${resultCount} edges (${value.granularity})`;
  } else {
    el.textContent = 'OFF';
  }
}

// ---- slider row helper -------------------------------------------------------

function makeSliderRow(
  label: string,
  sliderValue: number,
  disabled: boolean,
  onChange: (v: number) => void,
): {
  el: HTMLDivElement;
  captionEl: HTMLSpanElement;
  sliderHandle: ReturnType<typeof createSlider>;
  destroy: () => void;
} {
  const el = document.createElement('div');
  el.style.cssText = 'min-width:140px;display:flex;align-items:center;gap:8px;';

  const captionEl = document.createElement('span');
  captionEl.style.cssText = 'font-size:0.75rem;white-space:nowrap;';
  captionEl.textContent = label;

  const sliderHandle = createSlider({
    value: sliderValue,
    min: 0,
    max: 1,
    step: 0.05,
    size: 'small',
    ariaLabel: label,
    onChange,
    style: { flex: '1' },
  });
  sliderHandle.el.disabled = disabled;

  el.appendChild(captionEl);
  el.appendChild(sliderHandle.el);

  return {
    el,
    captionEl,
    sliderHandle,
    destroy: () => sliderHandle.destroy(),
  };
}

// =============================================================================
// TemporalCouplingControls
// =============================================================================

export function mountTemporalCouplingControls(
  container: HTMLElement,
  initial: TemporalCouplingControlsVanillaProps,
): VanillaViewHandle<TemporalCouplingControlsVanillaProps> {
  let props = initial;

  const root = document.createElement('div');
  root.setAttribute('role', 'group');
  root.setAttribute('aria-label', '時間的結合エッジの表示制御');
  root.style.cssText =
    'display:flex;gap:16px;align-items:center;flex-wrap:wrap;' +
    'padding:4px 8px;border-top:1px solid var(--am-color-divider);';

  // -- Ghost Edge Select (combined mode) --
  const ghostEdgeSelect = createSelect<string>({
    value: getGhostEdgeMode(props.value),
    options: GHOST_EDGE_OPTIONS.map((m) => ({ value: m, label: m === 'none' ? 'None' : m })),
    ariaLabel: 'Ghost Edges の切り替え',
    onChange: (v) => {
      props.onChange(applyGhostEdgeMode(props.value, v as GhostEdgeMode));
    },
  });
  ghostEdgeSelect.el.style.minWidth = '160px';

  // -- Switch (non-combined) --
  const sw = createSwitch({
    checked: props.value.enabled,
    ariaLabel: '時間的結合エッジを表示',
    onChange: (checked) => {
      props.onChange({ ...props.value, enabled: checked });
    },
  });
  const swLabel = document.createElement('span');
  swLabel.style.cssText = 'font-size:0.75rem;';
  swLabel.textContent = 'Ghost Edges';
  const swWrap = document.createElement('label');
  swWrap.style.cssText = 'display:flex;align-items:center;gap:4px;cursor:pointer;';
  swWrap.appendChild(sw.el);
  swWrap.appendChild(swLabel);

  // -- Granularity RadioGroup --
  const granularityLabel = document.createElement('span');
  granularityLabel.style.cssText = 'font-size:0.75rem;';
  granularityLabel.textContent = '粒度';

  const granularityOptions = getTemporalCouplingGranularities(
    props.showSubagentGranularity ?? true,
  );
  const granularityItems = granularityOptions.map((g) => {
    const radio = createRadio({ size: 'small', value: g });
    const labelText = g === 'subagentType' ? 'subagent' : g;
    return createFormControlLabel({ control: radio, label: labelText, value: g });
  });
  const granularityRadioGroup = createRadioGroup({
    value: props.value.granularity,
    row: true,
    onChange: (v) => {
      const gran = v as TemporalCouplingGranularity;
      if (gran === props.value.granularity) return;
      props.onChange(computeGranularityChangeValue(props.value, gran));
    },
    children: granularityItems,
  });
  const granularityWrap = document.createElement('div');
  granularityWrap.style.cssText =
    'display:flex;align-items:center;flex-direction:row;gap:8px;';
  granularityWrap.appendChild(granularityLabel);
  granularityWrap.appendChild(granularityRadioGroup.el);

  // -- Directional Switch --
  const dirSw = createSwitch({
    checked: props.value.directional,
    disabled: !props.value.enabled,
    ariaLabel: '方向性付きエッジを表示',
    onChange: (checked) => {
      props.onChange({ ...props.value, directional: checked });
    },
  });
  const dirSwLabel = document.createElement('span');
  dirSwLabel.style.cssText = 'font-size:0.75rem;';
  dirSwLabel.textContent = '方向性';
  const dirSwWrap = document.createElement('label');
  dirSwWrap.style.cssText = 'display:flex;align-items:center;gap:4px;cursor:pointer;';
  dirSwWrap.appendChild(dirSw.el);
  dirSwWrap.appendChild(dirSwLabel);

  // -- Window Select (inline) --
  const windowSelect = createSelect<string>({
    value: String(props.value.windowDays),
    options: WINDOW_OPTIONS.map((o) => ({ value: String(o.days), label: o.label })),
    ariaLabel: '集計期間',
    onChange: (v) => {
      props.onChange({ ...props.value, windowDays: Number.parseInt(v, 10) });
    },
  });
  windowSelect.el.style.minWidth = '88px';
  windowSelect.el.disabled = !props.value.enabled;

  // -- Threshold slider row --
  const thresholdRow = makeSliderRow(
    `閾値 ${props.value.threshold.toFixed(2)}`,
    props.value.threshold,
    !props.value.enabled,
    (v) => props.onChange({ ...props.value, threshold: v }),
  );

  // -- Confidence slider row --
  const confidenceRow = makeSliderRow(
    `Conf ${props.value.confidenceThreshold.toFixed(2)}`,
    props.value.confidenceThreshold,
    !props.value.enabled,
    (v) => props.onChange({ ...props.value, confidenceThreshold: v }),
  );

  // -- Diff slider row --
  const diffRow = makeSliderRow(
    `Diff ${props.value.directionalDiff.toFixed(2)}`,
    props.value.directionalDiff,
    !props.value.enabled,
    (v) => props.onChange({ ...props.value, directionalDiff: v }),
  );

  // -- Top-K Select --
  const topKSelect = createSelect<string>({
    value: String(props.value.topK),
    options: TOP_K_OPTIONS.map((k) => ({ value: String(k), label: String(k) })),
    ariaLabel: 'Top-K 件数',
    onChange: (v) => {
      props.onChange({ ...props.value, topK: Number.parseInt(v, 10) });
    },
  });
  topKSelect.el.style.minWidth = '80px';
  topKSelect.el.disabled = !props.value.enabled;

  // -- Status text --
  const statusText = makeStatusText();

  container.appendChild(root);

  function rebuild(): void {
    root.replaceChildren();

    const showCombined = props.showCombinedGhostEdgeSelector ?? false;
    const showInline = shouldShowTemporalCouplingInlineSettings(showCombined);
    const showDirectional = props.showDirectionalControls ?? true;

    if (showCombined) {
      root.appendChild(ghostEdgeSelect.el);
    } else {
      root.appendChild(swWrap);
      root.appendChild(granularityWrap);
      if (showDirectional) root.appendChild(dirSwWrap);
    }

    if (showInline) {
      root.appendChild(windowSelect.el);
      if (!props.value.directional) {
        root.appendChild(thresholdRow.el);
      } else if (showDirectional) {
        root.appendChild(confidenceRow.el);
        root.appendChild(diffRow.el);
      }
      root.appendChild(topKSelect.el);
    }

    root.appendChild(statusText);
    setStatusText(statusText, props.value, props.resultCount, props.loading);
  }

  function updateControls(): void {
    sw.update({ checked: props.value.enabled });
    granularityRadioGroup.update({ value: props.value.granularity });
    dirSw.update({ checked: props.value.directional, disabled: !props.value.enabled });

    ghostEdgeSelect.update({ value: getGhostEdgeMode(props.value) });
    windowSelect.update({ value: String(props.value.windowDays) });
    windowSelect.el.disabled = !props.value.enabled;

    thresholdRow.captionEl.textContent = `閾値 ${props.value.threshold.toFixed(2)}`;
    thresholdRow.sliderHandle.update({ value: props.value.threshold });
    thresholdRow.sliderHandle.el.disabled = !props.value.enabled;

    confidenceRow.captionEl.textContent = `Conf ${props.value.confidenceThreshold.toFixed(2)}`;
    confidenceRow.sliderHandle.update({ value: props.value.confidenceThreshold });
    confidenceRow.sliderHandle.el.disabled = !props.value.enabled;

    diffRow.captionEl.textContent = `Diff ${props.value.directionalDiff.toFixed(2)}`;
    diffRow.sliderHandle.update({ value: props.value.directionalDiff });
    diffRow.sliderHandle.el.disabled = !props.value.enabled;

    topKSelect.update({ value: String(props.value.topK) });
    topKSelect.el.disabled = !props.value.enabled;

    setStatusText(statusText, props.value, props.resultCount, props.loading);
  }

  rebuild();

  return {
    update(next) {
      const prevShowCombined = props.showCombinedGhostEdgeSelector;
      const prevDirectional = props.value.directional;
      const prevShowDirectional = props.showDirectionalControls;
      props = next;

      const structureChanged =
        prevShowCombined !== next.showCombinedGhostEdgeSelector ||
        prevDirectional !== next.value.directional ||
        prevShowDirectional !== next.showDirectionalControls;

      if (structureChanged) {
        rebuild();
      } else {
        updateControls();
      }
    },
    destroy() {
      sw.destroy();
      dirSw.destroy();
      ghostEdgeSelect.destroy();
      granularityRadioGroup.destroy();
      windowSelect.destroy();
      thresholdRow.destroy();
      confidenceRow.destroy();
      diffRow.destroy();
      topKSelect.destroy();
      root.remove();
    },
  };
}

// =============================================================================
// TemporalCouplingSettingsPopup
// =============================================================================

export function mountTemporalCouplingSettingsPopup(
  container: HTMLElement,
  initial: TemporalCouplingSettingsPopupVanillaProps,
): VanillaViewHandle<TemporalCouplingSettingsPopupVanillaProps> {
  let props = initial;

  const POPUP_GHOST_EDGE_MODES: ReadonlyArray<Exclude<GhostEdgeMode, 'none'>> = ['commit', 'session'];

  const root = document.createElement('div');
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-label', 'Ghost Edges 設定');

  function applyBg(): void {
    root.style.cssText =
      'position:absolute;top:8px;left:8px;width:220px;z-index:10;' +
      'border:1px solid var(--am-color-divider);border-radius:8px;' +
      `background:${(props.isDark ?? false) ? 'rgba(18,18,18,0.92)' : 'rgba(251,249,243,0.94)'};` +
      'box-shadow:0 8px 24px rgba(0,0,0,0.28);' +
      'backdrop-filter:blur(10px);padding:10px 12px;';
  }
  applyBg();

  const caption = document.createElement('span');
  caption.style.cssText =
    'display:block;color:var(--am-color-text-secondary);font-size:0.65rem;margin-bottom:8px;';
  caption.textContent = 'Ghost Edges';
  root.appendChild(caption);

  // Mode select
  const modeSelect = createSelect<string>({
    value: getGhostEdgeMode(props.value),
    options: POPUP_GHOST_EDGE_MODES.map((m) => ({ value: m, label: m })),
    ariaLabel: 'Ghost Edges の粒度',
    fullWidth: true,
    onChange: (v) => {
      props.onChange(applyGhostEdgeMode(props.value, v as GhostEdgeMode));
    },
  });
  modeSelect.el.style.marginBottom = '10px';
  root.appendChild(modeSelect.el);

  // Window select
  const windowSelect = createSelect<string>({
    value: String(props.value.windowDays),
    options: WINDOW_OPTIONS.map((o) => ({ value: String(o.days), label: o.label })),
    ariaLabel: '集計期間',
    fullWidth: true,
    onChange: (v) => {
      props.onChange({ ...props.value, windowDays: Number.parseInt(v, 10) });
    },
  });
  windowSelect.el.style.marginBottom = '10px';
  root.appendChild(windowSelect.el);

  // Threshold slider
  const thresholdCaption = makeCaption(`閾値 ${props.value.threshold.toFixed(2)}`);
  thresholdCaption.style.cssText = 'display:block;font-size:0.75rem;margin-bottom:4px;';
  root.appendChild(thresholdCaption);

  const thresholdSlider = createSlider({
    value: props.value.threshold,
    min: 0,
    max: 1,
    step: 0.05,
    size: 'small',
    ariaLabel: 'Jaccard 閾値',
    onChange: (v) => {
      thresholdCaption.textContent = `閾値 ${v.toFixed(2)}`;
      props.onChange({ ...props.value, threshold: v });
    },
  });
  thresholdSlider.el.style.cssText = 'width:100%;margin-bottom:10px;';
  root.appendChild(thresholdSlider.el);

  // Top-K select
  const topKSelect = createSelect<string>({
    value: String(props.value.topK),
    options: TOP_K_OPTIONS.map((k) => ({ value: String(k), label: String(k) })),
    ariaLabel: 'Top-K 件数',
    fullWidth: true,
    onChange: (v) => {
      props.onChange({ ...props.value, topK: Number.parseInt(v, 10) });
    },
  });
  topKSelect.el.style.marginBottom = '8px';
  root.appendChild(topKSelect.el);

  const statusText = makeStatusText();
  root.appendChild(statusText);

  function applyVisible(): void {
    root.style.display = props.value.enabled ? '' : 'none';
  }

  setStatusText(statusText, props.value, props.resultCount, props.loading);
  applyVisible();
  container.appendChild(root);

  return {
    update(next) {
      const prevIsDark = props.isDark;
      props = next;

      if (prevIsDark !== next.isDark) applyBg();
      applyVisible();

      modeSelect.update({ value: getGhostEdgeMode(next.value) });
      windowSelect.update({ value: String(next.value.windowDays) });
      thresholdCaption.textContent = `閾値 ${next.value.threshold.toFixed(2)}`;
      thresholdSlider.update({ value: next.value.threshold });
      topKSelect.update({ value: String(next.value.topK) });
      setStatusText(statusText, next.value, next.resultCount, next.loading);
    },
    destroy() {
      modeSelect.destroy();
      windowSelect.destroy();
      thresholdSlider.destroy();
      topKSelect.destroy();
      root.remove();
    },
  };
}

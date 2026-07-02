/**
 * HotspotControls — vanilla DOM view.
 * Thin port of c4/components/overlays/HotspotControls.tsx.
 */
import {
  createSelect,
  createRadio,
  createFormControlLabel,
  createRadioGroup,
} from '@anytime-markdown/ui-core';
import type { VanillaViewHandle } from '../../../shared/vanillaIsland';
import type { HotspotControlsValue } from '../../../c4/components/overlays/HotspotControls';
import type { HotspotGranularity, TrendPeriod } from '@anytime-markdown/trail-core/c4';

export type { HotspotControlsValue };

export interface HotspotControlsVanillaProps {
  readonly value: HotspotControlsValue;
  readonly onChange: (next: HotspotControlsValue) => void;
  readonly loading?: boolean;
  readonly disabled?: boolean;
  readonly isDark?: boolean;
  readonly enabled?: boolean;
  readonly labelPeriod: string;
  readonly labelGranularity: string;
  readonly labelGranularityCommit: string;
  readonly labelGranularitySession: string;
  /**
   * 'floating'（既定）= キャンバス左上に絶対配置するパネル。
   * 'inline' = 親 flex 列のフロー内に積む（左コントロールパネルへ組み込む用途）。
   * leftPanel に絶対配置で重ねると C4 コントロールと衝突するため inline を使う。
   */
  readonly variant?: 'floating' | 'inline';
}

const PERIOD_OPTIONS: ReadonlyArray<TrendPeriod> = ['7d', '30d', '90d', 'all'];
const GRANULARITY_OPTIONS: ReadonlyArray<HotspotGranularity> = ['commit', 'session'];

function buildBg(isDark: boolean): string {
  return isDark ? 'rgba(18,18,18,0.92)' : 'rgba(251,249,243,0.94)';
}

export function mountHotspotControls(
  container: HTMLElement,
  initial: HotspotControlsVanillaProps,
): VanillaViewHandle<HotspotControlsVanillaProps> {
  let props = initial;

  // The card is conditionally rendered when enabled !== false
  const root = document.createElement('div');
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-label', 'Hotspot overlay controls');
  applyRootStyle();

  // Caption
  const caption = document.createElement('span');
  caption.style.cssText =
    'display:block;color:var(--am-color-text-secondary);font-size:0.65rem;margin-bottom:8px;';
  caption.textContent = 'Hotspot';
  root.appendChild(caption);

  // Period select
  const periodLabel = document.createElement('div');
  periodLabel.style.cssText = 'font-size:0.7rem;color:var(--am-color-text-secondary);margin-bottom:4px;';
  periodLabel.textContent = props.labelPeriod;
  root.appendChild(periodLabel);

  const periodSelect = createSelect<string>({
    value: props.value.period,
    options: PERIOD_OPTIONS.map((p) => ({ value: p, label: p })),
    ariaLabel: props.labelPeriod,
    onChange: (v) => {
      props.onChange({ ...props.value, period: v as TrendPeriod });
    },
    fullWidth: true,
  });
  periodSelect.el.disabled = !!(props.disabled);
  periodSelect.el.style.marginBottom = '10px';
  root.appendChild(periodSelect.el);

  // Granularity label
  const granularityLegend = document.createElement('div');
  granularityLegend.style.cssText =
    'font-size:0.65rem;color:var(--am-color-text-secondary);margin-bottom:4px;';
  granularityLegend.textContent = props.labelGranularity;
  root.appendChild(granularityLegend);

  // RadioGroup for granularity
  const granularityLabels: Record<HotspotGranularity, string> = {
    commit: props.labelGranularityCommit,
    session: props.labelGranularitySession,
  };

  const radioItems = GRANULARITY_OPTIONS.map((g) => {
    const radio = createRadio({ size: 'small', value: g });
    return createFormControlLabel({
      control: radio,
      label: granularityLabels[g],
      value: g,
    });
  });

  const radioGroup = createRadioGroup({
    value: props.value.granularity,
    ariaLabel: props.labelGranularity,
    onChange: (v) => {
      props.onChange({ ...props.value, granularity: v as HotspotGranularity });
    },
    children: radioItems,
  });
  radioGroup.el.style.marginBottom = '4px';
  root.appendChild(radioGroup.el);

  // Loading indicator
  const loadingEl = document.createElement('span');
  loadingEl.setAttribute('aria-live', 'polite');
  loadingEl.style.cssText =
    'display:block;font-size:0.75rem;color:var(--am-color-text-secondary);margin-top:4px;';
  loadingEl.textContent = '...';
  root.appendChild(loadingEl);

  function applyRootStyle(): void {
    const positionCss =
      (props.variant ?? 'floating') === 'inline'
        ? 'position:static;width:220px;'
        : 'position:absolute;top:8px;left:8px;width:220px;z-index:10;';
    root.style.cssText =
      positionCss +
      'border:1px solid var(--am-color-divider);border-radius:8px;' +
      `background:${buildBg(props.isDark ?? false)};` +
      'box-shadow:0 8px 24px rgba(0,0,0,0.28);' +
      'backdrop-filter:blur(10px);padding:10px 12px;';
  }

  function applyEnabled(): void {
    root.style.display = props.enabled === false ? 'none' : '';
  }

  function applyLoading(): void {
    loadingEl.style.display = props.loading ? 'block' : 'none';
  }

  applyEnabled();
  applyLoading();
  container.appendChild(root);

  return {
    update(next) {
      const prevEnabled = props.enabled;
      const prevIsDark = props.isDark;
      const prevVariant = props.variant;
      props = next;

      // applyRootStyle は cssText を作り直すため display を消す。直後に applyEnabled で復元する。
      const styleChanged = prevIsDark !== next.isDark || prevVariant !== next.variant;
      if (styleChanged) applyRootStyle();
      if (styleChanged || prevEnabled !== next.enabled) applyEnabled();
      periodLabel.textContent = next.labelPeriod;
      granularityLegend.textContent = next.labelGranularity;
      periodSelect.update({
        value: next.value.period,
        ariaLabel: next.labelPeriod,
      });
      periodSelect.el.disabled = !!(next.disabled);
      radioGroup.update({ value: next.value.granularity });
      applyLoading();
    },
    destroy() {
      periodSelect.destroy();
      radioGroup.destroy();
      root.remove();
    },
  };
}

/**
 * DefectRiskControls — vanilla DOM view.
 * Thin port of c4/components/overlays/DefectRiskControls.tsx.
 */
import {
  createSwitch,
  createSelect,
  createInputLabel,
} from '@anytime-markdown/ui-core';
import type { VanillaViewHandle } from '../../../shared/vanillaIsland';
import type { DefectRiskControlsValue } from '../../../c4/components/overlays/DefectRiskControls';

export type { DefectRiskControlsValue };

export interface DefectRiskControlsVanillaProps {
  readonly value: DefectRiskControlsValue;
  readonly onChange: (next: DefectRiskControlsValue) => void;
  readonly resultCount: number;
  readonly loading: boolean;
  readonly labelWindow: string;
  readonly labelHalfLife: string;
  readonly labelCalculating: string;
  readonly labelOff: string;
  readonly isDark?: boolean;
  /**
   * 'floating'（既定）= キャンバス下部に並ぶ横並びツールバー帯。
   * 'inline' = 左コントロールパネル列に積む縦カード（leftPanel 組み込み用途）。
   */
  readonly variant?: 'floating' | 'inline';
}

function buildBg(isDark: boolean): string {
  return isDark ? 'rgba(18,18,18,0.92)' : 'rgba(251,249,243,0.94)';
}

const WINDOW_OPTIONS = [
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
  { label: '180d', days: 180 },
  { label: 'All', days: 365 },
] as const;

const HALF_LIFE_OPTIONS = [
  { label: '10d', days: 10 },
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
  { label: '180d', days: 180 },
] as const;

export function mountDefectRiskControls(
  container: HTMLElement,
  initial: DefectRiskControlsVanillaProps,
): VanillaViewHandle<DefectRiskControlsVanillaProps> {
  let props = initial;

  // --- root ---
  const root = document.createElement('div');
  root.setAttribute('role', 'group');
  root.setAttribute('aria-label', '欠陥予測リスクの表示制御');

  function applyRootStyle(): void {
    if ((props.variant ?? 'floating') === 'inline') {
      // 左パネル列の縦カード。横バーだと 220px 列で折り返すため flex-direction:column。
      root.style.cssText =
        'display:flex;flex-direction:column;gap:8px;width:220px;' +
        'border:1px solid var(--am-color-divider);border-radius:8px;' +
        `background:${buildBg(props.isDark ?? false)};` +
        'box-shadow:0 8px 24px rgba(0,0,0,0.28);' +
        'backdrop-filter:blur(10px);padding:10px 12px;';
    } else {
      root.style.cssText =
        'display:flex;gap:16px;align-items:center;flex-wrap:wrap;' +
        'padding:4px 8px;border-top:1px solid var(--am-color-divider);';
    }
  }
  applyRootStyle();

  // --- Switch + label ---
  const switchWrap = document.createElement('label');
  switchWrap.style.cssText = 'display:flex;align-items:center;gap:4px;cursor:pointer;';

  const sw = createSwitch({
    checked: props.value.enabled,
    ariaLabel: 'リスクスコアを表示',
    onChange: (checked) => {
      props.onChange({ ...props.value, enabled: checked });
    },
  });

  const swLabel = document.createElement('span');
  swLabel.style.cssText = 'font-size:0.75rem;';
  swLabel.textContent = 'Defect Risk';

  switchWrap.appendChild(sw.el);
  switchWrap.appendChild(swLabel);
  root.appendChild(switchWrap);

  // --- Window Select ---
  const windowSelect = createSelect<string>({
    value: String(props.value.windowDays),
    options: WINDOW_OPTIONS.map((o) => ({ value: String(o.days), label: o.label })),
    ariaLabel: props.labelWindow,
    onChange: (v) => {
      props.onChange({ ...props.value, windowDays: Number.parseInt(v, 10) });
    },
  });
  windowSelect.el.style.cssText = 'min-width:88px;';
  if (!props.value.enabled) windowSelect.el.disabled = true;
  const windowWrap = document.createElement('div');
  windowWrap.style.cssText = 'display:flex;flex-direction:column;';
  windowWrap.appendChild(createInputLabel({ shrink: true, children: props.labelWindow }).el);
  windowWrap.appendChild(windowSelect.el);
  root.appendChild(windowWrap);

  // --- HalfLife Select ---
  const halfLifeSelect = createSelect<string>({
    value: String(props.value.halfLifeDays),
    options: HALF_LIFE_OPTIONS.map((o) => ({ value: String(o.days), label: o.label })),
    ariaLabel: props.labelHalfLife,
    onChange: (v) => {
      props.onChange({ ...props.value, halfLifeDays: Number.parseInt(v, 10) });
    },
  });
  halfLifeSelect.el.style.cssText = 'min-width:88px;';
  if (!props.value.enabled) halfLifeSelect.el.disabled = true;
  const halfLifeWrap = document.createElement('div');
  halfLifeWrap.style.cssText = 'display:flex;flex-direction:column;';
  halfLifeWrap.appendChild(createInputLabel({ shrink: true, children: props.labelHalfLife }).el);
  halfLifeWrap.appendChild(halfLifeSelect.el);
  root.appendChild(halfLifeWrap);

  // --- Status text ---
  const statusText = document.createElement('span');
  statusText.setAttribute('aria-live', 'polite');
  statusText.style.cssText = 'font-size:0.75rem;color:var(--am-color-text-secondary);';
  root.appendChild(statusText);

  container.appendChild(root);

  function renderStatus(): void {
    if (props.value.enabled) {
      statusText.textContent = props.loading
        ? props.labelCalculating
        : `${props.resultCount} files`;
    } else {
      statusText.textContent = props.labelOff;
    }
  }
  renderStatus();

  return {
    update(next) {
      const prev = props;
      props = next;

      if (prev.isDark !== next.isDark || prev.variant !== next.variant) applyRootStyle();

      sw.update({ checked: next.value.enabled });
      windowSelect.update({
        value: String(next.value.windowDays),
      });
      windowSelect.el.disabled = !next.value.enabled;
      halfLifeSelect.update({
        value: String(next.value.halfLifeDays),
      });
      halfLifeSelect.el.disabled = !next.value.enabled;

      if (
        prev.value.enabled !== next.value.enabled ||
        prev.resultCount !== next.resultCount ||
        prev.loading !== next.loading ||
        prev.labelCalculating !== next.labelCalculating ||
        prev.labelOff !== next.labelOff
      ) {
        renderStatus();
      }
    },
    destroy() {
      sw.destroy();
      windowSelect.destroy();
      halfLifeSelect.destroy();
      root.remove();
    },
  };
}

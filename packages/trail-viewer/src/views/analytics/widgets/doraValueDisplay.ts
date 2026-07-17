import type { VanillaViewHandle } from '../../../shared/vanillaIsland';

export interface DoraValueDisplayProps {
  metric: { value: number; unit: string };
}

export function formatDoraValue(m: { value: number; unit: string }): {
  primary: string;
  suffix?: string;
  unit?: string;
} {
  if (m.unit === 'perDay') {
    if (m.value >= 1) return { primary: m.value.toFixed(1), suffix: '/day' };
    if (m.value > 0) return { primary: (m.value * 7).toFixed(1), suffix: '/week' };
    return { primary: '0', suffix: '/day' };
  }
  if (m.unit === 'minPerLoc') {
    const num = m.value < 60 ? m.value.toFixed(2) : (m.value / 60).toFixed(1);
    return { primary: num, unit: m.value < 60 ? 'min/LOC' : 'h/LOC' };
  }
  if (m.unit === 'tokensPerLoc') {
    const num = m.value >= 1000 ? `${(m.value / 1000).toFixed(1)}k` : m.value.toFixed(0);
    return { primary: num, unit: 'tok/LOC' };
  }
  if (m.unit === 'hours') {
    if (m.value < 1) return { primary: (m.value * 60).toFixed(0), unit: 'min' };
    if (m.value < 48) return { primary: m.value.toFixed(1), unit: 'h' };
    return { primary: (m.value / 24).toFixed(1), unit: 'days' };
  }
  return { primary: m.value.toFixed(1), suffix: '%' };
}

export function mountDoraValueDisplay(
  container: HTMLElement,
  props: DoraValueDisplayProps,
): VanillaViewHandle<DoraValueDisplayProps> {
  const root = document.createElement('span');
  root.style.cssText = 'display:inline-flex;align-items:baseline;gap:4px;';

  function render(p: DoraValueDisplayProps): void {
    root.innerHTML = '';
    const { primary, suffix, unit } = formatDoraValue(p.metric);

    const valueSpan = document.createElement('span');
    valueSpan.style.cssText = 'font-size:1.5rem;font-weight:600;';
    valueSpan.textContent = primary;

    if (suffix) {
      const suffixEl = document.createElement('span');
      suffixEl.style.cssText = 'font-size:0.45em;font-weight:inherit;';
      suffixEl.textContent = suffix;
      valueSpan.appendChild(suffixEl);
    }

    root.appendChild(valueSpan);

    if (unit) {
      const unitSpan = document.createElement('span');
      unitSpan.style.cssText = 'font-size:0.75rem;color:var(--am-color-text-secondary);';
      unitSpan.textContent = unit;
      root.appendChild(unitSpan);
    }
  }

  render(props);
  container.appendChild(root);

  return {
    update(newProps: DoraValueDisplayProps) {
      render(newProps);
    },
    destroy() {
      root.remove();
    },
  };
}

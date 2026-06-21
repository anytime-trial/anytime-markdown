import type { VanillaViewHandle } from '../../../shared/vanillaIsland';

export interface VanillaMetricItem {
  readonly label: string;
  readonly value: string;
  readonly badge?: { readonly label: string; readonly color: string };
  readonly delta?: { readonly text: string; readonly color: string };
  readonly tooltip?: string;
}

export interface CyclingCardProps {
  groupName: string;
  items: readonly VanillaMetricItem[];
  index: number;
  onCycle: () => void;
  cardSx: { bgcolor: string; border: string; borderRadius: string };
}

function resolveColor(color: string): string {
  const map: Record<string, string> = {
    'success.main': 'var(--am-color-success-main)',
    'error.main': 'var(--am-color-error-main)',
    'text.secondary': 'var(--am-color-text-secondary)',
    'primary.main': 'var(--am-color-primary-main)',
    'text.disabled': 'var(--am-color-text-disabled)',
  };
  return map[color] ?? color;
}

function renderCard(root: HTMLElement, props: CyclingCardProps): void {
  root.innerHTML = '';
  const current = props.items[props.index] ?? props.items[0];
  if (!current) return;

  // Header row
  const header = document.createElement('div');
  header.style.cssText = 'display:flex;align-items:flex-start;margin-bottom:4px;gap:4px;';

  const textCol = document.createElement('div');
  textCol.style.cssText = 'text-align:left;';

  const groupNameEl = document.createElement('div');
  groupNameEl.style.cssText =
    'font-size:0.75rem;color:var(--am-color-text-secondary);line-height:1.3;display:block;';
  groupNameEl.textContent = props.groupName;
  textCol.appendChild(groupNameEl);

  const labelEl = document.createElement('div');
  labelEl.style.cssText = 'font-size:0.75rem;font-weight:600;line-height:1.3;display:block;';
  labelEl.textContent = current.label;
  textCol.appendChild(labelEl);

  header.appendChild(textCol);

  if (current.tooltip) {
    const tip = document.createElement('span');
    tip.title = current.tooltip;
    tip.textContent = '?';
    tip.style.cssText =
      'cursor:help;flex-shrink:0;color:var(--am-color-text-secondary);font-size:12px;margin-top:2px;';
    header.appendChild(tip);
  }

  root.appendChild(header);

  // Value area
  const valueArea = document.createElement('div');
  valueArea.style.cssText =
    'flex:1;display:flex;align-items:center;justify-content:center;';

  const inner = document.createElement('div');
  inner.style.cssText =
    'display:flex;align-items:baseline;justify-content:center;gap:8px;flex-wrap:wrap;';

  const valueEl = document.createElement('span');
  valueEl.className = 'card-value';
  valueEl.style.cssText = 'font-size:1.5rem;font-weight:600;';
  valueEl.textContent = current.value;
  inner.appendChild(valueEl);

  if (current.badge) {
    const badge = document.createElement('span');
    badge.style.cssText = `background-color:${current.badge.color};color:#fff;font-weight:700;font-size:10px;padding:2px 6px;border-radius:10px;display:inline-flex;align-items:center;`;
    badge.textContent = current.badge.label;
    inner.appendChild(badge);
  }

  valueArea.appendChild(inner);
  root.appendChild(valueArea);

  // Footer
  const footer = document.createElement('div');
  footer.style.cssText =
    'min-height:32px;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:4px;';

  if (current.delta) {
    const deltaEl = document.createElement('span');
    deltaEl.style.color = resolveColor(current.delta.color);
    deltaEl.style.fontSize = '0.75rem';
    deltaEl.textContent = current.delta.text;
    footer.appendChild(deltaEl);
  }

  // Dot indicators
  const dots = document.createElement('div');
  dots.style.cssText = 'display:flex;justify-content:center;gap:4px;';
  props.items.forEach((_, i) => {
    const dot = document.createElement('div');
    dot.style.cssText = `width:6px;height:6px;border-radius:50%;background-color:${
      i === props.index
        ? 'var(--am-color-primary-main)'
        : 'var(--am-color-text-disabled)'
    };`;
    dots.appendChild(dot);
  });
  footer.appendChild(dots);
  root.appendChild(footer);
}

export function mountCyclingCard(
  container: HTMLElement,
  props: CyclingCardProps,
): VanillaViewHandle<CyclingCardProps> {
  const root = document.createElement('div');
  root.style.cssText = [
    `background-color:${props.cardSx.bgcolor}`,
    `border:${props.cardSx.border}`,
    `border-radius:${props.cardSx.borderRadius}`,
    'cursor:pointer',
    'display:flex',
    'flex-direction:column',
    'overflow:hidden',
    'user-select:none',
    'padding:16px',
  ].join(';');

  let currentProps = props;

  const handleClick = () => {
    currentProps.onCycle();
  };
  root.addEventListener('click', handleClick);

  renderCard(root, props);
  container.appendChild(root);

  return {
    update(newProps: CyclingCardProps) {
      currentProps = newProps;
      root.style.backgroundColor = newProps.cardSx.bgcolor;
      root.style.border = newProps.cardSx.border;
      root.style.borderRadius = newProps.cardSx.borderRadius;
      renderCard(root, newProps);
    },
    destroy() {
      root.removeEventListener('click', handleClick);
      root.remove();
    },
  };
}

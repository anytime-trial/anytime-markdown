import { injectGraphUiStyles } from '../ui/injectStyles';

export interface MenuItemOptions {
  readonly onClick?: () => void;
  readonly disabled?: boolean;
  readonly children: Node | string | ReadonlyArray<Node | string>;
  readonly className?: string;
}

/**
 * MUI MenuItem の vanilla 置換（`<li role="menuitem">`）。
 * createMenu() の children として渡すことを想定。
 */
export function createMenuItem(opts: MenuItemOptions): HTMLLIElement {
  injectGraphUiStyles();

  const { onClick, disabled = false, children, className } = opts;

  const el = document.createElement('li');
  el.setAttribute('role', 'menuitem');

  const classes = ['gv-menu-item', disabled ? 'gv-menu-item--disabled' : '', className ?? '']
    .filter(Boolean)
    .join(' ');
  el.className = classes;

  el.setAttribute('aria-disabled', String(disabled));
  el.tabIndex = disabled ? -1 : 0;

  const nodes = Array.isArray(children) ? children : [children];
  for (const child of nodes) {
    if (typeof child === 'string') {
      el.appendChild(document.createTextNode(child));
    } else {
      el.appendChild(child);
    }
  }

  if (!disabled && onClick) {
    el.addEventListener('click', onClick);
  }

  el.addEventListener('keydown', (e: KeyboardEvent) => {
    if (disabled) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick?.();
    }
  });

  return el;
}

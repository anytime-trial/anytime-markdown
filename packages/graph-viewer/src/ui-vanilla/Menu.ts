import { injectGraphUiStyles } from '../ui/injectStyles';
import {
  anchorPoint,
  axisPercent,
  DEFAULT_ANCHOR_ORIGIN,
  DEFAULT_TRANSFORM_ORIGIN,
  type MenuOrigin,
  type MenuPosition,
} from '../ui/positioning';

export type { MenuOrigin, MenuPosition } from '../ui/positioning';

export interface MenuOptions {
  readonly onClose: () => void;
  readonly children: Node | string | ReadonlyArray<Node | string>;
  /** anchorEl 方式（要素基準で配置）。 */
  readonly anchorEl?: HTMLElement;
  /** anchorPosition 方式（絶対座標基準）。anchorReference が 'anchorPosition' の場合に使用。 */
  readonly anchorReference?: 'anchorEl' | 'anchorPosition';
  readonly anchorPosition?: MenuPosition;
  readonly anchorOrigin?: MenuOrigin;
  readonly transformOrigin?: MenuOrigin;
}

export interface MenuHandle {
  readonly el: HTMLDivElement;
  close(): void;
}

/**
 * MUI Menu の vanilla 置換。anchorEl 基準と anchorPosition 絶対座標基準（ContextMenu）の両対応。
 * 呼び出し時に document.body へ portal mount し、close() で閉じる。
 * Escape キーでも閉じる。
 */
export function createMenu(opts: MenuOptions): MenuHandle {
  injectGraphUiStyles();

  const {
    onClose,
    children,
    anchorEl,
    anchorReference = 'anchorEl',
    anchorPosition,
    anchorOrigin = DEFAULT_ANCHOR_ORIGIN,
    transformOrigin = DEFAULT_TRANSFORM_ORIGIN,
  } = opts;

  let point: MenuPosition | null = null;
  let xform = DEFAULT_TRANSFORM_ORIGIN;

  if (anchorReference === 'anchorPosition' && anchorPosition) {
    point = anchorPosition;
  } else if (anchorEl) {
    point = anchorPoint(anchorEl, anchorOrigin);
    xform = transformOrigin;
  }

  if (!point) {
    throw new Error('[createMenu] anchorEl または anchorPosition が必要です。');
  }

  // backdrop
  const backdrop = document.createElement('div');
  backdrop.className = 'gv-menu-backdrop';
  backdrop.addEventListener('mousedown', () => {
    onClose();
  });

  // paper
  const paper = document.createElement('div');
  paper.className = 'gv-menu-paper';
  paper.setAttribute('role', 'menu');
  paper.tabIndex = -1;
  paper.style.top = `${point.top}px`;
  paper.style.left = `${point.left}px`;
  paper.style.transform = `translate(${axisPercent(xform.horizontal)}, ${axisPercent(xform.vertical)})`;

  const handleKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
    }
  };
  paper.addEventListener('keydown', handleKeyDown);

  const nodes = Array.isArray(children) ? children : [children];
  for (const child of nodes) {
    if (typeof child === 'string') {
      paper.appendChild(document.createTextNode(child));
    } else {
      paper.appendChild(child);
    }
  }

  document.body.appendChild(backdrop);
  document.body.appendChild(paper);
  paper.focus();

  function close(): void {
    paper.removeEventListener('keydown', handleKeyDown);
    backdrop.remove();
    paper.remove();
  }

  return { el: paper, close };
}

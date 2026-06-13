import { injectGraphUiStyles } from '../ui/injectStyles';
import {
  anchorPoint,
  axisPercent,
  DEFAULT_ANCHOR_ORIGIN,
  DEFAULT_TRANSFORM_ORIGIN,
  type MenuOrigin,
} from '../ui/positioning';

export type { MenuOrigin } from '../ui/positioning';

export interface PopoverOptions {
  readonly anchorEl: HTMLElement;
  readonly onClose: () => void;
  readonly anchorOrigin?: MenuOrigin;
  readonly transformOrigin?: MenuOrigin;
  /** paper 要素へ適用する追加スタイル（MUI slotProps.paper.sx 相当）。 */
  readonly paperStyle?: Partial<CSSStyleDeclaration>;
  readonly children: Node | string | ReadonlyArray<Node | string>;
}

export interface PopoverHandle {
  readonly el: HTMLDivElement;
  close(): void;
}

/**
 * MUI Popover の vanilla 置換。anchorEl 基準で任意コンテンツを浮かせる。
 * 呼び出し時に document.body へ portal mount し、close() / destroy() で閉じる。
 */
export function createPopover(opts: PopoverOptions): PopoverHandle {
  injectGraphUiStyles();

  const {
    anchorEl,
    onClose,
    anchorOrigin = DEFAULT_ANCHOR_ORIGIN,
    transformOrigin = DEFAULT_TRANSFORM_ORIGIN,
    paperStyle,
    children,
  } = opts;

  const point = anchorPoint(anchorEl, anchorOrigin);

  // backdrop
  const backdrop = document.createElement('div');
  backdrop.className = 'gv-menu-backdrop';
  backdrop.addEventListener('mousedown', () => {
    onClose();
  });

  // paper
  const paper = document.createElement('div');
  paper.className = 'gv-menu-paper';
  paper.setAttribute('role', 'presentation');
  paper.style.top = `${point.top}px`;
  paper.style.left = `${point.left}px`;
  paper.style.transform = `translate(${axisPercent(transformOrigin.horizontal)}, ${axisPercent(transformOrigin.vertical)})`;

  if (paperStyle) {
    for (const [key, value] of Object.entries(paperStyle) as [string, string | undefined][]) {
      if (value !== undefined) {
        paper.style.setProperty(
          key.replaceAll(/([A-Z])/g, '-$1').toLowerCase(),
          value,
        );
      }
    }
  }

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

  function close(): void {
    backdrop.remove();
    paper.remove();
  }

  return { el: paper, close };
}

import type { CSSProperties, ReactNode } from 'react';
import { createPortal } from 'react-dom';

import type { MenuOrigin } from './Menu';
import { injectGraphUiStyles } from './injectStyles';

export interface PopoverProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly anchorEl: HTMLElement | null;
  readonly anchorOrigin?: MenuOrigin;
  readonly transformOrigin?: MenuOrigin;
  /** paper 要素へ適用する style（MUI slotProps.paper.sx 相当）。 */
  readonly paperStyle?: CSSProperties;
  readonly children: ReactNode;
}

const DEFAULT_ANCHOR_ORIGIN: MenuOrigin = { vertical: 'bottom', horizontal: 'left' };
const DEFAULT_TRANSFORM_ORIGIN: MenuOrigin = { vertical: 'top', horizontal: 'left' };

function axisPercent(value: 'top' | 'center' | 'bottom' | 'left' | 'right'): string {
  if (value === 'center') return '-50%';
  if (value === 'bottom' || value === 'right') return '-100%';
  return '0';
}

function anchorPoint(el: HTMLElement, origin: MenuOrigin): { top: number; left: number } {
  const r = el.getBoundingClientRect();
  const left =
    origin.horizontal === 'left' ? r.left : origin.horizontal === 'right' ? r.right : r.left + r.width / 2;
  const top =
    origin.vertical === 'top' ? r.top : origin.vertical === 'bottom' ? r.bottom : r.top + r.height / 2;
  return { top, left };
}

/**
 * MUI Popover の置換。anchorEl 基準で任意コンテンツを浮かせる（ToolBar の図形ピッカー）。
 * 配置は paper の transform（translate）で表現する。
 */
export function Popover({
  open,
  onClose,
  anchorEl,
  anchorOrigin = DEFAULT_ANCHOR_ORIGIN,
  transformOrigin = DEFAULT_TRANSFORM_ORIGIN,
  paperStyle,
  children,
}: Readonly<PopoverProps>) {
  injectGraphUiStyles();
  if (!open || !anchorEl || typeof document === 'undefined') return null;
  const point = anchorPoint(anchorEl, anchorOrigin);
  return createPortal(
    <>
      <div className="gv-menu-backdrop" onMouseDown={onClose} />
      <div
        className="gv-menu-paper"
        role="presentation"
        style={{
          top: point.top,
          left: point.left,
          transform: `translate(${axisPercent(transformOrigin.horizontal)}, ${axisPercent(transformOrigin.vertical)})`,
          ...paperStyle,
        }}
      >
        {children}
      </div>
    </>,
    document.body,
  );
}

import type { CSSProperties, ReactNode } from 'react';
import { createPortal } from 'react-dom';

import { injectGraphUiStyles } from './injectStyles';
import {
  anchorPoint,
  axisPercent,
  DEFAULT_ANCHOR_ORIGIN,
  DEFAULT_TRANSFORM_ORIGIN,
  type MenuOrigin,
} from './positioning';

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

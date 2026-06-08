import type { ReactNode } from 'react';
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

import { injectGraphUiStyles } from './injectStyles';
import {
  anchorPoint,
  axisPercent,
  DEFAULT_ANCHOR_ORIGIN,
  DEFAULT_TRANSFORM_ORIGIN,
  type MenuOrigin,
  type MenuPosition,
} from './positioning';

export type { MenuOrigin, MenuPosition } from './positioning';

export interface MenuProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly children: ReactNode;
  /** anchorEl 方式（要素基準で配置）。 */
  readonly anchorEl?: HTMLElement | null;
  /** anchorPosition 方式（絶対座標基準）。 */
  readonly anchorReference?: 'anchorEl' | 'anchorPosition';
  readonly anchorPosition?: MenuPosition;
  readonly anchorOrigin?: MenuOrigin;
  readonly transformOrigin?: MenuOrigin;
}

/**
 * MUI Menu の置換。anchorEl 基準と anchorPosition 絶対座標基準（ContextMenu）の両対応。
 * 配置は paper の transform（translate）で表現し、サイズ測定を不要にする。
 */
export function Menu({
  open,
  onClose,
  children,
  anchorEl,
  anchorReference = 'anchorEl',
  anchorPosition,
  anchorOrigin = DEFAULT_ANCHOR_ORIGIN,
  transformOrigin = DEFAULT_TRANSFORM_ORIGIN,
}: Readonly<MenuProps>) {
  injectGraphUiStyles();
  const paperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) paperRef.current?.focus();
  }, [open]);

  if (open && typeof document === 'undefined') return null;
  if (!open) return null;

  let point: MenuPosition | null = null;
  let xform = DEFAULT_TRANSFORM_ORIGIN;
  if (anchorReference === 'anchorPosition' && anchorPosition) {
    point = anchorPosition;
  } else if (anchorEl) {
    point = anchorPoint(anchorEl, anchorOrigin);
    xform = transformOrigin;
  }
  if (!point) return null;

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
    }
  };

  return createPortal(
    <>
      <div className="gv-menu-backdrop" onMouseDown={onClose} />
      <div
        ref={paperRef}
        className="gv-menu-paper"
        role="menu"
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        style={{
          top: point.top,
          left: point.left,
          transform: `translate(${axisPercent(xform.horizontal)}, ${axisPercent(xform.vertical)})`,
        }}
      >
        {children}
      </div>
    </>,
    document.body,
  );
}

import type { ReactNode } from 'react';
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

import { injectGraphUiStyles } from './injectStyles';

export interface MenuOrigin {
  readonly vertical: 'top' | 'center' | 'bottom';
  readonly horizontal: 'left' | 'center' | 'right';
}

export interface MenuPosition {
  readonly top: number;
  readonly left: number;
}

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

const DEFAULT_ANCHOR_ORIGIN: MenuOrigin = { vertical: 'bottom', horizontal: 'left' };
const DEFAULT_TRANSFORM_ORIGIN: MenuOrigin = { vertical: 'top', horizontal: 'left' };

function axisPercent(value: 'top' | 'center' | 'bottom' | 'left' | 'right'): string {
  if (value === 'center') return '-50%';
  if (value === 'bottom' || value === 'right') return '-100%';
  return '0';
}

function anchorPoint(el: HTMLElement, origin: MenuOrigin): MenuPosition {
  const r = el.getBoundingClientRect();
  const left =
    origin.horizontal === 'left' ? r.left : origin.horizontal === 'right' ? r.right : r.left + r.width / 2;
  const top =
    origin.vertical === 'top' ? r.top : origin.vertical === 'bottom' ? r.bottom : r.top + r.height / 2;
  return { top, left };
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

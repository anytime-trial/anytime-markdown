"use client";

import type { ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * 選択中ブロックの画面矩形に追従して、ツールバー等の編集 chrome を
 * `document.body` 直下に `position: fixed` で配置する portal。
 *
 * framework-decoupling Phase 2「反転」設計で、各ブロックの編集オーバーレイが
 * 共有する配置スキャフォールド。`rect` は {@link useSelectedBlock} が供給する。
 */
export function BlockChromeAnchor({
  rect,
  zIndex = 20,
  children,
}: Readonly<{ rect: DOMRect | null; zIndex?: number; children: ReactNode }>) {
  if (!rect) return null;
  return createPortal(
    <div style={{ position: "fixed", top: rect.top, left: rect.left, zIndex }}>
      {children}
    </div>,
    document.body,
  );
}

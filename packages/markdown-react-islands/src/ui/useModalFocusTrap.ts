"use client";

import { useCallback, useEffect, useRef } from "react";

/** モーダルオーバーレイ内のフォーカス可能要素セレクタ。Dialog / Drawer 共有。 */
export const FOCUSABLE =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * モーダルオーバーレイ共通のフォーカス管理。Dialog / Drawer で共有する。
 *
 * - open 時に直前のフォーカス要素を退避し、paper 内の最初の focusable（無ければ
 *   paper 自体）へフォーカスを移す。
 * - 背景スクロールを `document.body.style.overflow = "hidden"` でロックし、
 *   閉じたら元の overflow とフォーカスへ戻す。
 * - 背景（モーダルの body 直下祖先以外の body 直下要素）に `aria-hidden="true"` を付け、
 *   閉じたら戻す（MUI Modal 同挙動。支援技術から背景を隠す）。
 * - paper 要素へ直接 keydown リスナを張り、ESC で `onClose`、Tab で paper 内の最小
 *   フォーカストラップを行う（非対話要素へ JSX のキーハンドラを付けない＝Sonar S6847）。
 */
export function useModalFocusTrap(
  open: boolean,
  paperRef: React.RefObject<HTMLElement | null>,
  onClose: () => void,
): void {
  const restoreRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    restoreRef.current = document.activeElement as HTMLElement | null;
    const paper = paperRef.current;
    // フォーカス可能要素がなければ paper 自体（tabIndex=-1）へ退避する。
    const first = paper?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? paper)?.focus();
    // 背景スクロールをロックし、閉じたら元の overflow へ戻す。
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // 背景を a11y ツリーから隠す。paper の body 直下祖先（Portal ルート）を特定し、
    // それ以外の body 直下要素に aria-hidden を付ける。既に true のものは触らない。
    const portalRoot = paper?.closest("body > *") ?? null;
    const hidden: Element[] = [];
    if (portalRoot) {
      for (const el of document.body.children) {
        if (el !== portalRoot && el.getAttribute("aria-hidden") !== "true") {
          el.setAttribute("aria-hidden", "true");
          hidden.push(el);
        }
      }
    }
    return () => {
      document.body.style.overflow = prevOverflow;
      for (const el of hidden) el.removeAttribute("aria-hidden");
      restoreRef.current?.focus?.();
    };
  }, [open, paperRef]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const nodes = paperRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE);
      if (!nodes || nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    },
    [onClose, paperRef],
  );

  // JSX の onKeyDown ではなく paper 要素へ直接張る。role="dialog" は非対話ロールのため、
  // JSX へキーハンドラを置くと jsx-a11y の非対話要素ルール（Sonar S6847）に触れる。
  // 伝播経路（paper で発火 → stopPropagation で祖先へ届かない）は JSX 版と同じ。
  useEffect(() => {
    if (!open) return;
    const paper = paperRef.current;
    if (!paper) return;
    paper.addEventListener("keydown", handleKeyDown);
    return () => paper.removeEventListener("keydown", handleKeyDown);
  }, [open, paperRef, handleKeyDown]);
}

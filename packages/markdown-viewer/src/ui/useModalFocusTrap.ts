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
 * - 返り値の `onKeyDown` は ESC で `onClose`、Tab で paper 内の最小フォーカストラップ。
 */
export function useModalFocusTrap(
  open: boolean,
  paperRef: React.RefObject<HTMLElement | null>,
  onClose: () => void,
): (e: React.KeyboardEvent) => void {
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
    return () => {
      document.body.style.overflow = prevOverflow;
      restoreRef.current?.focus?.();
    };
  }, [open, paperRef]);

  return useCallback(
    (e: React.KeyboardEvent) => {
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
}

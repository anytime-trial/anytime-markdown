import { useEffect, useState } from "react";

export interface TransitionMountState {
  /** DOM に存在させるか。unmountOnExit のとき、閉じて timeout 経過後に false。 */
  mounted: boolean;
  /** 表示遷移（フェード/スライド/展開）を有効化するか。open 後の次フレームで true。 */
  visible: boolean;
}

/**
 * open に応じたマウント + 遷移状態を管理する共通フック。
 * - open 時: mounted=true → 次フレームで visible=true（mount と同一フレームでの遷移開始＝
 *   アニメーション抜けを回避）。
 * - close 時: visible=false → unmountOnExit のとき timeout 経過後に mounted=false。
 *
 * Backdrop / Snackbar（unmountOnExit=true 既定）と Collapse（unmountOnExit を prop で受ける）で共有。
 */
export function useTransitionMount(
  open: boolean,
  timeout: number,
  unmountOnExit = true,
): TransitionMountState {
  const [mounted, setMounted] = useState(open);
  const [visible, setVisible] = useState(open);

  useEffect(() => {
    if (open) {
      setMounted(true);
      const id = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(id);
    }
    setVisible(false);
    if (unmountOnExit) {
      const id = setTimeout(() => setMounted(false), timeout);
      return () => clearTimeout(id);
    }
    return undefined;
  }, [open, timeout, unmountOnExit]);

  return { mounted, visible };
}

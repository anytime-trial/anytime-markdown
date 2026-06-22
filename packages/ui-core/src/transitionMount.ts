/**
 * 脱React の vanilla DOM transitionMount（ui/useTransitionMount.ts 置換）。
 *
 * React hook（useState/useEffect）を使わず、open に応じた mounted / visible ライフサイクルを
 * callback で通知する素関数として実装する。React state には依存しない。
 *
 * - open=true: mounted=true → 次フレーム（requestAnimationFrame）で visible=true
 *   （mount と同一フレームでの遷移開始＝アニメーション抜けを回避）。
 * - open=false: visible=false → unmountOnExit のとき timeout 経過後に mounted=false。
 *
 * 消費側は `onMountedChange` / `onVisibleChange` で DOM の append/remove・class 切り替えを行う。
 * 返り値の `dispose()` で進行中の rAF / setTimeout を確実に解除する（タイマー cleanup）。
 *
 * Backdrop / Snackbar（unmountOnExit=true 既定）と Collapse（unmountOnExit を opt で受ける）で共有。
 */

/** {@link createTransitionMount} の状態スナップショット。React `TransitionMountState` と同義。 */
export interface TransitionMountState {
  /** DOM に存在させるか。unmountOnExit のとき、閉じて timeout 経過後に false。 */
  mounted: boolean;
  /** 表示遷移（フェード/スライド/展開）を有効化するか。open 後の次フレームで true。 */
  visible: boolean;
}

/** {@link createTransitionMount} のオプション。 */
export interface CreateTransitionMountOptions {
  /** 初期 open 状態。mounted / visible の初期値に使う（React useState(open) 相当）。既定 false。 */
  open?: boolean;
  /** 遷移時間(ms)。close 時の unmount 遅延に使う。 */
  timeout: number;
  /** close 時に mounted=false へ落とすか（DOM から外すか）。既定 true。 */
  unmountOnExit?: boolean;
  /** mounted が変化したときに呼ばれる（DOM の append/remove 用）。 */
  onMountedChange?: (mounted: boolean) => void;
  /** visible が変化したときに呼ばれる（class / opacity 切り替え用）。 */
  onVisibleChange?: (visible: boolean) => void;
}

/**
 * open に応じたマウント + 遷移状態を callback ベースで管理する素関数（脱React）。
 *
 * `setOpen(open)` を呼ぶと React useEffect 相当のロジックが走る:
 * - open=true: mounted=true（onMountedChange）→ rAF で visible=true（onVisibleChange）。
 * - open=false: visible=false → unmountOnExit なら timeout 後 mounted=false。
 *
 * 初期 `open` は副作用なしで状態に反映するだけ（最初の `setOpen` から遷移が走る）。
 * 状態が実際に変化したときのみ callback を発火する（冪等）。
 *
 * @returns 現在状態の参照（`getState`）・`setOpen`・`dispose`（進行中タイマー解除）。
 */
export function createTransitionMount(opts: CreateTransitionMountOptions): {
  getState: () => TransitionMountState;
  setOpen: (open: boolean) => void;
  dispose: () => void;
} {
  const { timeout } = opts;
  const unmountOnExit = opts.unmountOnExit ?? true;
  const initialOpen = opts.open ?? false;

  let mounted = initialOpen;
  let visible = initialOpen;

  // 進行中の rAF / setTimeout id（次の setOpen / dispose で必ず解除する）。
  let rafId: number | null = null;
  let timerId: ReturnType<typeof setTimeout> | null = null;

  const cancelPending = (): void => {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    if (timerId !== null) {
      clearTimeout(timerId);
      timerId = null;
    }
  };

  const setMounted = (next: boolean): void => {
    if (mounted === next) return;
    mounted = next;
    opts.onMountedChange?.(next);
  };

  const setVisible = (next: boolean): void => {
    if (visible === next) return;
    visible = next;
    opts.onVisibleChange?.(next);
  };

  const setOpen = (open: boolean): void => {
    // 直前の遷移（rAF / unmount タイマー）を破棄してから新しい遷移を開始する。
    cancelPending();
    if (open) {
      setMounted(true);
      rafId = requestAnimationFrame(() => {
        rafId = null;
        setVisible(true);
      });
      return;
    }
    setVisible(false);
    if (unmountOnExit) {
      timerId = setTimeout(() => {
        timerId = null;
        setMounted(false);
      }, timeout);
    }
  };

  return {
    getState: () => ({ mounted, visible }),
    setOpen,
    dispose() {
      cancelPending();
    },
  };
}

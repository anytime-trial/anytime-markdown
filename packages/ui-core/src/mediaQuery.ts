/**
 * 脱React の vanilla DOM mediaQuery ファクトリ（ui/useMediaQuery.ts 置換）。
 *
 * React hook（useMediaQuery）を素関数の subscribe/unsubscribe ラッパに置き換える。
 * `matchMedia` を直接ラップし、現在のマッチ状態（`matches`）の同期取得と change 購読を提供する。
 * 非ブラウザ環境（`window` / `matchMedia` 不在）では常に false を返し、購読は no-op になる。
 * React / chrome 層・useIsDark 等のテーマ API には依存しない（ファクトリ規約に揃える）。
 *
 * 既存 React 実装との対応:
 * - hook の戻り値 boolean → `matches`（同期 getter）+ `subscribe`（change 通知）
 * - useEffect の addEventListener/removeEventListener → `subscribe` が返す unsubscribe
 * - unmount 時の cleanup → `destroy()`（全 listener 解除）
 *
 * MUI の `theme.breakpoints.down("sm")` / `up("md")` 等は query 文字列に変換して渡す
 * （MUI 既定: sm=600 / md=900。down(key)=max-width:(value-0.05)px、up(key)=min-width:value px）。
 */

/** matchMedia change 購読のリスナ。最新のマッチ状態を受け取る。 */
export type MediaQueryListener = (matches: boolean) => void;

/** {@link createMediaQuery} のオプション。 */
export interface CreateMediaQueryOptions {
  /**
   * 生成直後に呼ぶ listener。current の matches を即座に受け取りたい場合に渡す
   * （React の初期 state + useEffect の onChange() 即時呼び出し相当）。
   */
  onChange?: MediaQueryListener;
}

/**
 * {@link createMediaQuery} のハンドル。`el` を持たない非 DOM ユーティリティ。
 */
export interface MediaQueryHandle {
  /** 現在のマッチ状態（同期取得）。非ブラウザ環境では常に false。 */
  readonly matches: boolean;
  /**
   * change を購読する。登録した listener を返り値の unsubscribe で個別解除できる。
   * 非ブラウザ環境では no-op（unsubscribe も no-op）を返す。
   */
  subscribe: (listener: MediaQueryListener) => () => void;
  /** すべての listener を解除する（unmount cleanup 相当）。 */
  destroy: () => void;
}

/** ブラウザ環境で matchMedia が使えるかを判定する（SSR / jsdom 不在ガード）。 */
function hasMatchMedia(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function";
}

/**
 * media query にマッチするかを購読する素関数ファクトリ（MUI useMediaQuery 置換）。
 *
 * - `matches` で現在のマッチ状態を同期取得する。
 * - `subscribe(listener)` で change を購読し、登録解除関数を受け取る。
 * - `destroy()` で内部の change listener を一括解除する。
 *
 * 内部では query につき 1 つの `MediaQueryList` を保持し、その change を 1 つの内部ハンドラで
 * 受けて登録済み listener へ多重配信する（addEventListener の重複登録を避ける）。
 *
 * @param query CSS media query 文字列（例 `"(max-width:599.95px)"`）。
 * @param opts  `onChange` を渡すと生成直後に current の matches を即座に通知する。
 */
export function createMediaQuery(
  query: string,
  opts: CreateMediaQueryOptions = {},
): MediaQueryHandle {
  const listeners = new Set<MediaQueryListener>();

  // 非ブラウザ環境: 常に false を返す no-op ハンドル。
  if (!hasMatchMedia()) {
    if (opts.onChange) opts.onChange(false);
    return {
      get matches() {
        return false;
      },
      subscribe() {
        return () => {
          /* no-op（非ブラウザ環境では購読対象がない） */
        };
      },
      destroy() {
        /* no-op（登録された listener はない） */
      },
    };
  }

  const mql = window.matchMedia(query);

  // MediaQueryList の change を 1 つの内部ハンドラで受け、登録済み listener へ多重配信する。
  const onMqlChange = (): void => {
    for (const listener of listeners) listener(mql.matches);
  };
  mql.addEventListener("change", onMqlChange);

  if (opts.onChange) opts.onChange(mql.matches);

  return {
    get matches() {
      return mql.matches;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    destroy() {
      mql.removeEventListener("change", onMqlChange);
      listeners.clear();
    },
  };
}

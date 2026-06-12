/**
 * 脱React の vanilla DOM ClickAway ファクトリ（MUI ClickAwayListener / ui/ClickAwayListener.tsx 置換）。
 *
 * 監視対象ノードの「外側」を click / touchend したとき onClickAway を呼ぶ。React 実装と同じく
 * リスナは生成（= パネルを開いたクリック後）に登録するため、開いたクリック自体は発火しない。
 * 素 DOM のため React hook（useRef / useEffect）には依存しない。`ui-vanilla/Button` / `Dialog`
 * の `createXxx(opts) => { ..., destroy }` ファクトリ規約に揃える。
 *
 * 見た目を持たない振る舞いユーティリティのため、要素生成・CSS 変数は扱わない。
 */

/** {@link createClickAway} のオプション。React `ClickAwayListenerProps` 相当。 */
export interface CreateClickAwayOptions {
  /**
   * 外側判定の基準ノード。このノード（とその子孫）の外側を click / touchend したときに
   * onClickAway を呼ぶ。
   */
  node: Node;
  /** 外側クリック / タッチ時のコールバック。発火させたイベントを引数で受け取る。 */
  onClickAway: (event: MouseEvent | TouchEvent) => void;
  /**
   * リスナを登録する対象（既定 `document`）。Shadow DOM / iframe document を渡す場合に上書きする。
   */
  ownerDocument?: Document;
}

/**
 * vanilla ClickAway を生成し、即座にリスナを登録する。
 *
 * - `document`（or `ownerDocument`）に click（capture）/ touchend（passive）を登録する。
 * - イベントの target が基準 node に含まれない場合のみ onClickAway を呼ぶ。
 * - capture phase で listen するため、内部要素が `stopPropagation` しても外側判定は機能する。
 *
 * @returns `destroy`（登録した listener を解除する。冪等）。
 */
export function createClickAway(opts: CreateClickAwayOptions): {
  destroy: () => void;
} {
  const { node, onClickAway } = opts;
  const ownerDocument = opts.ownerDocument ?? document;

  const handler = (event: MouseEvent | TouchEvent): void => {
    const target = event.target;
    // node の外側（contains が false）のときのみ発火。target が Node でない場合も外側扱い。
    if (target instanceof Node && node.contains(target)) return;
    onClickAway(event);
  };

  // React 実装と同じく click / touchend を監視。capture phase で内部の stopPropagation に耐える。
  ownerDocument.addEventListener("click", handler as EventListener, true);
  ownerDocument.addEventListener("touchend", handler as EventListener, {
    capture: true,
    passive: true,
  });

  let destroyed = false;
  return {
    destroy() {
      if (destroyed) return;
      destroyed = true;
      ownerDocument.removeEventListener("click", handler as EventListener, true);
      ownerDocument.removeEventListener(
        "touchend",
        handler as EventListener,
        true,
      );
    },
  };
}

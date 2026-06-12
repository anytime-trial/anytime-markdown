import type { Editor } from "@anytime-markdown/markdown-core";
import type { Node as PMNode } from "@anytime-markdown/markdown-pm/model";

/**
 * framework-decoupling Phase 3（ホスト隔離ゴール）の chrome エンジン。
 *
 * 反転アーキテクチャで content は既に native（React 非依存）。残る chrome（block
 * overlay の選択追従・配置・インラインツールバー）を **React なし**
 * （`editor.on('transaction')` 購読 + 素 DOM portal）で提供する。これにより
 * React は host（page shell + dialogs / ui kit）へ隔離でき、editor + chrome は
 * React-free になる。
 *
 * 元 PoC（`poc/vanillaBlockChrome.ts`）を正式昇格したもの。PoC が積み残していた
 * rect の scroll / resize 再計測を {@link useSelectedBlock} 相当に補完した。
 *
 * editor 自体も `new Editor()`（`@anytime-markdown/markdown-core` の core Editor）で
 * React 外から生成できる（test 参照）。React は差し替え可能な host の一例に降格する。
 */

export interface SelectedBlockSnapshot {
  /** 選択中ブロックの doc 位置。未選択は -1。 */
  pos: number;
  /** 選択中ブロックのノード。未選択は null。 */
  node: PMNode | null;
  /** chrome 配置用の画面矩形。未選択 / 未計測は null。 */
  rect: DOMRect | null;
}

/**
 * 指定 nodeType の「選択中ブロック」の doc 位置を求める（React 版 useSelectedBlock と同一ロジック）。
 * NodeSelection（atom）と、セル/テキスト内 TextSelection を内包するコンテナブロックの両対応。
 */
export function selectedBlockPos(editor: Editor, nodeTypeName: string): number {
  const sel = editor.state.selection;
  // atom ブロック（gif / image 等）: NodeSelection が対象型ならその from。
  // `.node` は NodeSelection 固有のため軽くキャストで参照する。
  const nodeSel = sel as typeof sel & { node?: { type: { name: string } } };
  if (nodeSel.node?.type?.name === nodeTypeName) return sel.from;
  // コンテナ/テキスト内の TextSelection: 対象型の祖先ノードの before pos。
  const { $from } = sel;
  if (!$from) return -1;
  for (let d = $from.depth; d > 0; d--) {
    if ($from.node(d).type.name === nodeTypeName) return $from.before(d);
  }
  return -1;
}

function measureRect(editor: Editor, pos: number): DOMRect | null {
  if (pos < 0) return null;
  try {
    const dom = editor.view.nodeDOM(pos) as HTMLElement | null;
    return dom?.getBoundingClientRect?.() ?? null;
  } catch {
    // getPos/nodeDOM は detached ノードで throw し得る（vendored tiptap の既知挙動）。
    return null;
  }
}

/** rect の値同値判定（参照ではなく top/left/width/height で比較）。 */
function sameRect(a: DOMRect | null, b: DOMRect | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.top === b.top &&
    a.left === b.left &&
    a.width === b.width &&
    a.height === b.height
  );
}

/**
 * 選択中ブロックを追跡し、変化時に snapshot を通知する（vanilla useSelectedBlock）。
 *
 * - `editor.on('transaction')` で pos 変化を検出する。
 * - pos が選択中（>= 0）の間は `scroll`（capture）/ `resize` を購読し、rect 変化も
 *   再通知する（React 版 useSelectedBlock の measure useEffect 相当）。
 * - pos / rect いずれも同値なら通知しない（無駄な再配置を抑制）。
 *
 * 戻り値は購読解除関数。
 */
export function createSelectedBlockTracker(
  editor: Editor,
  nodeTypeName: string,
  onChange: (snap: SelectedBlockSnapshot) => void,
): () => void {
  let lastPos = -2; // -1 は「未選択」として valid な emit 値なので初期 sentinel は -2。
  let lastRect: DOMRect | null = null;
  let scrollResizeBound = false;

  const fire = (pos: number, rect: DOMRect | null): void => {
    lastPos = pos;
    lastRect = rect;
    const node = pos >= 0 ? editor.state.doc.nodeAt(pos) : null;
    onChange({ pos, node, rect });
  };

  // scroll / resize: pos は不変、rect のみ再計測する。
  const onScrollResize = (): void => {
    if (lastPos < 0) return;
    const rect = measureRect(editor, lastPos);
    if (sameRect(rect, lastRect)) return;
    fire(lastPos, rect);
  };

  const bindScrollResize = (on: boolean): void => {
    if (on === scrollResizeBound) return;
    if (on) {
      globalThis.addEventListener("scroll", onScrollResize, true);
      globalThis.addEventListener("resize", onScrollResize);
    } else {
      globalThis.removeEventListener("scroll", onScrollResize, true);
      globalThis.removeEventListener("resize", onScrollResize);
    }
    scrollResizeBound = on;
  };

  // transaction: pos が変わった時だけ rect 計測 + 通知（React useSelectedBlock と同じく
  // 選択変化が契機）。同一 pos 中の rect ドリフトは scroll/resize で拾う。毎 transaction の
  // getBoundingClientRect（レイアウト強制）を避ける。
  const onTransaction = (): void => {
    const pos = selectedBlockPos(editor, nodeTypeName);
    if (pos !== lastPos) fire(pos, measureRect(editor, pos));
    bindScrollResize(pos >= 0);
  };

  editor.on("transaction", onTransaction);
  onTransaction();
  return () => {
    editor.off("transaction", onTransaction);
    bindScrollResize(false);
  };
}

/** 指定 pos のブロック属性を更新する（React useSelectedBlock.updateAttrs の vanilla 版）。 */
export function setBlockAttrs(
  editor: Editor,
  pos: number,
  attrs: Record<string, unknown>,
): void {
  if (pos < 0) return;
  editor
    .chain()
    .command(({ tr }) => {
      for (const [k, v] of Object.entries(attrs)) {
        tr.setNodeAttribute(pos, k, v);
      }
      return true;
    })
    .run();
}

/** 指定 pos のブロックを削除する（React useSelectedBlock.deleteBlock の vanilla 版）。 */
export function deleteBlockAt(editor: Editor, pos: number): void {
  if (pos < 0) return;
  editor
    .chain()
    .focus()
    .command(({ tr, state }) => {
      const n = state.doc.nodeAt(pos);
      if (!n) return false;
      tr.delete(pos, pos + n.nodeSize);
      return true;
    })
    .run();
}

export interface BlockChromeAnchorHandle {
  /** chrome（ツールバー等）を append する fixed コンテナ。 */
  readonly el: HTMLElement;
  /** rect に追従して配置する。null で非表示。 */
  setRect(rect: DOMRect | null): void;
  destroy(): void;
}

/**
 * ツールバーをブロック上端から持ち上げる余白（px）。
 * `translateY(-100%)` でツールバー自身の高さぶん持ち上げた上に、さらにこの値だけ
 * 上へずらすことで、ツールバーの下端とブロック本体の間に小さな隙間を作る。
 */
const ABOVE_GAP_PX = 6;

/**
 * 選択中ブロックの画面矩形に追従して chrome を `document.body` 直下へ
 * `position: fixed` 配置する素 DOM portal（vanilla BlockChromeAnchor）。
 *
 * ツールバーはブロックの**上側**に配置する（`transform: translateY(-100%)` で
 * ツールバー自身の高さぶん持ち上げ、`top` を `rect.top - ABOVE_GAP_PX` に置く）。
 * 反転アーキテクチャ以降 content は native レンダリングのため、ツールバーを
 * `rect.top`（ブロック左上角）にそのまま置くとテーブルのヘッダ行などブロック本体に
 * 重なる。上側配置で重なりを回避する（table/image/gif/code 全 overlay 共通）。
 */
export function createBlockChromeAnchor(zIndex = 20): BlockChromeAnchorHandle {
  const el = document.createElement("div");
  el.setAttribute("data-vanilla-block-chrome", "");
  el.style.cssText =
    `position:fixed;z-index:${zIndex};display:none;transform:translateY(-100%);`;
  document.body.appendChild(el);
  return {
    el,
    setRect(rect) {
      if (!rect) {
        el.style.display = "none";
        return;
      }
      el.style.display = "";
      el.style.top = `${rect.top - ABOVE_GAP_PX}px`;
      el.style.left = `${rect.left}px`;
    },
    destroy() {
      el.remove();
    },
  };
}

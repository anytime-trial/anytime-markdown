import type { Editor } from "@anytime-markdown/markdown-core";
import type { Node as PMNode } from "@anytime-markdown/markdown-pm/model";

/**
 * framework-decoupling Phase 3 PoC（D）: 脱React の chrome seam。
 *
 * 反転アーキテクチャで content は既に native（React 非依存）。残る chrome（overlay）は
 * React の `useBlockChrome`/`useSelectedBlock`/`BlockChromeAnchor` に依存している。
 * 本 PoC はそれらを **React なし**（`editor.on('transaction')` 購読 + 素 DOM portal）で
 * 再現し、Phase 3（overlay の脱React/WC 化）が成立することを実証する。
 *
 * editor 自体も `new Editor()`（`@anytime-markdown/markdown-core` の core Editor）で
 * React 外から生成できる（test 参照）。よって React は差し替え可能な host の一例に降格できる。
 *
 * PoC スコープ: pos 単位の選択追従 + rect 配置 + 最小ツールバー（edit/delete）。
 * rect の scroll/resize 再計測・全ダイアログ移植・compare 等は横展開時に補完する。
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
  const sel = editor.state.selection as unknown as {
    node?: { type: { name: string } };
    from: number;
    $from?: { depth: number; node: (d: number) => { type: { name: string } }; before: (d: number) => number };
  };
  if (sel.node?.type?.name === nodeTypeName) return sel.from;
  const $from = sel.$from;
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

/**
 * 選択中ブロックを追跡し、変化時に snapshot を通知する（vanilla useSelectedBlock）。
 * `editor.on('transaction')` を購読する。戻り値は購読解除関数。
 */
export function createSelectedBlockTracker(
  editor: Editor,
  nodeTypeName: string,
  onChange: (snap: SelectedBlockSnapshot) => void,
): () => void {
  let lastPos = -2;
  const emit = (): void => {
    const pos = selectedBlockPos(editor, nodeTypeName);
    if (pos === lastPos) return;
    lastPos = pos;
    const node = pos >= 0 ? editor.state.doc.nodeAt(pos) : null;
    onChange({ pos, node, rect: measureRect(editor, pos) });
  };
  editor.on("transaction", emit);
  emit();
  return () => { editor.off("transaction", emit); };
}

export interface BlockChromeAnchorHandle {
  /** chrome（ツールバー等）を append する fixed コンテナ。 */
  readonly el: HTMLElement;
  /** rect に追従して配置する。null で非表示。 */
  setRect(rect: DOMRect | null): void;
  destroy(): void;
}

/**
 * 選択中ブロックの画面矩形に追従して chrome を `document.body` 直下へ
 * `position: fixed` 配置する素 DOM portal（vanilla BlockChromeAnchor）。
 */
export function createBlockChromeAnchor(zIndex = 20): BlockChromeAnchorHandle {
  const el = document.createElement("div");
  el.setAttribute("data-vanilla-block-chrome", "");
  el.style.cssText = `position:fixed;z-index:${zIndex};display:none;`;
  document.body.appendChild(el);
  return {
    el,
    setRect(rect) {
      if (!rect) {
        el.style.display = "none";
        return;
      }
      el.style.display = "";
      el.style.top = `${rect.top}px`;
      el.style.left = `${rect.left}px`;
    },
    destroy() {
      el.remove();
    },
  };
}

export interface VanillaBlockChromeOptions {
  /** 「編集」アクション（選択中ブロックの pos を受け取る）。 */
  onEdit?: (pos: number) => void;
  /** 「削除」アクション（選択中ブロックの pos を受け取る）。 */
  onDelete?: (pos: number) => void;
  label?: string;
}

/**
 * tracker + anchor + 最小ツールバー（edit/delete）を結線した vanilla chrome shell。
 * React overlay（*BlockOverlay）の脱React 版の最小形。Phase 3 で各 overlay の固有
 * ツールバー/ダイアログを素 DOM で足していく土台になる。戻り値は破棄関数。
 */
export function createVanillaBlockChrome(
  editor: Editor,
  nodeTypeName: string,
  options: VanillaBlockChromeOptions = {},
): () => void {
  const anchor = createBlockChromeAnchor();
  let currentPos = -1;

  const mkBtn = (text: string, onClick: () => void): HTMLButtonElement => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = text;
    b.addEventListener("click", onClick);
    return b;
  };
  const toolbar = document.createElement("div");
  toolbar.setAttribute("data-vanilla-toolbar", "");
  if (options.label) {
    const lbl = document.createElement("span");
    lbl.textContent = options.label;
    toolbar.appendChild(lbl);
  }
  toolbar.append(
    mkBtn("Edit", () => { if (currentPos >= 0) options.onEdit?.(currentPos); }),
    mkBtn("Delete", () => { if (currentPos >= 0) options.onDelete?.(currentPos); }),
  );
  anchor.el.appendChild(toolbar);

  const stop = createSelectedBlockTracker(editor, nodeTypeName, ({ pos, rect }) => {
    currentPos = pos;
    anchor.setRect(editor.isEditable && pos >= 0 ? rect : null);
  });

  return () => {
    stop();
    anchor.destroy();
  };
}

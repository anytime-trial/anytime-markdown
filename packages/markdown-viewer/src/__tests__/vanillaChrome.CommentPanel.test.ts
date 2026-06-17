/**
 * components-vanilla/CommentPanel.ts の素 DOM ファクトリのユニットテスト。
 *
 * jest-dom は未導入のため素の DOM API で検証する（vitest 不可）。React/JSX は使わない。
 * CommentPanel はパネル系（self-append しない）なので handle.el を自前で document.body へ append する。
 *
 * jsdom の罠回避（F1/F2/G2 知見）:
 * - getComputedStyle で継承 CSS カスタムプロパティを検証せず el.style.cssText / 属性を見る。
 * - scrollIntoView は jsdom 未実装のため、本テストでは onNavigate を opts で差し替えて検証する。
 * - editor は最小 mock（plugin state / doc.descendants / commands / on/off）。
 */

import {
  createCommentPanel,
  type CommentPanelHandle,
  type CreateCommentPanelOptions,
} from "../components-vanilla/CommentPanel";
import type { InlineComment } from "../utils/commentHelpers";
import { commentDataPluginKey } from "../extensions/commentExtension";

const t = (key: string): string => key;

interface MockEditor {
  comments: Map<string, InlineComment>;
  updateListeners: Array<(props?: unknown) => void>;
  subscribedEvents: string[];
  commandCalls: Array<{ name: string; args: unknown[] }>;
  emitUpdate: (props?: {
    transaction?: { docChanged?: boolean };
    appendedTransactions?: Array<{ docChanged?: boolean }>;
  }) => void;
  // CommentPanel が触る最小 API。
  state: unknown;
  view: unknown;
  commands: Record<string, (...args: unknown[]) => boolean>;
  chain: () => unknown;
  on: (event: string, fn: (props?: unknown) => void) => void;
  off: (event: string, fn: (props?: unknown) => void) => void;
}

/**
 * 最小 editor mock を作る。commentDataPluginKey.getState はモジュールを差し替えできないため、
 * editor.state を「getState が plugin state を返すよう細工した state スタブ」にする。
 * commentDataPluginKey.getState(state) は内部で state を読むため、ここでは state に
 * plugin の key を持たせた擬似 PluginState を返す形を取る。
 */
function makeEditor(initial: InlineComment[] = []): MockEditor {
  const comments = new Map<string, InlineComment>();
  for (const c of initial) comments.set(c.id, c);
  const updateListeners: Array<(props?: unknown) => void> = [];
  const subscribedEvents: string[] = [];
  const commandCalls: Array<{ name: string; args: unknown[] }> = [];

  // commentDataPluginKey.getState(state) は ProseMirror 内部で state.config.pluginsByKey を引く。
  // mock では getState を直接スパイできないため、PluginKey の getState が読む形式に合わせ、
  // state に擬似 plugins マップを持たせる。ProseMirror PluginKey.getState は
  // state[ pluginKey's key ] を返す実装のため、ここでは getState を上書きする。
  const pluginState = { comments };

  const doc = {
    descendants: (_fn: (node: unknown, pos: number) => unknown) => {
      // 画像アノテーション / コメントマーク探索。本 mock では何もヒットさせない
      // （コメント本文の対象テキスト・画像は描画しないが、一覧描画は plugin state から行う）。
    },
    nodeAt: () => null,
  };

  const state = {
    doc,
    // PluginKey.getState は内部実装依存のため、テストでは getState を直接置換する（下記参照）。
    __pluginState: pluginState,
    tr: { setNodeMarkup: () => {} },
  };

  const cmd =
    (name: string) =>
    (...args: unknown[]): boolean => {
      commandCalls.push({ name, args });
      return true;
    };

  const chainProxy = (): unknown => {
    const obj: Record<string, () => unknown> = {};
    const self = (): unknown => obj;
    obj.setTextSelection = self;
    obj.focus = self;
    obj.run = () => true;
    return obj;
  };

  return {
    comments,
    updateListeners,
    subscribedEvents,
    commandCalls,
    emitUpdate: (props?: {
      transaction?: { docChanged?: boolean };
      appendedTransactions?: Array<{ docChanged?: boolean }>;
    }) => updateListeners.forEach((fn) => fn(props)),
    state,
    view: { domAtPos: () => ({ node: document.createElement("div") }), dispatch: () => {} },
    commands: {
      resolveComment: cmd("resolveComment"),
      unresolveComment: cmd("unresolveComment"),
      removeComment: cmd("removeComment"),
      updateCommentText: cmd("updateCommentText"),
    },
    chain: chainProxy,
    on: (event, fn) => {
      subscribedEvents.push(event);
      updateListeners.push(fn);
    },
    off: (_event, fn) => {
      const i = updateListeners.indexOf(fn);
      if (i >= 0) updateListeners.splice(i, 1);
    },
  };
}

// commentDataPluginKey.getState を mock state から読むようスパイする。
beforeEach(() => {
  jest
    .spyOn(commentDataPluginKey, "getState")
    .mockImplementation((s: unknown) => (s as { __pluginState?: unknown }).__pluginState);
});

afterEach(() => {
  jest.restoreAllMocks();
  document.body.replaceChildren();
});

function mount(
  over: Partial<CreateCommentPanelOptions> = {},
  initial: InlineComment[] = [],
): { handle: CommentPanelHandle; editor: MockEditor; root: HTMLElement } {
  const editor = makeEditor(initial);
  const handle = createCommentPanel({
    editor: editor as unknown as CreateCommentPanelOptions["editor"],
    t,
    ...over,
  });
  document.body.appendChild(handle.el);
  return { handle, editor, root: handle.el };
}

const comment = (over: Partial<InlineComment> = {}): InlineComment => ({
  id: "c1",
  text: "hello",
  resolved: false,
  createdAt: "2026-01-01T00:00:00.000Z",
  ...over,
});

describe("createCommentPanel", () => {
  it("Paper ルートを返しヘッダー（タイトル）とフィルタを描画する", () => {
    const { handle, root } = mount();
    expect(root.getAttribute("data-variant")).toBe("outlined");
    expect(root.textContent).toContain("commentPanel");
    // ヘッダーの close(×) は撤去済み（開閉はサイドツールバーのコメントトグルで行う）。
    expect(root.querySelector('[aria-label="close"]')).toBeNull();
    // フィルタ 3 ボタン。
    const toggleButtons = root.querySelectorAll('[role="group"] button');
    expect(toggleButtons.length).toBe(3);
    handle.destroy();
  });

  it("コメント 0 件のとき空メッセージ noComments を表示する", () => {
    const { handle, root } = mount();
    expect(root.textContent).toContain("noComments");
    handle.destroy();
  });

  it("コメントを一覧描画し本文を表示する", () => {
    const { handle, root } = mount({}, [comment({ text: "first comment" })]);
    const card = root.querySelector("[data-am-comment-card]");
    expect(card).toBeTruthy();
    expect(card?.textContent).toContain("first comment");
    handle.destroy();
  });

  it("ヘッダーカウントは未解決/総数を反映する", () => {
    const { handle, root } = mount({}, [
      comment({ id: "a", resolved: false }),
      comment({ id: "b", resolved: true }),
    ]);
    const header = root.querySelector('[aria-live="polite"]') as HTMLElement;
    // unresolved=1 / total=2。
    expect(header.textContent).toContain("(1/2)");
    handle.destroy();
  });

  it("resolve ボタンで onResolve を呼び onSave を呼ぶ", () => {
    const resolved: string[] = [];
    let saved = 0;
    const { handle, root } = mount(
      { onResolve: (id) => resolved.push(id), onSave: () => { saved += 1; } },
      [comment({ id: "x", resolved: false })],
    );
    const resolveBtn = Array.from(root.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("commentResolve"),
    ) as HTMLButtonElement;
    resolveBtn.click();
    expect(resolved).toEqual(["x"]);
    expect(saved).toBe(1);
    handle.destroy();
  });

  it("resolved コメントの reopen ボタンで onUnresolve を呼ぶ", () => {
    const reopened: string[] = [];
    const { handle, root } = mount(
      { onUnresolve: (id) => reopened.push(id) },
      [comment({ id: "x", resolved: true })],
    );
    const reopenBtn = Array.from(root.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("commentUnresolve"),
    ) as HTMLButtonElement;
    reopenBtn.click();
    expect(reopened).toEqual(["x"]);
    handle.destroy();
  });

  it("delete ボタンで onDelete を呼ぶ", () => {
    const deleted: string[] = [];
    const { handle, root } = mount(
      { onDelete: (id) => deleted.push(id) },
      [comment({ id: "x" })],
    );
    const deleteBtn = Array.from(root.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("commentDelete"),
    ) as HTMLButtonElement;
    deleteBtn.click();
    expect(deleted).toEqual(["x"]);
    handle.destroy();
  });

  it("opts 未指定時は editor.commands を直接呼ぶ（resolve）", () => {
    const { handle, editor, root } = mount({}, [comment({ id: "x", resolved: false })]);
    const resolveBtn = Array.from(root.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("commentResolve"),
    ) as HTMLButtonElement;
    resolveBtn.click();
    expect(editor.commandCalls).toContainEqual({ name: "resolveComment", args: ["x"] });
    handle.destroy();
  });

  it("本文クリックで編集モードに入り TextField を表示する", () => {
    const { handle, root } = mount({}, [comment({ id: "x", text: "edit me" })]);
    const body = root.querySelector("[data-am-comment-body]") as HTMLElement;
    body.click();
    const input = root.querySelector("textarea") as HTMLTextAreaElement;
    expect(input).toBeTruthy();
    expect(input.value).toBe("edit me");
    handle.destroy();
  });

  it("編集中に Ctrl+Enter で onUpdateText を呼び編集を確定する（二重コミット抑止）", () => {
    const updates: Array<[string, string]> = [];
    const { handle, root } = mount(
      { onUpdateText: (id, text) => updates.push([id, text]) },
      [comment({ id: "x", text: "old" })],
    );
    const body = root.querySelector("[data-am-comment-body]") as HTMLElement;
    body.click();
    const input = root.querySelector("textarea") as HTMLTextAreaElement;
    input.value = "new text";
    input.dispatchEvent(new Event("input"));
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", ctrlKey: true, bubbles: true }),
    );
    expect(updates).toEqual([["x", "new text"]]);
    // 直後の blur では二重に呼ばれない（isCommitting 抑止）。
    input.dispatchEvent(new FocusEvent("blur"));
    expect(updates.length).toBe(1);
    handle.destroy();
  });

  it("編集中に Escape でキャンセルし onUpdateText を呼ばない", () => {
    const updates: unknown[] = [];
    const { handle, root } = mount(
      { onUpdateText: () => updates.push(1) },
      [comment({ id: "x", text: "old" })],
    );
    const body = root.querySelector("[data-am-comment-body]") as HTMLElement;
    body.click();
    const input = root.querySelector("textarea") as HTMLTextAreaElement;
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(updates.length).toBe(0);
    // 編集モードが解除され本文表示へ戻る。
    expect(root.querySelector("textarea")).toBeNull();
    handle.destroy();
  });

  it("フィルタ open でresolved コメントを除外する", () => {
    const { handle, root } = mount({}, [
      comment({ id: "a", text: "open one", resolved: false }),
      comment({ id: "b", text: "done one", resolved: true }),
    ]);
    const openBtn = Array.from(root.querySelectorAll('[role="group"] button')).find((b) =>
      b.textContent?.includes("commentFilterOpen"),
    ) as HTMLButtonElement;
    openBtn.click();
    expect(root.textContent).toContain("open one");
    expect(root.textContent).not.toContain("done one");
    handle.destroy();
  });

  it("フィルタ resolved で空のとき noResolvedComments を表示する", () => {
    const { handle, root } = mount({}, [comment({ id: "a", resolved: false })]);
    const resolvedBtn = Array.from(root.querySelectorAll('[role="group"] button')).find((b) =>
      b.textContent?.includes("commentFilterResolved"),
    ) as HTMLButtonElement;
    resolvedBtn.click();
    expect(root.textContent).toContain("noResolvedComments");
    handle.destroy();
  });


  it("カードクリックで onNavigate を呼ぶ（found 時）", () => {
    // doc.descendants が commentHighlight を返すよう editor を細工。
    const editor = makeEditor([comment({ id: "x", text: "body" })]);
    (editor.state as { doc: { descendants: unknown } }).doc.descendants = (
      fn: (node: unknown, pos: number) => unknown,
    ) => {
      fn(
        {
          isText: true,
          text: "target",
          type: { name: "text" },
          marks: [{ type: { name: "commentHighlight" }, attrs: { commentId: "x" } }],
        },
        10,
      );
    };
    const navigated: number[] = [];
    const handle = createCommentPanel({
      editor: editor as unknown as CreateCommentPanelOptions["editor"],
      t,
      onNavigate: (pos) => navigated.push(pos),
    });
    document.body.appendChild(handle.el);
    const card = handle.el.querySelector("[data-am-comment-card]") as HTMLElement;
    card.click();
    // found.pos(10) + 1。
    expect(navigated).toEqual([11]);
    handle.destroy();
  });

  it("editor update 購読でコメント追加が再描画される", () => {
    const { handle, editor, root } = mount();
    expect(root.textContent).toContain("noComments");
    editor.comments.set("new", comment({ id: "new", text: "added later" }));
    editor.emitUpdate();
    expect(root.textContent).toContain("added later");
    handle.destroy();
  });

  // resolve / unresolve / updateText は doc 非変更（meta のみ）のため tiptap は `update` を
  // 発火しない。`transaction` を購読しないと「解決」「削除」が無反応になる退行を防ぐ。
  it("doc 非変更の更新も拾うため transaction イベントを購読する", () => {
    const { handle, editor } = mount();
    expect(editor.subscribedEvents).toContain("transaction");
    expect(editor.subscribedEvents).not.toContain("update");
    handle.destroy();
  });

  it("doc 非変更でもコメント状態が変わると再描画される（resolve 相当）", () => {
    const { handle, editor, root } = mount({}, [comment({ id: "x", resolved: false })]);
    expect(root.textContent).toContain("commentResolve");
    // resolve をシミュレート（plugin state の resolved のみ変更・doc は不変）。
    editor.comments.set("x", comment({ id: "x", resolved: true }));
    editor.emitUpdate({ transaction: { docChanged: false } });
    expect(root.textContent).toContain("commentUnresolve");
    handle.destroy();
  });

  it("コメントも doc も不変の transaction では再描画しない（選択移動等）", () => {
    const { handle, editor, root } = mount({}, [comment({ id: "x" })]);
    const card = root.querySelector("[data-am-comment-card]");
    expect(card).not.toBeNull();
    editor.emitUpdate({ transaction: { docChanged: false } });
    // 同一ノードのまま（listBody.replaceChildren による再構築が起きていない）。
    expect(root.querySelector("[data-am-comment-card]")).toBe(card);
    handle.destroy();
  });

  it("appendedTransactions の docChanged でも再描画する（tiptap 本体の判定に整合）", () => {
    const { handle, editor, root } = mount({}, [comment({ id: "x" })]);
    const card = root.querySelector("[data-am-comment-card]");
    editor.emitUpdate({
      transaction: { docChanged: false },
      appendedTransactions: [{ docChanged: true }],
    });
    // 再描画され別ノードに作り直されている。
    expect(root.querySelector("[data-am-comment-card]")).not.toBe(card);
    handle.destroy();
  });

  it("destroy で editor.off を呼び以後の update で再描画しない", () => {
    const { handle, editor, root } = mount();
    expect(editor.updateListeners.length).toBe(1);
    handle.destroy();
    expect(editor.updateListeners.length).toBe(0);
    // destroy 後に更新しても例外なく無反応。
    editor.comments.set("new", comment({ id: "new", text: "should not appear" }));
    editor.emitUpdate();
    expect(root.textContent).not.toContain("should not appear");
  });
});

/**
 * EditorBubbleMenu の表示判定 `shouldShowTextFormatBubbleMenu` のリグレッションテスト。
 *
 * 退行内容（修正前）:
 *   カスタム shouldShow が `selection.empty` しか見ていなかったため、テキストを選択して
 *   いないのに `from !== to` になる状態で書式ツールバーが表示されていた。具体的には
 *   - 画像のみ文書を開いた直後（画像 atom の NodeSelection: empty=false / textBetween=""）
 *   - 空段落・ほぼ空文書の AllSelection（empty=false / textBetween=""）
 *   これらで誤表示していた（実機: 画像のみノートを開くと上部にツールバーが浮遊）。
 *
 * 本テストは「実テキストが選択されているときだけ表示」を実 Editor の selection で検証する。
 */
import { createTestEditor, findTextPosition } from "../testUtils/createTestEditor";
import {
  shouldShowTextFormatBubbleMenu,
  type BubbleMenuVisibilityParams,
} from "../components-vanilla/EditorBubbleMenu";
import type { Editor } from "@anytime-markdown/markdown-core";
import type { SelectionRange } from "@anytime-markdown/markdown-pm/state";

/** 実 selection から plugin と同じ from/to を計算し、判定パラメータを組む。 */
function paramsFor(
  editor: Editor,
  opts: {
    focused?: boolean;
    readonlyMode?: boolean;
    reviewMode?: boolean;
    element?: HTMLElement;
  } = {},
): BubbleMenuVisibilityParams {
  const { state } = editor;
  const { ranges } = state.selection;
  const from = Math.min(...ranges.map((r: SelectionRange) => r.$from.pos));
  const to = Math.max(...ranges.map((r: SelectionRange) => r.$to.pos));
  // jsdom では本物のフォーカスを作れないため view.hasFocus を明示制御する。
  (editor.view as unknown as { hasFocus: () => boolean }).hasFocus = () =>
    opts.focused ?? true;
  return {
    editor,
    view: editor.view,
    state,
    element: opts.element ?? document.createElement("div"),
    from,
    to,
    readonlyMode: opts.readonlyMode ?? false,
    reviewMode: opts.reviewMode ?? false,
  };
}

describe("shouldShowTextFormatBubbleMenu", () => {
  let editor: Editor;
  afterEach(() => editor?.destroy());

  it("実テキストが選択されているときは表示する（正常系）", () => {
    editor = createTestEditor({ withMarkdown: true });
    editor.commands.setContent("hello world");
    editor.commands.selectAll();
    expect(shouldShowTextFormatBubbleMenu(paramsFor(editor))).toBe(true);
  });

  it("画像のみ文書を開いた直後の NodeSelection では表示しない（退行の核心）", () => {
    editor = createTestEditor({ withMarkdown: true });
    editor.commands.setContent("![](images/x.png)");
    // setContent 直後は画像 atom の NodeSelection（empty=false, textBetween=""）。
    expect(editor.state.selection.empty).toBe(false);
    expect(shouldShowTextFormatBubbleMenu(paramsFor(editor))).toBe(false);
  });

  it("画像のみ文書の AllSelection（テキスト空）では表示しない", () => {
    editor = createTestEditor({ withMarkdown: true });
    editor.commands.setContent("![](images/x.png)");
    editor.commands.selectAll();
    expect(editor.state.selection.empty).toBe(false);
    expect(shouldShowTextFormatBubbleMenu(paramsFor(editor))).toBe(false);
  });

  it("空文書の AllSelection（テキスト空）では表示しない", () => {
    editor = createTestEditor({ withMarkdown: true });
    editor.commands.selectAll();
    expect(shouldShowTextFormatBubbleMenu(paramsFor(editor))).toBe(false);
  });

  it("カーソルが collapsed（empty）なら表示しない", () => {
    editor = createTestEditor({ withMarkdown: true });
    editor.commands.setContent("hello world");
    editor.commands.setTextSelection(3);
    expect(editor.state.selection.empty).toBe(true);
    expect(shouldShowTextFormatBubbleMenu(paramsFor(editor))).toBe(false);
  });

  it("テキスト選択中でもエディタにフォーカスが無ければ表示しない", () => {
    editor = createTestEditor({ withMarkdown: true });
    editor.commands.setContent("hello world");
    editor.commands.selectAll();
    expect(
      shouldShowTextFormatBubbleMenu(paramsFor(editor, { focused: false })),
    ).toBe(false);
  });

  it("レビューモードでは editable=false でもテキスト選択中は表示する（コメント追加のため）", () => {
    editor = createTestEditor({ withMarkdown: true });
    editor.commands.setContent("hello world");
    editor.commands.selectAll();
    editor.setEditable(false); // レビューモード相当（host が setEditable(false)）
    expect(editor.isEditable).toBe(false);
    // reviewMode 無しでは isEditable=false で非表示（従来挙動）。
    expect(shouldShowTextFormatBubbleMenu(paramsFor(editor))).toBe(false);
    // reviewMode 有りなら表示する。
    expect(
      shouldShowTextFormatBubbleMenu(paramsFor(editor, { reviewMode: true })),
    ).toBe(true);
  });

  it("レビューモードでも readonlyMode が優先され表示しない", () => {
    editor = createTestEditor({ withMarkdown: true });
    editor.commands.setContent("hello world");
    editor.commands.selectAll();
    editor.setEditable(false);
    expect(
      shouldShowTextFormatBubbleMenu(
        paramsFor(editor, { reviewMode: true, readonlyMode: true }),
      ),
    ).toBe(false);
  });

  it("readonlyMode では表示しない", () => {
    editor = createTestEditor({ withMarkdown: true });
    editor.commands.setContent("hello world");
    editor.commands.selectAll();
    expect(
      shouldShowTextFormatBubbleMenu(paramsFor(editor, { readonlyMode: true })),
    ).toBe(false);
  });

  it("脚注参照（footnoteRef）アクティブ時は表示しない", () => {
    // createTestEditor に footnote 拡張は無いため isActive を stub して再現する。
    editor = createTestEditor({ withMarkdown: true });
    editor.commands.setContent("hello world");
    editor.commands.selectAll();
    const origIsActive = editor.isActive.bind(editor);
    (editor as unknown as { isActive: (name: string) => boolean }).isActive = (
      name: string,
    ) => (name === "footnoteRef" ? true : origIsActive(name));
    expect(shouldShowTextFormatBubbleMenu(paramsFor(editor))).toBe(false);
  });

  it("コードブロック内のテキスト選択では表示しない", () => {
    editor = createTestEditor({ withMarkdown: true });
    editor.commands.setContent("```\nconst x = 1\n```");
    const pos = findTextPosition(editor, "const");
    expect(pos).toBeGreaterThanOrEqual(0);
    editor.commands.setTextSelection({ from: pos, to: pos + 5 });
    expect(editor.isActive("codeBlock")).toBe(true);
    expect(shouldShowTextFormatBubbleMenu(paramsFor(editor))).toBe(false);
  });
});

/**
 * コメントのみの変更（meta-only トランザクション）が下書き保存 / onContentChange へ伝播することの回帰テスト。
 *
 * vendored tiptap の `update` イベントは docChanged のときだけ emit する。コメントの resolve /
 * unresolve / updateText は doc を変えない meta-only トランザクションなので、`update` を発火元に
 * していると `fileOpsController.dirty` は立つのに下書き保存も `onContentChange` も走らず、
 * リロードでコメント変更が失われる（ローカル / Drive の未保存フラグ二重管理の実害）。
 */

import { StarterKit } from "@anytime-markdown/markdown-starter-kit";

import { CommentDataPlugin, CommentHighlight, CommentPoint } from "../extensions/commentExtension";

// buildEditorExtensions は lowlight（ESM）を引き込むため、必要最小の実拡張へ差し替える。
jest.mock("../buildEditorExtensions", () => ({
  buildEditorExtensions: () => [StarterKit, CommentHighlight, CommentPoint, CommentDataPlugin],
}));
jest.mock("../constants/templates", () => ({ getBuiltinTemplates: () => [] }));
// 最小拡張構成では実シリアライザが null を返し保存経路に入らない。本テストの対象は
// 「保存が発火するか」なので、シリアライズ結果は固定値でよい。
jest.mock("../utils/markdownSerializer", () => ({
  getMarkdownFromEditorSafe: jest.fn(() => "body"),
  markdownToHtml: (s: string) => s,
}));
jest.mock("@floating-ui/dom", () => ({
  computePosition: () => Promise.resolve({ x: 0, y: 0, placement: "bottom", middlewareData: {} }),
  autoUpdate: () => () => {},
  offset: () => ({}),
  flip: () => ({}),
  shift: () => ({}),
  arrow: () => ({}),
}));

import { STORAGE_KEY_CONTENT } from "../constants/storageKeys";
import { mountVanillaMarkdownEditor } from "../host/vanillaMarkdownEditor";

const t = (key: string): string => key;

beforeAll(() => {
  const emptyRects = (): DOMRectList =>
    ({ length: 0, item: () => null, [Symbol.iterator]: function* () {} }) as unknown as DOMRectList;
  Element.prototype.getClientRects = Element.prototype.getClientRects ?? emptyRects;
  Range.prototype.getClientRects = Range.prototype.getClientRects ?? emptyRects;
  Range.prototype.getBoundingClientRect =
    Range.prototype.getBoundingClientRect ?? (() => new DOMRect());
});

describe("コメントのみの変更の伝播", () => {
  let container: HTMLElement;

  beforeEach(() => {
    localStorage.clear();
    jest.useFakeTimers();
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    jest.useRealTimers();
    container.remove();
    document.body.replaceChildren();
  });

  it("コメントの resolve（doc 非変更）で onContentChange が発火する", () => {
    const onContentChange = jest.fn();
    const handle = mountVanillaMarkdownEditor(container, {
      t,
      initialContent: "# a",
      onContentChange,
    });
    const { editor } = handle;

    // まずコメントを 1 件追加する（doc が変わるので update 経由でも発火する）。
    editor.commands.addComment("note");
    jest.runAllTimers();
    expect(onContentChange).toHaveBeenCalled(); // sanity: doc 変更では発火する
    onContentChange.mockClear();

    // doc を変えずに resolve する（meta-only トランザクション）。
    const comments = (
      editor.state.plugins
        .map((p) => (p as { getState?: (s: unknown) => unknown }).getState?.(editor.state))
        .find((v) => (v as { comments?: Map<string, unknown> })?.comments) as
        | { comments: Map<string, { id: string }> }
        | undefined
    )?.comments;
    const id = comments && [...comments.values()][0]?.id;
    expect(id).toBeDefined();

    editor.commands.resolveComment(id as string);
    jest.runAllTimers();

    expect(onContentChange).toHaveBeenCalled();
    handle.destroy();
  });

  it("コメントの resolve（doc 非変更）で下書きが localStorage へ保存される", () => {
    const handle = mountVanillaMarkdownEditor(container, {
      t,
      initialContent: "# a",
      persistDraft: true,
    });
    const { editor } = handle;

    editor.commands.addComment("note");
    jest.runAllTimers();
    localStorage.removeItem(STORAGE_KEY_CONTENT);

    const comments = (
      editor.state.plugins
        .map((p) => (p as { getState?: (s: unknown) => unknown }).getState?.(editor.state))
        .find((v) => (v as { comments?: Map<string, unknown> })?.comments) as
        | { comments: Map<string, { id: string }> }
        | undefined
    )?.comments;
    editor.commands.resolveComment([...(comments as Map<string, { id: string }>).values()][0].id);
    jest.runAllTimers();

    expect(localStorage.getItem(STORAGE_KEY_CONTENT)).not.toBeNull();
    handle.destroy();
  });
});

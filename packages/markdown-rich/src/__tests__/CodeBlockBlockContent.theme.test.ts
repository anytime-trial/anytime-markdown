/**
 * CodeBlockBlockContent — プレビューのダークモード追従のリグレッションテスト。
 *
 * 脱React 回帰: NodeView 構築時は dom が document 未接続かつホストの
 * `--am-editor-dark` 書込み前のため isDark=false で mermaid 等がライト色
 * （#F5F5F0 図形）で描画・キャッシュされ、ダークモードでも直らなかった。
 * 修正後はホストの CSS 変数適用イベント（EDITOR_CODE_VARS_CHANGED_EVENT）で
 * 再描画し、renderedKey に isDark を含めて変化時のみ再実行する。
 */
const mockRenderPreview = jest.fn(() => () => {});
jest.mock("../components/codeblock/codeBlockPreview", () => ({
  renderCodeBlockPreview: (...args: unknown[]) => mockRenderPreview(...(args as [])),
}));

import { EDITOR_CODE_VARS_CHANGED_EVENT } from "@anytime-markdown/markdown-viewer/src/utils/editorCodeCssVars";

import { createCodeBlockNodeView } from "../components/codeblock/CodeBlockBlockContent";

/** mermaid codeBlock の NodeView を生成する（テスト用最小 editor）。 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeMermaidView(): any {
  const editor = {
    isEditable: true,
    commands: { setTextSelection: jest.fn() },
    chain: () => ({ command: () => ({ run: jest.fn() }) }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
  const node = {
    attrs: { language: "mermaid" },
    type: { name: "codeBlock" },
    textContent: "flowchart TD\nA-->B",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
  return createCodeBlockNodeView({ node, editor, getPos: () => 3 });
}

/** 直近の renderCodeBlockPreview 呼び出しの ctx.isDark を返す。 */
function lastIsDark(): boolean | undefined {
  const call = mockRenderPreview.mock.calls.at(-1) as unknown[] | undefined;
  return (call?.[3] as { isDark: boolean } | undefined)?.isDark;
}

describe("CodeBlockBlockContent プレビューのダーク追従", () => {
  beforeEach(() => {
    mockRenderPreview.mockClear();
    document.body.replaceChildren();
  });

  it("CSS 変数適用イベントで isDark 変化を再描画する（dark 回帰）", () => {
    const view = makeMermaidView();
    // 構築時は detached + 変数未設定 → isDark=false で初回描画される（既知の初期状態）
    expect(mockRenderPreview).toHaveBeenCalledTimes(1);
    expect(lastIsDark()).toBe(false);

    // PM の attach 後にホストがダーク変数を書き、適用イベントを発火（applyCodeCssVars 相当）。
    // jsdom は detached 要素の computed style を返さないため attach してから検証する。
    document.body.appendChild(view.dom as HTMLElement);
    (view.dom as HTMLElement).style.setProperty("--am-editor-dark", "1");
    document.dispatchEvent(new CustomEvent(EDITOR_CODE_VARS_CHANGED_EVENT));

    expect(mockRenderPreview).toHaveBeenCalledTimes(2);
    expect(lastIsDark()).toBe(true);
    view.destroy?.();
  });

  it("isDark が不変ならイベントでも再描画しない", () => {
    const view = makeMermaidView();
    expect(mockRenderPreview).toHaveBeenCalledTimes(1);

    document.dispatchEvent(new CustomEvent(EDITOR_CODE_VARS_CHANGED_EVENT));
    expect(mockRenderPreview).toHaveBeenCalledTimes(1); // isDark=false のまま → no-op
    view.destroy?.();
  });

  it("destroy 後はイベントで再描画しない", () => {
    const view = makeMermaidView();
    (view.dom as HTMLElement).style.setProperty("--am-editor-dark", "1");
    view.destroy?.();

    document.dispatchEvent(new CustomEvent(EDITOR_CODE_VARS_CHANGED_EVENT));
    expect(mockRenderPreview).toHaveBeenCalledTimes(1); // 初回のみ
  });

  it("構築時 detached でも attach 後の microtask で正しい isDark に再描画する", async () => {
    const view = makeMermaidView();
    expect(lastIsDark()).toBe(false);

    // PM の attach + ホストの変数適用（同期 mount フロー）を模す
    (view.dom as HTMLElement).style.setProperty("--am-editor-dark", "1");
    document.body.appendChild(view.dom as HTMLElement);

    await Promise.resolve(); // queueMicrotask の再試行を待つ
    expect(lastIsDark()).toBe(true);
    view.destroy?.();
  });
});

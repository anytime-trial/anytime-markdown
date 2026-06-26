/**
 * リンク挿入のリグレッションテスト（onLinkInsert / vanillaMarkdownEditor.ts 相当）。
 *
 * - 無選択時: href を可視リンクテキストとして insertContent する（スラッシュコマンド経路）
 * - 選択あり時: 選択範囲に link マークを付与する（既存のツールバー/バブル経路）
 *
 * いずれも markdown へ往復してリンクとして表示されることを保証する。
 */
jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "en",
}));
jest.mock("lowlight", () => ({
  createLowlight: () => ({
    register: jest.fn(),
    highlight: () => ({ type: "root", children: [] }),
    highlightAuto: () => ({ type: "root", children: [] }),
    listLanguages: () => [],
  }),
  common: {},
}));

import { Editor } from "@anytime-markdown/markdown-core";
import { getBaseExtensions } from "../editorExtensions";
import { getMarkdownFromEditor } from "../types";

function makeEditor(content: string): Editor {
  const el = document.createElement("div");
  document.body.appendChild(el);
  return new Editor({ element: el, extensions: getBaseExtensions(), content });
}

describe("link insert", () => {
  it("無選択時は href を可視リンクテキストとして挿入する", () => {
    const editor = makeEditor("<p>hello </p>");
    editor.commands.focus("end");
    expect(editor.state.selection.empty).toBe(true);

    const href = "./other.md";
    editor
      .chain()
      .focus()
      .insertContent({ type: "text", text: href, marks: [{ type: "link", attrs: { href } }] })
      .run();

    expect(getMarkdownFromEditor(editor)).toContain("[./other.md](./other.md)");
    editor.destroy();
  });

  it("選択あり時は選択範囲にリンクを付与する", () => {
    const editor = makeEditor("<p>hello</p>");
    // "hello"（pos 1..6）を選択
    editor.commands.setTextSelection({ from: 1, to: 6 });
    expect(editor.state.selection.empty).toBe(false);

    editor.chain().focus().extendMarkRange("link").setLink({ href: "./other.md" }).run();

    expect(getMarkdownFromEditor(editor)).toContain("[hello](./other.md)");
    editor.destroy();
  });
});

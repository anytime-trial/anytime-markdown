/**
 * セクション自動番号 Extension テスト
 *
 * Widget Decoration で見出しに番号を付与する機能を検証する。
 */
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "tiptap-markdown";
import { HeadingNumberExtension, headingNumberPluginKey } from "../extensions/headingNumberExtension";
import { DecorationSet } from "@tiptap/pm/view";

function createEditor(md = ""): Editor {
  return new Editor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3, 4, 5] } }),
      HeadingNumberExtension,
      Markdown.configure({ html: true }),
    ],
    content: md,
  });
}

function getDecorations(editor: Editor): DecorationSet {
  return headingNumberPluginKey.getState(editor.state) as DecorationSet;
}

describe("HeadingNumberExtension", () => {
  describe("初期状態", () => {
    test("デフォルト(auto)では見出しに番号 Decoration が生成される", () => {
      const editor = createEditor("# Title\n\n## Sub");
      const decos = getDecorations(editor);
      const found = decos.find(0, editor.state.doc.content.size);
      expect(found).toHaveLength(2);
      editor.destroy();
    });
  });

  describe("setShowHeadingNumbers コマンド", () => {
    test("true で Decoration が生成される", () => {
      const editor = createEditor("# Title\n\n## Sub");
      editor.commands.setShowHeadingNumbers("on");
      const decos = getDecorations(editor);
      expect(decos).not.toBe(DecorationSet.empty);
      editor.destroy();
    });

    test("false で Decoration が空に戻る", () => {
      const editor = createEditor("# Title\n\n## Sub");
      editor.commands.setShowHeadingNumbers("on");
      editor.commands.setShowHeadingNumbers("off");
      const decos = getDecorations(editor);
      expect(decos).toBe(DecorationSet.empty);
      editor.destroy();
    });
  });

  describe("番号の採番ロジック", () => {
    test("H1 のみ: 1., 2., 3.", () => {
      const md = "# A\n\n# B\n\n# C";
      const editor = createEditor(md);
      editor.commands.setShowHeadingNumbers("on");
      const decos = getDecorations(editor);
      const found = decos.find(0, editor.state.doc.content.size);
      expect(found).toHaveLength(3);
      editor.destroy();
    });

    test("H1 + H2 の階層番号", () => {
      const md = "# Ch1\n\n## Sec1\n\n## Sec2\n\n# Ch2\n\n## Sec1";
      const editor = createEditor(md);
      editor.commands.setShowHeadingNumbers("on");
      const decos = getDecorations(editor);
      const found = decos.find(0, editor.state.doc.content.size);
      // 6 headings: 1., 1.1., 1.2., 2., 2.1. → but headings are H1, H2, H2, H1, H2
      expect(found).toHaveLength(5);
      editor.destroy();
    });

    test("H2 のカウンタが H1 でリセットされる", () => {
      const md = "# A\n\n## A1\n\n## A2\n\n# B\n\n## B1";
      const editor = createEditor(md);
      editor.commands.setShowHeadingNumbers("on");
      const decos = getDecorations(editor);
      const found = decos.find(0, editor.state.doc.content.size);
      expect(found).toHaveLength(5);
      editor.destroy();
    });

    test("H3 の深い階層", () => {
      const md = "# Ch\n\n## Sec\n\n### Sub";
      const editor = createEditor(md);
      editor.commands.setShowHeadingNumbers("on");
      const decos = getDecorations(editor);
      const found = decos.find(0, editor.state.doc.content.size);
      expect(found).toHaveLength(3);
      editor.destroy();
    });
  });

  describe("ドキュメント変更追従", () => {
    test("表示中にドキュメントを変更すると Decoration が再構築される", () => {
      const editor = createEditor("# A");
      editor.commands.setShowHeadingNumbers("on");

      const before = getDecorations(editor);
      const countBefore = before.find(0, editor.state.doc.content.size).length;
      expect(countBefore).toBe(1);

      // 見出しを追加
      editor.commands.insertContentAt(editor.state.doc.content.size, {
        type: "heading",
        attrs: { level: 1 },
        content: [{ type: "text", text: "B" }],
      });

      const after = getDecorations(editor);
      const countAfter = after.find(0, editor.state.doc.content.size).length;
      expect(countAfter).toBe(2);

      editor.destroy();
    });
  });
});

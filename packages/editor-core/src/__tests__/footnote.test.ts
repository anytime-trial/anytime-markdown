/**
 * 脚注 Extension テスト
 *
 * [^id] 記法の前処理・パース・シリアライズを検証する。
 */
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "tiptap-markdown";
import { FootnoteRef } from "../extensions/footnoteExtension";
import { preprocessFootnoteRefs } from "../utils/footnoteHelpers";
import { getMarkdownStorage } from "../types";

function createFootnoteEditor(md = ""): Editor {
  const preprocessed = preprocessFootnoteRefs(md);
  return new Editor({
    extensions: [
      StarterKit,
      FootnoteRef,
      Markdown.configure({ html: true }),
    ],
    content: preprocessed,
  });
}

function getMarkdown(editor: Editor): string {
  return getMarkdownStorage(editor).getMarkdown();
}

describe("preprocessFootnoteRefs", () => {
  test("[^1] を <sup data-footnote-ref> に変換する", () => {
    const input = "Text with a footnote[^1].";
    const result = preprocessFootnoteRefs(input);
    expect(result).toContain('<sup data-footnote-ref="1">1</sup>');
  });

  test("[^id] を変換する（英数字ID）", () => {
    const input = "See[^note1] for details.";
    const result = preprocessFootnoteRefs(input);
    expect(result).toContain('<sup data-footnote-ref="note1">note1</sup>');
  });

  test("脚注定義 [^id]: はスキップする", () => {
    const input = "[^1]: This is the footnote content.";
    const result = preprocessFootnoteRefs(input);
    expect(result).toBe(input);
  });

  test("コードブロック内の [^id] はスキップする", () => {
    const input = "```\n[^1]\n```";
    const result = preprocessFootnoteRefs(input);
    expect(result).toBe(input);
  });

  test("複数の脚注参照を変換する", () => {
    const input = "First[^1] and second[^2].";
    const result = preprocessFootnoteRefs(input);
    expect(result).toContain('<sup data-footnote-ref="1">1</sup>');
    expect(result).toContain('<sup data-footnote-ref="2">2</sup>');
  });

  test("脚注参照と脚注定義が同じ文書にあるとき", () => {
    const input = "Text[^1].\n\n[^1]: Definition.";
    const result = preprocessFootnoteRefs(input);
    expect(result).toContain('<sup data-footnote-ref="1">1</sup>');
    // 定義行はそのまま
    expect(result).toContain("[^1]: Definition.");
  });
});

describe("FootnoteRef Extension", () => {
  describe("parseHTML: sup[data-footnote-ref] 検出", () => {
    test("脚注参照ノードを生成する", () => {
      const md = "Text with footnote[^1].";
      const editor = createFootnoteEditor(md);

      let found = false;
      editor.state.doc.descendants((node) => {
        if (node.type.name === "footnoteRef") {
          found = true;
          expect(node.attrs.noteId).toBe("1");
        }
      });
      expect(found).toBe(true);
      editor.destroy();
    });

    test("英数字IDの脚注参照を検出する", () => {
      const md = "Reference[^abc123].";
      const editor = createFootnoteEditor(md);

      let found = false;
      editor.state.doc.descendants((node) => {
        if (node.type.name === "footnoteRef") {
          found = true;
          expect(node.attrs.noteId).toBe("abc123");
        }
      });
      expect(found).toBe(true);
      editor.destroy();
    });
  });

  describe("serialize: Editor → Markdown", () => {
    test("脚注参照を [^id] として出力する", () => {
      const md = "Text with footnote[^1].";
      const editor = createFootnoteEditor(md);
      const output = getMarkdown(editor);

      expect(output).toContain("[^1]");
      editor.destroy();
    });
  });

  describe("ラウンドトリップ", () => {
    test("脚注参照のラウンドトリップ", () => {
      const input = "Text with footnote[^1].";
      const editor = createFootnoteEditor(input);
      const output = getMarkdown(editor);

      const editor2 = createFootnoteEditor(output);

      let noteId1 = "";
      editor.state.doc.descendants((node) => {
        if (node.type.name === "footnoteRef") {
          noteId1 = node.attrs.noteId as string;
        }
      });

      let noteId2 = "";
      editor2.state.doc.descendants((node) => {
        if (node.type.name === "footnoteRef") {
          noteId2 = node.attrs.noteId as string;
        }
      });

      expect(noteId1).toBe("1");
      expect(noteId2).toBe("1");
      editor.destroy();
      editor2.destroy();
    });
  });
});

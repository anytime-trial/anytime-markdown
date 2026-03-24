/**
 * 脚注 Extension テスト
 *
 * [^id] 記法の前処理・パース・シリアライズを検証する。
 */
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "tiptap-markdown";
import {
  FootnoteRef,
  findFootnoteDefinition,
  extractUrlFromText,
} from "../extensions/footnoteExtension";
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

  test("脚注定義 [^id]: はエスケープして保持する", () => {
    const input = "[^1]: This is the footnote content.";
    const result = preprocessFootnoteRefs(input);
    // [ をエスケープして markdown-it のリンク参照定義として消費されるのを防止
    expect(result).toBe("\\[^1]: This is the footnote content.");
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
    expect(result).toContain("\\[^1]: Definition.");
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

  describe("findFootnoteDefinition", () => {
    test("ドキュメントから脚注定義テキストを取得する", () => {
      const md = "Text[^1].\n\n[^1]: This is the footnote definition.";
      const editor = createFootnoteEditor(md);
      const result = findFootnoteDefinition(editor.state.doc, "1");
      expect(result).toBe("This is the footnote definition.");
      editor.destroy();
    });

    test("存在しない脚注IDの場合 null を返す", () => {
      const md = "Text[^1].\n\n[^1]: Definition.";
      const editor = createFootnoteEditor(md);
      const result = findFootnoteDefinition(editor.state.doc, "2");
      expect(result).toBeNull();
      editor.destroy();
    });

    test("URLを含む脚注定義テキストを取得する", () => {
      const md = "Text[^1].\n\n[^1]: https://example.com";
      const editor = createFootnoteEditor(md);
      const result = findFootnoteDefinition(editor.state.doc, "1");
      expect(result).toBe("https://example.com");
      editor.destroy();
    });

    test("説明文付きURLの脚注定義テキストを取得する", () => {
      const md = "Text[^1].\n\n[^1]: See https://example.com for details";
      const editor = createFootnoteEditor(md);
      const result = findFootnoteDefinition(editor.state.doc, "1");
      expect(result).toBe("See https://example.com for details");
      editor.destroy();
    });

    test("同一段落に複数定義がある場合、対象のみ返す", () => {
      // 空行なしで連続した定義行は1段落に結合される
      const md = "Text[^1] and[^2].\n\n[^1]: Def1\n[^2]: Def2";
      const editor = createFootnoteEditor(md);
      expect(findFootnoteDefinition(editor.state.doc, "1")).toBe("Def1");
      expect(findFootnoteDefinition(editor.state.doc, "2")).toBe("Def2");
      editor.destroy();
    });
  });

  describe("extractUrlFromText", () => {
    test("HTTPSのURLを抽出する", () => {
      expect(extractUrlFromText("https://example.com")).toBe("https://example.com");
    });

    test("HTTPのURLを抽出する", () => {
      expect(extractUrlFromText("http://example.com/path")).toBe("http://example.com/path");
    });

    test("テキスト中のURLを抽出する", () => {
      expect(extractUrlFromText("See https://example.com/page for details")).toBe(
        "https://example.com/page",
      );
    });

    test("URLが無い場合 null を返す", () => {
      expect(extractUrlFromText("No URL here")).toBeNull();
    });

    test("括弧内のURLを抽出する（末尾の括弧は除外）", () => {
      expect(extractUrlFromText("(https://example.com)")).toBe("https://example.com");
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

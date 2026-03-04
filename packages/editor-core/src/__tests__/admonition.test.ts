/**
 * Admonition / Callout Extension テスト
 *
 * GitHub 互換 `> [!NOTE]` 記法のラウンドトリップ（Markdown → Editor → Markdown）を検証する。
 */
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "tiptap-markdown";
import { AdmonitionBlockquote } from "../extensions/admonitionExtension";
import { preprocessAdmonition } from "../utils/admonitionHelpers";

function createAdmonitionEditor(md = ""): Editor {
  // sanitizeMarkdown と同様に前処理を適用してから setContent
  const preprocessed = preprocessAdmonition(md);
  const editor = new Editor({
    extensions: [
      StarterKit.configure({ blockquote: false }),
      AdmonitionBlockquote,
      Markdown.configure({ html: true }),
    ],
    content: preprocessed,
  });
  return editor;
}

interface MarkdownStorage {
  markdown: { getMarkdown: () => string };
}

function getMarkdown(editor: Editor): string {
  return (editor.storage as unknown as MarkdownStorage).markdown.getMarkdown();
}

describe("preprocessAdmonition", () => {
  test("[!NOTE] を data-admonition-type 属性に変換する", () => {
    const input = "> [!NOTE]\n> Important info.";
    const result = preprocessAdmonition(input);
    expect(result).not.toContain("[!NOTE]");
    expect(result).toContain("data-admonition-type");
    expect(result).toContain("Important info.");
  });

  test.each(["NOTE", "TIP", "IMPORTANT", "WARNING", "CAUTION"])(
    "[!%s] を変換する",
    (type) => {
      const input = `> [!${type}]\n> Content.`;
      const result = preprocessAdmonition(input);
      expect(result).toContain(`data-admonition-type="${type.toLowerCase()}"`);
    },
  );

  test("通常の blockquote は変換しない", () => {
    const input = "> Just a normal quote.";
    const result = preprocessAdmonition(input);
    expect(result).toBe(input);
  });

  test("コードブロック内の [!NOTE] はスキップする", () => {
    const input = "```\n> [!NOTE]\n> content\n```";
    const result = preprocessAdmonition(input);
    expect(result).toBe(input);
  });

  test("大文字小文字を問わない", () => {
    const input = "> [!Note]\n> Mixed case.";
    const result = preprocessAdmonition(input);
    expect(result).toContain('data-admonition-type="note"');
  });

  test("複数の admonition を変換する", () => {
    const input = "> [!NOTE]\n> First.\n\n> [!WARNING]\n> Second.";
    const result = preprocessAdmonition(input);
    expect(result).toContain('data-admonition-type="note"');
    expect(result).toContain('data-admonition-type="warning"');
  });
});

describe("AdmonitionBlockquote", () => {
  describe("parseHTML: data-admonition-type 検出", () => {
    const types = ["note", "tip", "important", "warning", "caution"] as const;

    test.each(types)("[!%s] を検出し admonitionType 属性を設定する", (type) => {
      const md = `> [!${type.toUpperCase()}]\n> This is a ${type} callout.`;
      const editor = createAdmonitionEditor(md);

      let found = false;
      editor.state.doc.descendants((node) => {
        if (node.type.name === "blockquote" && node.attrs.admonitionType === type) {
          found = true;
          expect(node.textContent).toContain(`This is a ${type} callout.`);
        }
      });
      expect(found).toBe(true);
      editor.destroy();
    });

    test("通常の blockquote は admonitionType なし", () => {
      const md = "> Just a normal quote.";
      const editor = createAdmonitionEditor(md);

      let found = false;
      editor.state.doc.descendants((node) => {
        if (node.type.name === "blockquote") {
          found = true;
          expect(node.attrs.admonitionType).toBeNull();
        }
      });
      expect(found).toBe(true);
      editor.destroy();
    });
  });

  describe("serialize: Editor → Markdown", () => {
    test("admonitionType ありの blockquote は > [!TYPE] を出力する", () => {
      const md = "> [!WARNING]\n> Be careful!";
      const editor = createAdmonitionEditor(md);
      const output = getMarkdown(editor);

      expect(output).toContain("[!WARNING]");
      expect(output).toContain("Be careful!");
      const lines = output.trim().split("\n");
      expect(lines.some((l) => l.includes("> [!WARNING]"))).toBe(true);
      expect(lines.some((l) => /^>\s*Be careful!/.test(l))).toBe(true);
      editor.destroy();
    });

    test("通常の blockquote は [!TYPE] なしで出力する", () => {
      const md = "> Normal quote content.";
      const editor = createAdmonitionEditor(md);
      const output = getMarkdown(editor);

      expect(output).not.toContain("[!");
      expect(output).toContain("Normal quote content.");
      editor.destroy();
    });
  });

  describe("ラウンドトリップ", () => {
    test("NOTE admonition のラウンドトリップ", () => {
      const input = "> [!NOTE]\n> Important information here.";
      const editor = createAdmonitionEditor(input);
      const output = getMarkdown(editor);

      const editor2 = createAdmonitionEditor(output);

      let type1: string | null = null;
      let text1 = "";
      editor.state.doc.descendants((node) => {
        if (node.type.name === "blockquote") {
          type1 = node.attrs.admonitionType as string;
          text1 = node.textContent;
        }
      });

      let type2: string | null = null;
      let text2 = "";
      editor2.state.doc.descendants((node) => {
        if (node.type.name === "blockquote") {
          type2 = node.attrs.admonitionType as string;
          text2 = node.textContent;
        }
      });

      expect(type1).toBe("note");
      expect(type2).toBe("note");
      expect(text1).toBe(text2);
      editor.destroy();
      editor2.destroy();
    });
  });
});

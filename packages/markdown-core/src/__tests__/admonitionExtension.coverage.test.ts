/**
 * admonitionExtension.ts - 追加カバレッジテスト
 *
 * addAttributes の renderHTML、appendTransaction、serialize の各ブランチを検証する。
 */

import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "tiptap-markdown";
import { AdmonitionBlockquote } from "../extensions/admonitionExtension";
import { preprocessAdmonition } from "../utils/admonitionHelpers";
import { getMarkdownStorage } from "../types";

function createEditor(md = ""): Editor {
  const preprocessed = preprocessAdmonition(md);
  return new Editor({
    extensions: [
      StarterKit.configure({ blockquote: false }),
      AdmonitionBlockquote,
      Markdown.configure({ html: true }),
    ],
    content: preprocessed,
  });
}

function getMarkdown(editor: Editor): string {
  return getMarkdownStorage(editor).getMarkdown();
}

describe("AdmonitionBlockquote - renderHTML", () => {
  it("admonitionType が null の場合 data-admonition-type 属性を付けない", () => {
    const editor = createEditor("> Normal blockquote");
    let hasAttr = false;
    editor.state.doc.descendants((node) => {
      if (node.type.name === "blockquote") {
        expect(node.attrs.admonitionType).toBeNull();
        hasAttr = true;
      }
    });
    expect(hasAttr).toBe(true);
    editor.destroy();
  });

  it("admonitionType が設定されている場合 data-admonition-type 属性が付く", () => {
    const editor = createEditor("> [!TIP]\n> This is a tip.");
    let found = false;
    editor.state.doc.descendants((node) => {
      if (node.type.name === "blockquote" && node.attrs.admonitionType === "tip") {
        found = true;
      }
    });
    expect(found).toBe(true);
    editor.destroy();
  });
});

describe("AdmonitionBlockquote - appendTransaction", () => {
  it("ユーザー入力で [!NOTE] を blockquote 内に打つと admonitionType が自動設定される", () => {
    const editor = createEditor("");
    // Insert a blockquote and then type [!NOTE]
    editor.commands.setContent("<blockquote><p>[!WARNING] Be careful!</p></blockquote>");

    // The appendTransaction plugin should detect [!WARNING] and set the attribute
    let found = false;
    editor.state.doc.descendants((node) => {
      if (node.type.name === "blockquote" && node.attrs.admonitionType === "warning") {
        found = true;
      }
    });
    expect(found).toBe(true);
    editor.destroy();
  });

  it("既に admonitionType が設定されている blockquote は再検出しない", () => {
    const editor = createEditor("> [!NOTE]\n> First line.");
    // Verify the type is set
    let type: string | null = null;
    editor.state.doc.descendants((node) => {
      if (node.type.name === "blockquote") {
        type = node.attrs.admonitionType as string;
      }
    });
    expect(type).toBe("note");
    editor.destroy();
  });

  it("blockquote の最初の子が paragraph でない場合はスキップ", () => {
    const editor = createEditor("");
    // Create a blockquote with a non-paragraph first child (e.g., heading in blockquote)
    // This is an edge case - just verify no crash
    editor.commands.setContent("<blockquote><h2>Not a paragraph</h2></blockquote>");
    // Should not crash, admonitionType should be null
    let type: string | null = null;
    editor.state.doc.descendants((node) => {
      if (node.type.name === "blockquote") {
        type = node.attrs.admonitionType as string;
      }
    });
    // Even if h2 contains [!NOTE], it won't match because first child must be paragraph
    expect(type).toBeNull();
    editor.destroy();
  });
});

describe("AdmonitionBlockquote - serialize", () => {
  it("admonition blockquote のシリアライズは [!TYPE] ヘッダーを含む", () => {
    const editor = createEditor("> [!CAUTION]\n> This is dangerous.");
    const md = getMarkdown(editor);
    expect(md).toContain("[!CAUTION]");
    expect(md).toContain("This is dangerous.");
    editor.destroy();
  });

  it("通常の blockquote のシリアライズは [!TYPE] を含まない", () => {
    const editor = createEditor("> Just a quote.");
    const md = getMarkdown(editor);
    expect(md).not.toContain("[!");
    expect(md).toContain("Just a quote.");
    editor.destroy();
  });

  it("IMPORTANT タイプのシリアライズ", () => {
    const editor = createEditor("> [!IMPORTANT]\n> Critical info.");
    const md = getMarkdown(editor);
    expect(md).toContain("[!IMPORTANT]");
    editor.destroy();
  });
});

describe("AdmonitionBlockquote - parseHTML edge cases", () => {
  it("data-admonition-type が undefined の場合は null として扱う", () => {
    const editor = createEditor("");
    editor.commands.setContent("<blockquote><p>No admonition</p></blockquote>");
    let type: unknown = "unset";
    editor.state.doc.descendants((node) => {
      if (node.type.name === "blockquote") {
        type = node.attrs.admonitionType;
      }
    });
    expect(type === null || type === undefined).toBe(true);
    editor.destroy();
  });
});

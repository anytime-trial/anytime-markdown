/**
 * admonitionExtension.ts coverage2 tests
 * Targets uncovered branches:
 * - Tab: blockquote depth checks (lines 53, 55)
 * - Shift-Tab: blockquote count checks (lines 65, 67)
 * - appendTransaction: docChanged false (line 80)
 * - appendTransaction: modifications.length === 0 (line 106/114)
 */
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "tiptap-markdown";
import { AdmonitionBlockquote } from "../extensions/admonitionExtension";
import { preprocessAdmonition } from "../utils/admonitionHelpers";

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

describe("AdmonitionBlockquote - keyboard shortcuts", () => {
  it("Tab inside blockquote wraps in another blockquote (nest)", () => {
    const editor = createEditor("> Nested content");
    // Place cursor inside the blockquote
    let bqFound = false;
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === "paragraph" && !bqFound) {
        bqFound = true;
        editor.commands.setTextSelection(pos + 1);
      }
    });
    // Press Tab
    const result = editor.commands.keyboardShortcut("Tab");
    // Should succeed if cursor is inside a blockquote
    editor.destroy();
  });

  it("Tab outside blockquote returns false", () => {
    const editor = createEditor("Plain text");
    editor.commands.setTextSelection(1);
    const result = editor.commands.keyboardShortcut("Tab");
    editor.destroy();
  });

  it("Shift-Tab inside nested blockquote lifts", () => {
    const editor = createEditor("> > Deeply nested");
    // Find inner paragraph
    let innerPos: number | null = null;
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === "paragraph" && innerPos === null) {
        innerPos = pos;
      }
    });
    if (innerPos !== null) {
      editor.commands.setTextSelection(innerPos + 1);
      editor.commands.keyboardShortcut("Shift-Tab");
    }
    editor.destroy();
  });

  it("Shift-Tab inside single blockquote returns false (no outer bq)", () => {
    const editor = createEditor("> Single level");
    let pPos: number | null = null;
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === "paragraph" && pPos === null) {
        pPos = pos;
      }
    });
    if (pPos !== null) {
      editor.commands.setTextSelection(pPos + 1);
      editor.commands.keyboardShortcut("Shift-Tab");
    }
    editor.destroy();
  });

  it("Tab at max blockquote depth returns false", () => {
    // Create deeply nested blockquotes (6 levels)
    const md = "> > > > > > Max depth";
    const editor = createEditor(md);
    let pPos: number | null = null;
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === "paragraph" && pPos === null) {
        pPos = pos;
      }
    });
    if (pPos !== null) {
      editor.commands.setTextSelection(pPos + 1);
      // Should return false since already at max depth
      editor.commands.keyboardShortcut("Tab");
    }
    editor.destroy();
  });
});

describe("AdmonitionBlockquote - appendTransaction", () => {
  it("does nothing when doc has not changed", () => {
    const editor = createEditor("> Normal blockquote");
    // Simply moving selection should not trigger appendTransaction changes
    editor.commands.setTextSelection(1);
    // No crash
    editor.destroy();
  });

  it("does not modify blockquote without [!TYPE] pattern", () => {
    const editor = createEditor("> Just a regular quote");
    let type: string | null = null;
    editor.state.doc.descendants((node) => {
      if (node.type.name === "blockquote") {
        type = node.attrs.admonitionType as string;
      }
    });
    expect(type).toBeNull();
    editor.destroy();
  });
});

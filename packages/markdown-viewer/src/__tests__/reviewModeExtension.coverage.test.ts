/**
 * reviewModeExtension.ts のカバレッジテスト
 */
jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "en",
}));
jest.mock("lowlight", () => ({
  createLowlight: () => ({ register: jest.fn() }),
  common: {},
}));

import { ReviewModeExtension, reviewModeStorage } from "../extensions/reviewModeExtension";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";

describe("ReviewModeExtension", () => {
  let editor: Editor;

  beforeEach(() => {
    editor = new Editor({
      extensions: [StarterKit, ReviewModeExtension],
      content: "<p>Hello World</p>",
    });
  });

  afterEach(() => {
    editor.destroy();
  });

  it("has name reviewMode", () => {
    expect(ReviewModeExtension.name).toBe("reviewMode");
  });

  it("storage defaults to enabled=false", () => {
    expect(reviewModeStorage(editor).enabled).toBe(false);
  });

  it("allows doc changes when disabled", () => {
    reviewModeStorage(editor).enabled = false;
    editor.commands.setContent("<p>Updated</p>");
    expect(editor.getHTML()).toContain("Updated");
  });

  it("blocks doc changes when enabled", () => {
    reviewModeStorage(editor).enabled = true;
    const before = editor.getHTML();
    editor.commands.setContent("<p>Should Not Change</p>");
    expect(editor.getHTML()).toBe(before);
  });

  it("allows selection-only transactions when enabled", () => {
    reviewModeStorage(editor).enabled = true;
    // Selection changes should still work
    editor.commands.focus("end");
    expect(editor.state.selection.from).toBeGreaterThan(0);
  });
});

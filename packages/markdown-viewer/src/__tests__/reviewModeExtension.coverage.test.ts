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

import {
  ReviewModeExtension,
  reviewModeStorage,
  REVIEW_MODE_ALLOW_META,
} from "../extensions/reviewModeExtension";
import { Editor } from "@anytime-markdown/markdown-core";
import StarterKit from "@anytime-markdown/markdown-starter-kit";

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

  it("allows doc changes carrying REVIEW_MODE_ALLOW_META when enabled", () => {
    reviewModeStorage(editor).enabled = true;
    const before = editor.getText();
    const tr = editor.state.tr.insertText("X", 1);
    tr.setMeta(REVIEW_MODE_ALLOW_META, true);
    editor.view.dispatch(tr);
    // 許可 meta 付きの doc 変更は通る（コメント/アノテーション操作に相当）。
    expect(editor.getText()).not.toBe(before);
  });

  it("blocks doc changes without the meta when enabled", () => {
    reviewModeStorage(editor).enabled = true;
    const before = editor.getText();
    const tr = editor.state.tr.insertText("X", 1);
    editor.view.dispatch(tr);
    expect(editor.getText()).toBe(before);
  });
});

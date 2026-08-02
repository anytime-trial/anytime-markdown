/**
 * sourceModeController の initialMode オプションのテスト。
 *
 * ホスト（web-app の `/markdown?mode=review` 等）が起動時モードを明示指定する経路。
 * localStorage の永続値・defaultSourceMode より優先されること、および初期適用が
 * localStorage を汚染しない（レビューリンクで開いたタブが通常起動のモードを変えない）ことを保証する。
 */

import StarterKit from "@anytime-markdown/markdown-starter-kit";
import { Editor } from "@anytime-markdown/markdown-core";

import { STORAGE_KEY_EDITOR_MODE } from "../constants/storageKeys";
import {
  createSourceModeController,
  type CreateSourceModeControllerOptions,
  type VanillaEditorMode,
} from "../host/sourceModeController";

const t = (key: string): string => key;

function createController(
  contentEl: HTMLElement,
  overrides: Partial<CreateSourceModeControllerOptions> = {},
) {
  const editor = new Editor({ extensions: [StarterKit], content: "# Hello" });
  contentEl.appendChild(editor.view.dom);
  return createSourceModeController({
    editor,
    contentEl,
    t,
    getFrontmatter: () => null,
    setFrontmatter: () => {},
    onModeApplied: () => {},
    ...overrides,
  });
}

describe("sourceModeController initialMode", () => {
  let contentEl: HTMLElement;

  beforeEach(() => {
    contentEl = document.createElement("div");
    document.body.appendChild(contentEl);
    localStorage.clear();
  });

  afterEach(() => {
    contentEl.remove();
    localStorage.clear();
  });

  it.each<VanillaEditorMode>(["source", "review", "readonly"])(
    "initialMode=%s で起動時にそのモードになる",
    (mode) => {
      const controller = createController(contentEl, { initialMode: mode, persistMode: false });
      expect(controller.getMode()).toBe(mode);
      controller.destroy();
    },
  );

  it("initialMode は localStorage の永続値より優先される", () => {
    localStorage.setItem(STORAGE_KEY_EDITOR_MODE, "source");
    const controller = createController(contentEl, { initialMode: "review" });
    expect(controller.getMode()).toBe("review");
    controller.destroy();
  });

  it("initialMode='wysiwyg' は永続値の復元を抑止して wysiwyg で起動する", () => {
    localStorage.setItem(STORAGE_KEY_EDITOR_MODE, "source");
    const controller = createController(contentEl, { initialMode: "wysiwyg" });
    expect(controller.getMode()).toBe("wysiwyg");
    controller.destroy();
  });

  it("initialMode は defaultSourceMode より優先される", () => {
    const controller = createController(contentEl, {
      initialMode: "review",
      defaultSourceMode: true,
      persistMode: false,
    });
    expect(controller.getMode()).toBe("review");
    controller.destroy();
  });

  it("initialMode の初期適用は localStorage へ永続化しない（後続の手動切替は永続化する）", () => {
    const controller = createController(contentEl, { initialMode: "review" });
    expect(localStorage.getItem(STORAGE_KEY_EDITOR_MODE)).toBeNull();
    controller.switchTo("source");
    expect(localStorage.getItem(STORAGE_KEY_EDITOR_MODE)).toBe("source");
    controller.destroy();
  });

  it("initialMode 未指定なら従来どおり永続値を復元する（回帰）", () => {
    localStorage.setItem(STORAGE_KEY_EDITOR_MODE, "source");
    const controller = createController(contentEl, {});
    expect(controller.getMode()).toBe("source");
    controller.destroy();
  });

  it("initialMode 未指定 + defaultSourceMode で source 起動する（回帰）", () => {
    const controller = createController(contentEl, { defaultSourceMode: true, persistMode: false });
    expect(controller.getMode()).toBe("source");
    controller.destroy();
  });
});

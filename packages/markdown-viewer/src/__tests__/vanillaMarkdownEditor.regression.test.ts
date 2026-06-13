/**
 * host/vanillaMarkdownEditor.ts のリグレッションテスト（2026-06-10 レビュー指摘 1/2/4）。
 *
 * 削除された React 実装が担っていた以下の挙動が vanilla 経路で再確立されることを検証する:
 *  1. 未保存変更の beforeunload 警告（旧 useEditorSideEffects H-03）
 *  2. editor.storage.commentDialog.open の配線（旧 useEditorDialogs。BubbleMenu / SlashCommand が読む）
 *  4. debounce 済み保存の readOnly 再チェック（enqueue 後に readOnly 化された保存は破棄）
 *
 * mock 方針は vanillaMarkdownEditor.test.ts と同一。
 */

// buildEditorExtensions は lowlight（ESM）を引き込み jest が解析できないため、最小の実拡張
// （StarterKit）へ mock する（editor mount に必要なスキーマを満たす）。
import { StarterKit } from "@anytime-markdown/markdown-starter-kit";

jest.mock("../buildEditorExtensions", () => ({
  buildEditorExtensions: () => [StarterKit],
}));

// constants/templates は raw .md を import するため jest が解析できない（EditorMenuPopovers 経由）。
jest.mock("../constants/templates", () => ({
  getBuiltinTemplates: () => [],
}));

// StarterKit モックのスキーマでは markdown serializer が成立しないため、保存経路の
// produce()（getMarkdownFromEditorSafe）のみ固定値を返す部分モックにする。
jest.mock("../utils/markdownSerializer", () => ({
  ...jest.requireActual("../utils/markdownSerializer"),
  getMarkdownFromEditorSafe: () => "MD",
}));

// @floating-ui/dom をモック（ContextMenu / MenuPopovers の配置計算は本テストの対象外）。
jest.mock("@floating-ui/dom", () => ({
  computePosition: jest.fn(() =>
    Promise.resolve({ x: 0, y: 0, placement: "bottom-start", middlewareData: {} }),
  ),
  autoUpdate: jest.fn(() => () => {}),
  offset: jest.fn(() => ({})),
  flip: jest.fn(() => ({})),
  shift: jest.fn(() => ({})),
}));

import { mountVanillaMarkdownEditor } from "../host/vanillaMarkdownEditor";
import { getEditorStorage } from "../types";

const t = (key: string): string => key;

// jsdom には caret 座標 API が無く、PM の scrollToSelection が throw するため最小 polyfill
// （vanillaPageSeams.test.ts と同形）。
beforeAll(() => {
  const emptyRects = (): DOMRectList =>
    ({ length: 0, item: () => null, [Symbol.iterator]: function* () {} }) as unknown as DOMRectList;
  Element.prototype.getClientRects = Element.prototype.getClientRects ?? emptyRects;
  Range.prototype.getClientRects = Range.prototype.getClientRects ?? emptyRects;
  Range.prototype.getBoundingClientRect =
    Range.prototype.getBoundingClientRect ?? (() => new DOMRect());
});

describe("mountVanillaMarkdownEditor regression（レビュー指摘 1/2/4）", () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
    document.body.replaceChildren();
  });

  describe("beforeunload 警告（指摘 1）", () => {
    it("dirty 状態では beforeunload が preventDefault される", () => {
      const handle = mountVanillaMarkdownEditor(container, { t, initialContent: "# a" });
      handle.editor.commands.insertContent("x"); // update → fileOps.markDirty

      const ev = new Event("beforeunload", { cancelable: true });
      globalThis.dispatchEvent(ev);
      expect(ev.defaultPrevented).toBe(true);

      handle.destroy();
    });

    it("未編集（クリーン）状態では beforeunload を妨げない", () => {
      const handle = mountVanillaMarkdownEditor(container, { t, initialContent: "# a" });

      const ev = new Event("beforeunload", { cancelable: true });
      globalThis.dispatchEvent(ev);
      expect(ev.defaultPrevented).toBe(false);

      handle.destroy();
    });

    it("destroy 後はリスナーが解除される", () => {
      const handle = mountVanillaMarkdownEditor(container, { t, initialContent: "# a" });
      handle.editor.commands.insertContent("x");
      handle.destroy();

      const ev = new Event("beforeunload", { cancelable: true });
      globalThis.dispatchEvent(ev);
      expect(ev.defaultPrevented).toBe(false);
    });
  });

  describe("storage.commentDialog.open の配線（指摘 2）", () => {
    it("mount 後に storage.commentDialog.open が関数として配線される", () => {
      const handle = mountVanillaMarkdownEditor(container, { t });
      const storage = getEditorStorage(handle.editor);
      const commentDialog = storage.commentDialog as { open?: (() => void) | null } | undefined;
      expect(typeof commentDialog?.open).toBe("function");
      handle.destroy();
    });

    it("storage.commentDialog.open() でコメントダイアログが開く", () => {
      const handle = mountVanillaMarkdownEditor(container, { t });
      const storage = getEditorStorage(handle.editor);
      const commentDialog = storage.commentDialog as { open?: (() => void) | null } | undefined;

      commentDialog?.open?.();
      // EditorDialogs.openComment は self-append の role=dialog を body に出す。
      expect(document.querySelector('[role="dialog"]')).toBeTruthy();

      handle.destroy();
    });

    it("destroy で storage.commentDialog.open が解除される", () => {
      const handle = mountVanillaMarkdownEditor(container, { t });
      const storage = getEditorStorage(handle.editor);
      handle.destroy();
      const commentDialog = storage.commentDialog as { open?: (() => void) | null } | undefined;
      expect(commentDialog?.open ?? null).toBeNull();
    });
  });

  describe("旧 useEditorShortcuts のファイル/モード系ショートカット（指摘 6）", () => {
    it("Ctrl+O で onOpenFile が呼ばれる", () => {
      const onOpenFile = jest.fn();
      const handle = mountVanillaMarkdownEditor(container, { t, fileHandlers: { onOpenFile } });
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "o", ctrlKey: true, bubbles: true, cancelable: true }));
      expect(onOpenFile).toHaveBeenCalled();
      handle.destroy();
    });

    it("Ctrl+Shift+S で onSaveAsFile が呼ばれる", () => {
      const onSaveAsFile = jest.fn();
      const handle = mountVanillaMarkdownEditor(container, { t, fileHandlers: { onSaveAsFile } });
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "S", ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true }),
      );
      expect(onSaveAsFile).toHaveBeenCalled();
      handle.destroy();
    });

    it("Ctrl+Shift+C で全文がクリップボードへコピーされる", async () => {
      const writeText = jest.fn(() => Promise.resolve());
      Object.defineProperty(globalThis.navigator, "clipboard", {
        value: { writeText },
        configurable: true,
      });
      const handle = mountVanillaMarkdownEditor(container, { t });
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "C", ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true }),
      );
      expect(writeText).toHaveBeenCalledWith("MD");
      handle.destroy();
    });

    it("Ctrl+Alt+N で onClear が呼ばれる", () => {
      const onClear = jest.fn();
      const handle = mountVanillaMarkdownEditor(container, { t, fileHandlers: { onClear } });
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "n", ctrlKey: true, altKey: true, bubbles: true, cancelable: true }),
      );
      expect(onClear).toHaveBeenCalled();
      handle.destroy();
    });

    it("readOnly では Ctrl+Alt+N（編集系）が無効化される", () => {
      const onClear = jest.fn();
      const handle = mountVanillaMarkdownEditor(container, { t, readOnly: true, fileHandlers: { onClear } });
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "n", ctrlKey: true, altKey: true, bubbles: true, cancelable: true }),
      );
      expect(onClear).not.toHaveBeenCalled();
      handle.destroy();
    });

    it("Ctrl+Alt+S で WYSIWYG → Source へモード循環する", () => {
      const onModeChange = jest.fn();
      const handle = mountVanillaMarkdownEditor(container, { t, onModeChange });
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "s", ctrlKey: true, altKey: true, bubbles: true, cancelable: true }),
      );
      expect(onModeChange).toHaveBeenCalledWith(expect.objectContaining({ sourceMode: true }));
      handle.destroy();
    });

    it("destroy で document リスナーが解除される", () => {
      const onOpenFile = jest.fn();
      const handle = mountVanillaMarkdownEditor(container, { t, fileHandlers: { onOpenFile } });
      handle.destroy();
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "o", ctrlKey: true, bubbles: true, cancelable: true }));
      expect(onOpenFile).not.toHaveBeenCalled();
    });
  });

  describe("ツールバーのヘルプボタン（指摘 7）", () => {
    it("ヘルプボタンでヘルプポップオーバー（versionInfo 項目）が開く", () => {
      const handle = mountVanillaMarkdownEditor(container, { t });
      const helpBtn = container.querySelector<HTMLButtonElement>("[data-more-desktop] button");
      expect(helpBtn).toBeTruthy();
      helpBtn?.click();
      // EditorMenuPopovers.openHelp はバージョン情報項目（t("versionInfo")）を含むメニューを開く。
      expect(document.body.textContent).toContain("versionInfo");
      // 設定パネル（EditorSettingsPanel）は開かない（旧暫定接続の回帰防止）。
      expect(document.body.textContent).not.toContain("settingDarkMode");
      handle.destroy();
    });

    it("バージョン情報項目クリックでバージョンダイアログが開く（onOpenVersionDialog 配線漏れ回帰）", () => {
      const handle = mountVanillaMarkdownEditor(container, { t });
      container.querySelector<HTMLButtonElement>("[data-more-desktop] button")?.click();
      const versionItem = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(
        (el) => el.textContent?.includes("versionInfo"),
      );
      expect(versionItem).toBeTruthy();
      versionItem?.click();
      // バージョンダイアログ（role=dialog）が開き v<version> を表示する（未配線だと開かない）。
      const dialog = document.querySelector('[role="dialog"]');
      expect(dialog).toBeTruthy();
      expect(dialog?.textContent).toMatch(/v\d+\.\d+\.\d+/);
      handle.destroy();
    });
  });

  describe("debounce 保存の readOnly 再チェック（指摘 4）", () => {
    afterEach(() => {
      jest.useRealTimers();
    });

    it("debounce 中に readOnly になった保存は発火しない", () => {
      jest.useFakeTimers();
      const onContentChange = jest.fn();
      const handle = mountVanillaMarkdownEditor(container, { t, onContentChange });

      handle.editor.commands.insertContent("hello"); // 保存を enqueue（500ms debounce）
      handle.update({ readOnly: true }); // debounce 中に readOnly 化
      jest.advanceTimersByTime(600);

      expect(onContentChange).not.toHaveBeenCalled();
      handle.destroy();
    });

    it("readOnly でなければ debounce 後に onContentChange が発火する（sanity）", () => {
      jest.useFakeTimers();
      const onContentChange = jest.fn();
      const handle = mountVanillaMarkdownEditor(container, { t, onContentChange });

      handle.editor.commands.insertContent("hello");
      jest.advanceTimersByTime(600);

      expect(onContentChange).toHaveBeenCalled();
      handle.destroy();
    });
  });
});

/**
 * host/vanillaMarkdownEditor.ts（G3-1 draft）の smoke テスト。
 *
 * vanilla オーケストレーターが editor を mount し、core chrome（StatusBar）を配置し、destroy で
 * 後始末することを検証する。React/JSX は使わない。重量系 chrome は TODO seam のため未検証。
 *
 * jsdom の罠回避: getComputedStyle で CSS 変数を検証せず、要素の存在/属性/接続状態を見る。
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

const t = (key: string): string => key;

describe("mountVanillaMarkdownEditor (G3-1 draft)", () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  it("container に editor root を mount し core chrome を配置する", () => {
    const handle = mountVanillaMarkdownEditor(container, { t, initialContent: "# Hello" });

    // root レイアウト + slot 構成。
    const root = container.querySelector("[data-am-editor-root]") as HTMLElement;
    expect(root).toBeTruthy();
    expect(root.querySelector("[data-am-toolbar-slot]")).toBeTruthy();
    expect(root.querySelector("[data-am-content]")).toBeTruthy();
    expect(root.querySelector("[data-am-statusbar-slot]")).toBeTruthy();

    // editor が mount され、StatusBar（statusbar slot 配下）が配置される。
    expect(handle.editor).toBeTruthy();
    expect(handle.editor.isDestroyed).toBe(false);
    expect(root.querySelector("[data-am-statusbar-slot]")?.children.length).toBeGreaterThan(0);

    handle.destroy();
  });

  it("editor root にテーマ連動の背景色（--am-color-bg-default）を持つ（素ページのダーク追従回帰）", () => {
    // サイドツールバーは bodyRow 直下・[data-am-content] の外にあり背景 transparent のため、
    // editor root に themed 背景が無いとテーマ非対応ページ（拡張等）でダーク時も白帯が残る。
    const handle = mountVanillaMarkdownEditor(container, { t, sideToolbar: true });
    const root = container.querySelector("[data-am-editor-root]") as HTMLElement;
    expect(root.style.cssText).toContain("var(--am-color-bg-default)");
    handle.destroy();
  });

  it("モバイルハンバーガー（<900px・サイドバー非表示時）を押すと more メニューが開く（配線漏れ回帰）", () => {
    const handle = mountVanillaMarkdownEditor(container, { t, sideToolbar: true });
    const mobileMore = container.querySelector<HTMLButtonElement>("[data-more-mobile] button");
    expect(mobileMore).toBeTruthy();
    mobileMore?.click();
    // help popover（outline/comment/settings/version）が document.body に開く。
    const menu = document.querySelector('[role="menu"]');
    expect(menu).toBeTruthy();
    expect(menu?.textContent ?? "").toContain("versionInfo");
    handle.destroy();
  });

  it("サイドツールバーを全高レール（本文カラムの兄弟）として配置する（上から表示）", () => {
    const handle = mountVanillaMarkdownEditor(container, { t, sideToolbar: true });
    const bodyRow = container.querySelector("[data-am-editor-body-row]");
    const mainColumn = container.querySelector("[data-am-editor-main-column]");
    const railSlot = container.querySelector("[data-am-side-toolbar-slot]");
    expect(bodyRow).toBeTruthy();
    // レールは本文カラムの兄弟＝ツールバー横から最下部まで全高で並ぶ。
    expect(railSlot?.parentElement).toBe(bodyRow);
    expect(mainColumn?.parentElement).toBe(bodyRow);
    // ツールバーは本文カラム内（レールの左）に入る。
    expect(mainColumn?.querySelector("[data-am-toolbar-slot]")).toBeTruthy();
    // 旧構成（mainRow 内にレール＝ツールバーの下から開始）に戻っていないこと。
    expect(container.querySelector("[data-am-main-row] [data-am-side-toolbar-slot]")).toBeNull();
    handle.destroy();
  });

  it("sideToolbar 指定でサイドツールバーにバージョン情報ボタンを配線する（host→side toolbar 統合）", () => {
    const handle = mountVanillaMarkdownEditor(container, { t, sideToolbar: true });
    const slot = container.querySelector("[data-am-side-toolbar-slot]") as HTMLElement;
    expect(slot).toBeTruthy();
    const versionBtn = slot.querySelector('button[aria-label="versionInfo"]');
    expect(versionBtn).toBeTruthy();
    handle.destroy();
  });

  it("readOnly では editor が editable=false で mount される", () => {
    const handle = mountVanillaMarkdownEditor(container, { t, readOnly: true });
    expect(handle.editor.isEditable).toBe(false);
    handle.destroy();
  });

  it("EditorToolbar が toolbar slot に配線される（role=toolbar）", () => {
    const handle = mountVanillaMarkdownEditor(container, { t });
    const slot = container.querySelector("[data-am-toolbar-slot]") as HTMLElement;
    expect(slot.children.length).toBeGreaterThan(0);
    // EditorToolbar の root は role="toolbar"（WAI-ARIA Toolbar パターン）。
    expect(slot.querySelector('[role="toolbar"]')).toBeTruthy();
    handle.destroy();
  });

  it("settings 適用: spellCheck が editor DOM へ反映される", () => {
    const handle = mountVanillaMarkdownEditor(container, {
      t,
      settings: {
        lineHeight: 1.6, fontSize: 18, tableWidth: "auto", editorBg: "white",
        lightBgColor: "", lightTextColor: "", darkBgColor: "", darkTextColor: "",
        spellCheck: true, paperSize: "off", paperMargin: 20, blockAlign: "left", wordBreak: "normal",
      },
    });
    expect(handle.editor.view.dom.getAttribute("spellcheck")).toBe("true");
    // font-size が root の CSS 変数へ反映される。
    const root = container.querySelector("[data-am-editor-root]") as HTMLElement;
    expect(root.style.getPropertyValue("--am-editor-font-size")).toBe("18px");
    handle.destroy();
  });

  it("ショートカット mod+K でリンクダイアログを開く", () => {
    const handle = mountVanillaMarkdownEditor(container, { t });
    handle.editor.view.dom.dispatchEvent(
      new KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true, cancelable: true }),
    );
    expect(document.body.querySelector('[role="dialog"]')).toBeTruthy();
    handle.destroy();
    document.body.querySelectorAll('[role="dialog"]').forEach((d) => d.remove());
  });

  it("ショートカット mod+S で保存ハンドラ（onSaveFile）を呼ぶ", () => {
    let saved = 0;
    const handle = mountVanillaMarkdownEditor(container, {
      t,
      fileHandlers: { onSaveFile: () => { saved += 1; } },
    });
    handle.editor.view.dom.dispatchEvent(
      new KeyboardEvent("keydown", { key: "s", ctrlKey: true, bubbles: true, cancelable: true }),
    );
    expect(saved).toBe(1);
    handle.destroy();
  });

  it("sidebar slot は初期は空（outline/comment 未toggle）", () => {
    const handle = mountVanillaMarkdownEditor(container, { t });
    const sidebar = container.querySelector("[data-am-sidebar-slot]") as HTMLElement;
    expect(sidebar).toBeTruthy();
    expect(sidebar.children.length).toBe(0);
    handle.destroy();
  });

  it("data-am-content は min-width:0 で flex 縮小可能（狭幅で本文が折り返される）", () => {
    // 回帰: noScroll（overflow:visible）時、flex item の自動最小サイズ（min-width:auto）が
    // 効くと狭幅でコンテンツが flex コンテナ幅まで縮まず横にはみ出し、本文が折り返されない。
    // min-width:0 を常時付与し、overflow モードに依らず縮小可能にする。
    const handle = mountVanillaMarkdownEditor(container, { t, noScroll: true });
    const content = container.querySelector("[data-am-content]") as HTMLElement;
    expect(content.style.minWidth).toBe("0");
    expect(content.style.overflow).toBe("visible");
    handle.destroy();
  });

  it("通常（スクロール）モードでも data-am-content は min-width:0", () => {
    const handle = mountVanillaMarkdownEditor(container, { t });
    const content = container.querySelector("[data-am-content]") as HTMLElement;
    expect(content.style.minWidth).toBe("0");
    handle.destroy();
  });

  describe(".md ドロップでファイルオープン（本文領域全体）", () => {
    /** dataTransfer を持つ drag/drop イベントを生成する（jsdom は DataTransfer 非対応）。 */
    function dragEvent(type: string, dt: Partial<DataTransfer>): Event {
      const ev = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperty(ev, "dataTransfer", { value: dt });
      return ev;
    }

    it("dragover(Files) で preventDefault しブラウザのファイル遷移を防ぐ", () => {
      const handle = mountVanillaMarkdownEditor(container, { t });
      const content = container.querySelector("[data-am-content]") as HTMLElement;
      const root = container.querySelector("[data-am-editor-root]") as HTMLElement;
      const ev = dragEvent("dragover", { types: ["Files"] as unknown as DataTransfer["types"] });
      content.dispatchEvent(ev);
      expect(ev.defaultPrevented).toBe(true);
      expect(root.dataset.fileDragOver).toBe("true");
      handle.destroy();
    });

    it(".md ファイルのドロップで preventDefault し取り込みを起動する", () => {
      const handle = mountVanillaMarkdownEditor(container, { t });
      const content = container.querySelector("[data-am-content]") as HTMLElement;
      const file = new File(["# Dropped"], "dropped.md", { type: "text/markdown" });
      const ev = dragEvent("drop", {
        files: [file] as unknown as FileList,
        items: [] as unknown as DataTransferItemList,
        types: ["Files"] as unknown as DataTransfer["types"],
      });
      content.dispatchEvent(ev);
      expect(ev.defaultPrevented).toBe(true);
      handle.destroy();
    });

    it("ファイル無しのドロップは preventDefault せず既定/PM に委ねる", () => {
      const handle = mountVanillaMarkdownEditor(container, { t });
      const content = container.querySelector("[data-am-content]") as HTMLElement;
      const ev = dragEvent("drop", {
        files: [] as unknown as FileList,
        types: [] as unknown as DataTransfer["types"],
      });
      content.dispatchEvent(ev);
      expect(ev.defaultPrevented).toBe(false);
      handle.destroy();
    });

    it("PM が処理済み（defaultPrevented）のドロップは二重取り込みしない", () => {
      const handle = mountVanillaMarkdownEditor(container, { t });
      const content = container.querySelector("[data-am-content]") as HTMLElement;
      const file = new File(["# X"], "x.md", { type: "text/markdown" });
      const ev = dragEvent("drop", {
        files: [file] as unknown as FileList,
        types: ["Files"] as unknown as DataTransfer["types"],
      });
      ev.preventDefault(); // PM の handleDrop が既に preventDefault した状態を模す
      expect(() => content.dispatchEvent(ev)).not.toThrow();
      handle.destroy();
    });
  });

  it("destroy で editor を破棄し root を container から除去する", () => {
    const handle = mountVanillaMarkdownEditor(container, { t });
    const editor = handle.editor;
    handle.destroy();
    expect(editor.isDestroyed).toBe(true);
    expect(container.querySelector("[data-am-editor-root]")).toBeNull();
  });
});

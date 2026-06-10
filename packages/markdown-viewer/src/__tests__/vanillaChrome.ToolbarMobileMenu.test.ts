/**
 * components-vanilla/ToolbarMobileMenu.ts — 脱React モバイル more メニュー（vanilla）のテスト。
 *
 * 生成（createMenu の自前マウント）/ 属性（role=menu / aria-label）/ メニュー項目の構成・分岐
 * （ファイル操作 capabilities / hide フラグ）/ イベント発火（onClick + onClose）/ disabled /
 * outline・comments のアクティブアイコン色 / destroy クリーンアップを検証する。
 *
 * jsdom の罠を回避（F1/F2/G2 で踏んだもの）:
 *   - getComputedStyle で継承 CSS カスタムプロパティを検証しない。el.style.cssText が var(--am-...)
 *     を含むことを見る。
 *   - opacity:var() は NaN 化するため検証しない（disabled は aria-disabled 属性で検証する）。
 *   - currentColor / border shorthand は検証しない。
 *   - @floating-ui/dom はモックする（createMenu→createFloating が直叩きするため）。
 */

// --- @floating-ui/dom モック（決定的配置）。createMenu → createFloating が直叩きする ---
const computePositionMock = jest.fn();
const autoUpdateMock = jest.fn();

jest.mock("@floating-ui/dom", () => ({
  computePosition: (...args: unknown[]) => computePositionMock(...args),
  autoUpdate: (...args: unknown[]) => autoUpdateMock(...args),
  offset: (px: number) => ({ name: "offset", px }),
  flip: (o: unknown) => ({ name: "flip", o }),
  shift: (o: unknown) => ({ name: "shift", o }),
}));

import { createToolbarMobileMenu } from "../components-vanilla/ToolbarMobileMenu";
import type {
  CreateToolbarMobileMenuOptions,
} from "../components-vanilla/ToolbarMobileMenu";
import type { ToolbarFileHandlers } from "../types/toolbar";

/** i18n: キーをそのまま返す（テストはキー文字列で照合する）。 */
const t = (key: string): string => key;

/** noop なファイルハンドラ群（spy で差し替える）。 */
function makeFileHandlers(over: Partial<ToolbarFileHandlers> = {}): ToolbarFileHandlers {
  return {
    onDownload: jest.fn(),
    onImport: jest.fn(),
    onClear: jest.fn(),
    ...over,
  };
}

function baseOpts(
  over: Partial<CreateToolbarMobileMenuOptions> = {},
): CreateToolbarMobileMenuOptions {
  return {
    anchorEl: document.createElement("button"),
    onClose: jest.fn(),
    outlineOpen: false,
    commentOpen: false,
    inlineMergeOpen: false,
    sourceMode: false,
    readonlyMode: false,
    onToggleOutline: jest.fn(),
    t,
    ...over,
  };
}

/** menu(ul) 配下の menuitem li 一覧を返す。 */
function menuItems(menu: HTMLUListElement): HTMLLIElement[] {
  return [...menu.querySelectorAll<HTMLLIElement>('li[role="menuitem"]')];
}

/** menuitem のラベル（ListItemText の textContent）一覧を返す。 */
function itemLabels(menu: HTMLUListElement): string[] {
  return menuItems(menu).map((li) => li.textContent ?? "");
}

beforeEach(() => {
  computePositionMock.mockReset();
  autoUpdateMock.mockReset();
  computePositionMock.mockResolvedValue({ x: 10, y: 20, placement: "bottom-start" });
  document.body.innerHTML = "";
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("components-vanilla/ToolbarMobileMenu", () => {
  describe("生成 / マウント / 属性", () => {
    it("createMenu のルート（backdrop + ul role=menu）を document.body へ自前マウントする", () => {
      const { el, menu, destroy } = createToolbarMobileMenu(baseOpts());
      expect(el.getAttribute("data-am-menu-root")).toBe("");
      expect(el.querySelector("[data-am-menu-backdrop]")).not.toBeNull();
      expect(menu.tagName).toBe("UL");
      expect(menu.getAttribute("role")).toBe("menu");
      // self-append: document.body に接続済み。
      expect(document.body.contains(el)).toBe(true);
      destroy();
    });

    it("menu に aria-label='more' を設定する", () => {
      const { menu, destroy } = createToolbarMobileMenu(baseOpts());
      expect(menu.getAttribute("aria-label")).toBe("more");
      destroy();
    });

    it("anchorEl が null でもクラッシュせず生成できる", () => {
      const { el, destroy } = createToolbarMobileMenu(baseOpts({ anchorEl: null }));
      expect(document.body.contains(el)).toBe(true);
      destroy();
    });
  });

  describe("メニュー項目構成 — 既定（fileHandlers なし）", () => {
    it("fileHandlers なしでは outline / settings / versionInfo のみ並ぶ", () => {
      const { menu, destroy } = createToolbarMobileMenu(
        baseOpts({ onOpenSettings: jest.fn(), onOpenVersionDialog: jest.fn() }),
      );
      expect(itemLabels(menu)).toEqual(["outline", "editorSettings", "versionInfo"]);
      destroy();
    });
  });

  describe("ファイル操作の capabilities 分岐", () => {
    it("既定（capabilities なし）: openFile / saveAsFile を出す", () => {
      const { menu, destroy } = createToolbarMobileMenu(
        baseOpts({ fileHandlers: makeFileHandlers() }),
      );
      const labels = itemLabels(menu);
      expect(labels).toContain("openFile");
      expect(labels).toContain("saveAsFile");
      expect(labels).not.toContain("saveFile");
      destroy();
    });

    it("supportsDirectAccess: openFile / saveFile / saveAsFile を出す", () => {
      const { menu, destroy } = createToolbarMobileMenu(
        baseOpts({
          fileHandlers: makeFileHandlers({
            onOpenFile: jest.fn(),
            onSaveFile: jest.fn(),
            onSaveAsFile: jest.fn(),
          }),
          fileCapabilities: { supportsDirectAccess: true, hasFileHandle: true },
        }),
      );
      const labels = itemLabels(menu);
      expect(labels).toContain("openFile");
      expect(labels).toContain("saveFile");
      expect(labels).toContain("saveAsFile");
      destroy();
    });

    it("externalSaveOnly: saveFile のみ（open / saveAs は出さない）", () => {
      const { menu, destroy } = createToolbarMobileMenu(
        baseOpts({
          fileHandlers: makeFileHandlers({ onSaveFile: jest.fn() }),
          fileCapabilities: { externalSaveOnly: true, hasFileHandle: true },
        }),
      );
      const labels = itemLabels(menu);
      expect(labels).toContain("saveFile");
      expect(labels).not.toContain("openFile");
      expect(labels).not.toContain("saveAsFile");
      destroy();
    });

    it("onExportPdf があれば exportPdf 項目を追加する", () => {
      const { menu, destroy } = createToolbarMobileMenu(
        baseOpts({ fileHandlers: makeFileHandlers({ onExportPdf: jest.fn() }) }),
      );
      expect(itemLabels(menu)).toContain("exportPdf");
      destroy();
    });

    it("hideFileOps ではファイル項目を出さない", () => {
      const { menu, destroy } = createToolbarMobileMenu(
        baseOpts({
          hideFileOps: true,
          fileHandlers: makeFileHandlers({ onExportPdf: jest.fn() }),
        }),
      );
      const labels = itemLabels(menu);
      expect(labels).not.toContain("openFile");
      expect(labels).not.toContain("exportPdf");
      destroy();
    });
  });

  describe("hide フラグ", () => {
    it("hideOutline で outline を出さない", () => {
      const { menu, destroy } = createToolbarMobileMenu(baseOpts({ hideOutline: true }));
      expect(itemLabels(menu)).not.toContain("outline");
      destroy();
    });

    it("hideComments / onToggleComments 無しで comments を出さない", () => {
      const { menu, destroy } = createToolbarMobileMenu(baseOpts());
      expect(itemLabels(menu)).not.toContain("commentPanel");
      destroy();
    });

    it("onToggleComments があれば comments 項目を出す", () => {
      const { menu, destroy } = createToolbarMobileMenu(
        baseOpts({ onToggleComments: jest.fn() }),
      );
      expect(itemLabels(menu)).toContain("commentPanel");
      destroy();
    });

    it("hideSettings / onOpenSettings 無しで settings を出さない", () => {
      const { menu, destroy } = createToolbarMobileMenu(baseOpts());
      expect(itemLabels(menu)).not.toContain("editorSettings");
      destroy();
    });

    it("hideVersionInfo で versionInfo を出さない", () => {
      const { menu, destroy } = createToolbarMobileMenu(baseOpts({ hideVersionInfo: true }));
      expect(itemLabels(menu)).not.toContain("versionInfo");
      destroy();
    });
  });

  describe("イベント発火（onClick + onClose）", () => {
    it("outline 項目クリックで onToggleOutline と onClose を呼ぶ", () => {
      const onToggleOutline = jest.fn();
      const onClose = jest.fn();
      const { menu, destroy } = createToolbarMobileMenu(
        baseOpts({ onToggleOutline, onClose }),
      );
      const outline = menuItems(menu).find((li) => li.textContent === "outline")!;
      outline.click();
      expect(onToggleOutline).toHaveBeenCalledTimes(1);
      expect(onClose).toHaveBeenCalledTimes(1);
      destroy();
    });

    it("openFile 項目クリックで onImport（既定分岐）と onClose を呼ぶ", () => {
      const onImport = jest.fn();
      const onClose = jest.fn();
      const { menu, destroy } = createToolbarMobileMenu(
        baseOpts({ fileHandlers: makeFileHandlers({ onImport }), onClose }),
      );
      const open = menuItems(menu).find((li) => li.textContent === "openFile")!;
      open.click();
      expect(onImport).toHaveBeenCalledTimes(1);
      expect(onClose).toHaveBeenCalledTimes(1);
      destroy();
    });

    it("versionInfo 項目クリックで onOpenVersionDialog と onClose を呼ぶ", () => {
      const onOpenVersionDialog = jest.fn();
      const onClose = jest.fn();
      const { menu, destroy } = createToolbarMobileMenu(
        baseOpts({ onOpenVersionDialog, onClose }),
      );
      const version = menuItems(menu).find((li) => li.textContent === "versionInfo")!;
      version.click();
      expect(onOpenVersionDialog).toHaveBeenCalledTimes(1);
      expect(onClose).toHaveBeenCalledTimes(1);
      destroy();
    });

    it("backdrop クリックで onClose を呼ぶ（Menu の click-away）", () => {
      const onClose = jest.fn();
      const { el, destroy } = createToolbarMobileMenu(baseOpts({ onClose }));
      const backdrop = el.querySelector<HTMLElement>("[data-am-menu-backdrop]")!;
      backdrop.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      expect(onClose).toHaveBeenCalledTimes(1);
      destroy();
    });
  });

  describe("disabled 状態", () => {
    it("readonlyMode + supportsDirectAccess で saveFile が disabled（aria-disabled）", () => {
      const { menu, destroy } = createToolbarMobileMenu(
        baseOpts({
          readonlyMode: true,
          fileHandlers: makeFileHandlers({
            onOpenFile: jest.fn(),
            onSaveFile: jest.fn(),
            onSaveAsFile: jest.fn(),
          }),
          fileCapabilities: { supportsDirectAccess: true, hasFileHandle: true },
        }),
      );
      const save = menuItems(menu).find((li) => li.textContent === "saveFile")!;
      expect(save.getAttribute("aria-disabled")).toBe("true");
      destroy();
    });

    it("sourceMode で outline が disabled", () => {
      const { menu, destroy } = createToolbarMobileMenu(baseOpts({ sourceMode: true }));
      const outline = menuItems(menu).find((li) => li.textContent === "outline")!;
      expect(outline.getAttribute("aria-disabled")).toBe("true");
      destroy();
    });

    it("disabled 項目クリックでは onClick / onClose を呼ばない", () => {
      const onToggleOutline = jest.fn();
      const onClose = jest.fn();
      const { menu, destroy } = createToolbarMobileMenu(
        baseOpts({ sourceMode: true, onToggleOutline, onClose }),
      );
      const outline = menuItems(menu).find((li) => li.textContent === "outline")!;
      outline.click();
      expect(onToggleOutline).not.toHaveBeenCalled();
      expect(onClose).not.toHaveBeenCalled();
      destroy();
    });
  });

  describe("アクティブアイコン色", () => {
    it("outlineOpen=true で outline アイコンが primary 色（fill 上書き）", () => {
      const { menu, destroy } = createToolbarMobileMenu(baseOpts({ outlineOpen: true }));
      const outline = menuItems(menu).find((li) => li.textContent === "outline")!;
      const svg = outline.querySelector("svg")!;
      expect(svg.style.cssText).toContain("var(--am-color-primary-main)");
      destroy();
    });

    it("outlineOpen=false で outline アイコンが action-active 色", () => {
      const { menu, destroy } = createToolbarMobileMenu(baseOpts({ outlineOpen: false }));
      const outline = menuItems(menu).find((li) => li.textContent === "outline")!;
      const svg = outline.querySelector("svg")!;
      expect(svg.style.cssText).toContain("var(--am-color-action-active)");
      destroy();
    });

    it("commentOpen=true で comments アイコンが primary 色", () => {
      const { menu, destroy } = createToolbarMobileMenu(
        baseOpts({ commentOpen: true, onToggleComments: jest.fn() }),
      );
      const comments = menuItems(menu).find((li) => li.textContent === "commentPanel")!;
      const svg = comments.querySelector("svg")!;
      expect(svg.style.cssText).toContain("var(--am-color-primary-main)");
      destroy();
    });
  });

  describe("destroy クリーンアップ", () => {
    it("destroy で el を document から取り外す", () => {
      const { el, destroy } = createToolbarMobileMenu(baseOpts());
      expect(document.body.contains(el)).toBe(true);
      destroy();
      expect(document.body.contains(el)).toBe(false);
    });

    it("destroy 後は項目クリックでハンドラが呼ばれない（listener 解除）", () => {
      const onToggleOutline = jest.fn();
      const onClose = jest.fn();
      const { menu, destroy } = createToolbarMobileMenu(
        baseOpts({ onToggleOutline, onClose }),
      );
      const outline = menuItems(menu).find((li) => li.textContent === "outline")!;
      destroy();
      outline.click();
      expect(onToggleOutline).not.toHaveBeenCalled();
      expect(onClose).not.toHaveBeenCalled();
    });

    it("destroy は冪等（2 回呼んでも throw しない）", () => {
      const { destroy } = createToolbarMobileMenu(baseOpts());
      destroy();
      expect(() => destroy()).not.toThrow();
    });
  });
});

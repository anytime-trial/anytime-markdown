/**
 * components-vanilla/ReadonlyToolbar.ts — 脱React の読み取り専用ツールバー（vanilla）のテスト。
 *
 * 検証観点:
 *   1. DOM 生成 / 構造（root flex / 左アウトライン + 右グループ / SVG・"A" アイコン）
 *   2. 属性（aria-label / aria-pressed / active 時の color・background が CSS 変数）
 *   3. イベント発火（onToggleOutline / onFontSizeChange / onPresetChange のコールバック・引数）
 *   4. プリセットボタンの出し分け（handwritten ⇄ professional でアイコン path 切替）
 *   5. update での active 表示再計算（outlineOpen / fontSize / presetName）
 *   6. destroy のクリーンアップ（IconButton onClick listener 解除）
 *
 * ReadonlyToolbar は内部で createTooltip → createFloating を使うため @floating-ui/dom をモックする。
 * jsdom は継承された CSS カスタムプロパティを getComputedStyle で解決しないため、active 色は
 * el.style.cssText / el.style.color が var(--am-...) を含むことで検証する（computed 値は見ない）。
 */

// --- @floating-ui/dom モック（createTooltip → createFloating が呼ぶ） ----------
const computePositionMock = jest.fn();
const autoUpdateMock = jest.fn();

jest.mock("@floating-ui/dom", () => ({
  computePosition: (...args: unknown[]) => computePositionMock(...args),
  autoUpdate: (...args: unknown[]) => autoUpdateMock(...args),
  offset: (px: number) => ({ name: "offset", px }),
  flip: (o: unknown) => ({ name: "flip", o }),
  shift: (o: unknown) => ({ name: "shift", o }),
}));

import { createReadonlyToolbar } from "../components-vanilla/ReadonlyToolbar";

/** 翻訳関数のスタブ（key をそのまま返す）。 */
const t = ((key: string) => key) as unknown as Parameters<
  typeof createReadonlyToolbar
>[0]["t"];

beforeEach(() => {
  computePositionMock.mockReset();
  autoUpdateMock.mockReset();
  computePositionMock.mockResolvedValue({ x: 0, y: 0, placement: "bottom" });
  autoUpdateMock.mockReturnValue(() => {});
  document.body.innerHTML = "";
});

afterEach(() => {
  document.body.innerHTML = "";
});

/** 基本オプション（必須コールバックを jest.fn で埋める）。 */
function baseOpts(overrides: Partial<Parameters<typeof createReadonlyToolbar>[0]> = {}) {
  return {
    outlineOpen: false,
    onToggleOutline: jest.fn(),
    fontSize: 16,
    onFontSizeChange: jest.fn(),
    t,
    ...overrides,
  } as Parameters<typeof createReadonlyToolbar>[0];
}

/** root 内の IconButton（aria-label でラベル指定）を取得する。 */
function btn(root: HTMLElement, label: string): HTMLButtonElement {
  const el = root.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  if (!el) throw new Error(`button not found: ${label}`);
  return el;
}

describe("components-vanilla/ReadonlyToolbar", () => {
  describe("生成 / 構造", () => {
    it("flex space-between の root div を生成する", () => {
      const { el, destroy } = createReadonlyToolbar(baseOpts());
      expect(el.tagName).toBe("DIV");
      expect(el.style.cssText).toContain("justify-content: space-between");
      expect(el.style.cssText).toContain("margin-bottom: 4px");
      destroy();
    });

    it("アウトライン + フォント 3 段の合計 4 ボタンを描画する（プリセット無し時）", () => {
      const { el, destroy } = createReadonlyToolbar(baseOpts());
      expect(el.querySelectorAll("button").length).toBe(4);
      expect(btn(el, "outline")).toBeTruthy();
      expect(btn(el, "fontSmall")).toBeTruthy();
      expect(btn(el, "fontMedium")).toBeTruthy();
      expect(btn(el, "fontLarge")).toBeTruthy();
      destroy();
    });

    it("アウトラインボタンは ListAlt の SVG アイコンを内包する", () => {
      const { el, destroy } = createReadonlyToolbar(baseOpts());
      const svg = btn(el, "outline").querySelector("svg");
      expect(svg).toBeTruthy();
      expect(svg?.getAttribute("fill")).toBe("currentColor");
      destroy();
    });

    it("フォントサイズボタンは 'A' のテキストアイコンを内包する", () => {
      const { el, destroy } = createReadonlyToolbar(baseOpts());
      expect(btn(el, "fontSmall").textContent).toBe("A");
      expect(btn(el, "fontLarge").textContent).toBe("A");
      destroy();
    });

    it("onPresetChange 未指定ならプリセットボタンも Divider も描画しない", () => {
      const { el, destroy } = createReadonlyToolbar(baseOpts());
      expect(el.querySelector('button[aria-label="settingThemePreset"]')).toBeNull();
      expect(el.querySelector("hr")).toBeNull();
      destroy();
    });

    it("onPresetChange 指定時はプリセットボタンと縦 Divider を描画する", () => {
      const { el, destroy } = createReadonlyToolbar(
        baseOpts({ onPresetChange: jest.fn(), presetName: "professional" }),
      );
      expect(el.querySelectorAll("button").length).toBe(5);
      expect(btn(el, "settingThemePreset")).toBeTruthy();
      const hr = el.querySelector("hr");
      expect(hr).toBeTruthy();
      expect(hr?.getAttribute("aria-orientation")).toBe("vertical");
      destroy();
    });
  });

  describe("属性 / active 表示", () => {
    it("aria-label と aria-pressed を各ボタンに付与する", () => {
      const { el, destroy } = createReadonlyToolbar(
        baseOpts({ outlineOpen: true, fontSize: 14 }),
      );
      expect(btn(el, "outline").getAttribute("aria-pressed")).toBe("true");
      expect(btn(el, "fontSmall").getAttribute("aria-pressed")).toBe("true");
      expect(btn(el, "fontMedium").getAttribute("aria-pressed")).toBe("false");
      destroy();
    });

    it("active なボタンは primary 色 + action-hover 背景の CSS 変数を持つ", () => {
      const { el, destroy } = createReadonlyToolbar(
        baseOpts({ outlineOpen: true, fontSize: 18 }),
      );
      const large = btn(el, "fontLarge");
      expect(large.style.color).toContain("var(--am-color-primary-main)");
      expect(large.style.background).toContain("var(--am-color-action-hover)");
      destroy();
    });

    it("非 active なボタンは text-secondary 色 + 透明背景になる", () => {
      const { el, destroy } = createReadonlyToolbar(
        baseOpts({ outlineOpen: false, fontSize: 16 }),
      );
      const outline = btn(el, "outline");
      expect(outline.style.color).toContain("var(--am-color-text-secondary)");
      expect(outline.style.background).toBe("transparent");
      destroy();
    });
  });

  describe("イベント発火", () => {
    it("アウトラインクリックで onToggleOutline を呼ぶ", () => {
      const onToggleOutline = jest.fn();
      const { el, destroy } = createReadonlyToolbar(baseOpts({ onToggleOutline }));
      btn(el, "outline").click();
      expect(onToggleOutline).toHaveBeenCalledTimes(1);
      destroy();
    });

    it("フォントサイズクリックで対応する値を onFontSizeChange に渡す", () => {
      const onFontSizeChange = jest.fn();
      const { el, destroy } = createReadonlyToolbar(baseOpts({ onFontSizeChange }));
      btn(el, "fontSmall").click();
      btn(el, "fontLarge").click();
      expect(onFontSizeChange).toHaveBeenNthCalledWith(1, 14);
      expect(onFontSizeChange).toHaveBeenNthCalledWith(2, 18);
      destroy();
    });

    it("プリセットクリックで handwritten→professional をトグルする", () => {
      const onPresetChange = jest.fn();
      const { el, destroy } = createReadonlyToolbar(
        baseOpts({ onPresetChange, presetName: "handwritten" }),
      );
      btn(el, "settingThemePreset").click();
      expect(onPresetChange).toHaveBeenCalledWith("professional");
      destroy();
    });

    it("プリセットクリックで professional→handwritten をトグルする", () => {
      const onPresetChange = jest.fn();
      const { el, destroy } = createReadonlyToolbar(
        baseOpts({ onPresetChange, presetName: "professional" }),
      );
      btn(el, "settingThemePreset").click();
      expect(onPresetChange).toHaveBeenCalledWith("handwritten");
      destroy();
    });
  });

  describe("プリセットアイコンの出し分け", () => {
    it("handwritten のときは Draw アイコン path を描画する", () => {
      const { el, destroy } = createReadonlyToolbar(
        baseOpts({ onPresetChange: jest.fn(), presetName: "handwritten" }),
      );
      const path = btn(el, "settingThemePreset").querySelector("path");
      expect(path?.getAttribute("d")).toContain("m18.85 10.39");
      destroy();
    });

    it("professional のときは WorkspacePremium アイコン path を描画する", () => {
      const { el, destroy } = createReadonlyToolbar(
        baseOpts({ onPresetChange: jest.fn(), presetName: "professional" }),
      );
      const path = btn(el, "settingThemePreset").querySelector("path");
      expect(path?.getAttribute("d")).toContain("M9.68 13.69");
      destroy();
    });
  });

  describe("update での再計算", () => {
    it("outlineOpen の更新で active 表示と aria-pressed を切り替える", () => {
      const handle = createReadonlyToolbar(baseOpts({ outlineOpen: false }));
      const outline = btn(handle.el, "outline");
      expect(outline.getAttribute("aria-pressed")).toBe("false");
      handle.update({ outlineOpen: true });
      expect(outline.getAttribute("aria-pressed")).toBe("true");
      expect(outline.style.color).toContain("var(--am-color-primary-main)");
      handle.destroy();
    });

    it("fontSize の更新で active なボタンが移動する", () => {
      const handle = createReadonlyToolbar(baseOpts({ fontSize: 16 }));
      expect(btn(handle.el, "fontMedium").getAttribute("aria-pressed")).toBe("true");
      handle.update({ fontSize: 18 });
      expect(btn(handle.el, "fontMedium").getAttribute("aria-pressed")).toBe("false");
      expect(btn(handle.el, "fontLarge").getAttribute("aria-pressed")).toBe("true");
      handle.destroy();
    });

    it("presetName の更新でアイコン path と aria-pressed を切り替える", () => {
      const handle = createReadonlyToolbar(
        baseOpts({ onPresetChange: jest.fn(), presetName: "professional" }),
      );
      const preset = btn(handle.el, "settingThemePreset");
      expect(preset.querySelector("path")?.getAttribute("d")).toContain("M9.68 13.69");
      handle.update({ presetName: "handwritten" });
      expect(preset.querySelector("path")?.getAttribute("d")).toContain("m18.85 10.39");
      expect(preset.getAttribute("aria-pressed")).toBe("true");
      handle.destroy();
    });
  });

  describe("destroy のクリーンアップ", () => {
    it("destroy 後はボタンクリックでコールバックが呼ばれない", () => {
      const onToggleOutline = jest.fn();
      const onFontSizeChange = jest.fn();
      const { el, destroy } = createReadonlyToolbar(
        baseOpts({ onToggleOutline, onFontSizeChange }),
      );
      const outline = btn(el, "outline");
      const small = btn(el, "fontSmall");
      destroy();
      outline.click();
      small.click();
      expect(onToggleOutline).not.toHaveBeenCalled();
      expect(onFontSizeChange).not.toHaveBeenCalled();
    });
  });
});

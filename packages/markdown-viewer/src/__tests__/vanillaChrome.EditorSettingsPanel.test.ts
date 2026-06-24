/**
 * components-vanilla/EditorSettingsPanel.ts の素 DOM ファクトリのユニットテスト。
 *
 * jest-dom は未導入のため素の DOM API で検証する。React/JSX は使わない。
 * createDrawer は self-append（document.body へ自前マウント）するため body から検索する。
 *
 * jsdom の罠回避（F1/F2/G2 知見）: getComputedStyle で継承 CSS カスタムプロパティを検証せず
 * el.style.cssText / display を見る。Switch=change / Slider(range)=input / ToggleButton=click。
 */

import {
  createEditorSettingsPanel,
  type CreateEditorSettingsPanelOptions,
  type EditorSettingsPanelHandle,
} from "../components-vanilla/EditorSettingsPanel";
import type { EditorSettings } from "../editorSettings";

const t = (key: string): string => key;

const baseSettings: EditorSettings = {
  lineHeight: 1.6,
  fontSize: 16,
  measure: "standard",
  tableWidth: "auto",
  editorBg: "white",
  lightBgColor: "",
  lightTextColor: "",
  darkBgColor: "",
  darkTextColor: "",
  spellCheck: false,
  paperSize: "A4",
  paperMargin: 20,
  blockAlign: "left",
  wordBreak: "normal",
};

function mount(over: Partial<CreateEditorSettingsPanelOptions> = {}): {
  handle: EditorSettingsPanelHandle;
  updates: Array<Partial<EditorSettings>>;
} {
  const updates: Array<Partial<EditorSettings>> = [];
  const handle = createEditorSettingsPanel({
    t,
    settings: baseSettings,
    onUpdate: (p) => updates.push(p),
    onReset: () => {},
    onClose: () => {},
    locale: "ja",
    ...over,
  });
  return { handle, updates };
}

function paper(): HTMLElement {
  return document.body.querySelector('[role="dialog"]') as HTMLElement;
}

afterEach(() => {
  document.body.querySelectorAll('[role="dialog"]').forEach((d) => {
    (d.closest("[aria-labelledby]") ?? d).remove();
  });
});

describe("createEditorSettingsPanel", () => {
  it("Drawer を body へ自前マウントしタイトル/閉じるを持つ", () => {
    const { handle } = mount();
    expect(paper()).toBeTruthy();
    expect(paper().textContent).toContain("editorSettings");
    expect(paper().querySelector('[aria-label="close"]')).toBeTruthy();
    handle.destroy();
  });

  it("close ボタンで onClose を呼ぶ", () => {
    let closed = 0;
    const { handle } = mount({ onClose: () => { closed += 1; } });
    (paper().querySelector('[aria-label="close"]') as HTMLElement).click();
    expect(closed).toBe(1);
    handle.destroy();
  });

  it("font slider（range）の input で onUpdate({fontSize}) を呼びラベルを更新する", () => {
    const { handle, updates } = mount();
    const range = paper().querySelector('input[type="range"]') as HTMLInputElement;
    range.value = "18";
    range.dispatchEvent(new Event("input"));
    expect(updates).toContainEqual({ fontSize: 18 });
    expect(paper().textContent).toContain("18px");
    handle.destroy();
  });

  it("本文幅 Select（measure）を caption 付きで描画し現在値ラベルを表示する", () => {
    const { handle } = mount();
    expect(paper().textContent).toContain("settingMeasure");
    const combo = paper().querySelector(
      '[role="combobox"][aria-label="settingMeasure"]',
    ) as HTMLButtonElement;
    expect(combo).toBeTruthy();
    // standard 既定の現在値ラベルが closed 表示に出る。
    expect(combo.textContent).toContain("settingMeasureStandard");
    handle.destroy();
  });

  it("用紙サイズ Select を本文幅 Select より前に描画する（順序: 用紙サイズ → 本文の幅）", () => {
    const { handle } = mount();
    const paperCombo = paper().querySelector(
      '[role="combobox"][aria-label="settingPaperSize"]',
    ) as HTMLElement;
    const measureCombo = paper().querySelector(
      '[role="combobox"][aria-label="settingMeasure"]',
    ) as HTMLElement;
    expect(paperCombo).toBeTruthy();
    expect(measureCombo).toBeTruthy();
    // 用紙サイズが本文幅より前（DOCUMENT_POSITION_FOLLOWING = 4）に位置する。
    const rel = paperCombo.compareDocumentPosition(measureCombo);
    expect(rel & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    handle.destroy();
  });

  it("paperSize≠off では本文幅 Select を無効化する（用紙幅が優先されるため）", () => {
    const { handle } = mount(); // baseSettings.paperSize = "A4"
    const measureCombo = paper().querySelector(
      '[role="combobox"][aria-label="settingMeasure"]',
    ) as HTMLButtonElement;
    expect(measureCombo.disabled).toBe(true);
    expect(measureCombo.getAttribute("aria-disabled")).toBe("true");
    handle.destroy();
  });

  it("paperSize=off では本文幅 Select を有効化する", () => {
    const offSettings = { ...baseSettings, paperSize: "off" as const };
    const { handle } = mount({ settings: offSettings });
    const measureCombo = paper().querySelector(
      '[role="combobox"][aria-label="settingMeasure"]',
    ) as HTMLButtonElement;
    expect(measureCombo.disabled).toBe(false);
    expect(measureCombo.getAttribute("aria-disabled")).toBe("false");
    handle.destroy();
  });

  it("用紙サイズを off に変更すると本文幅 Select が有効化され、off 以外で無効化される", () => {
    const offSettings = { ...baseSettings, paperSize: "off" as const };
    const { handle } = mount({ settings: offSettings });
    const measureCombo = paper().querySelector(
      '[role="combobox"][aria-label="settingMeasure"]',
    ) as HTMLButtonElement;
    const paperCombo = paper().querySelector(
      '[role="combobox"][aria-label="settingPaperSize"]',
    ) as HTMLButtonElement;
    expect(measureCombo.disabled).toBe(false);
    // 用紙サイズを A4 に変更 → 本文幅は無効化。
    paperCombo.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    const a4Option = Array.from(
      document.body.querySelectorAll('[role="option"]'),
    ).find((o) => o.textContent === "A4") as HTMLElement;
    a4Option.click();
    expect(measureCombo.disabled).toBe(true);
    handle.destroy();
  });

  it("テーブル幅 / ブロック要素の配置 / 単語の折り返しセクションを描画しない（UI 撤去）", () => {
    const { handle } = mount();
    const text = paper().textContent ?? "";
    expect(text).not.toContain("settingTableWidth");
    expect(text).not.toContain("settingTableFull");
    expect(text).not.toContain("settingBlockAlign");
    expect(text).not.toContain("settingWordBreak");
    handle.destroy();
  });

  it("dark mode Switch（themeMode 連携時）で onThemeModeChange を呼ぶ", () => {
    const modes: string[] = [];
    const { handle } = mount({ themeMode: "light", onThemeModeChange: (m) => modes.push(m) });
    const sw = paper().querySelector('input[aria-label="settingDarkMode"]') as HTMLInputElement;
    sw.checked = true;
    sw.dispatchEvent(new Event("change"));
    expect(modes).toEqual(["dark"]);
    handle.destroy();
  });

  it("themeMode 非連携時はダークモード/言語セクションを描画しない", () => {
    const { handle } = mount();
    expect(paper().querySelector('input[aria-label="settingDarkMode"]')).toBeNull();
    expect(paper().textContent).not.toContain("settingLanguage");
    handle.destroy();
  });

  it("paperSize=off では余白セクションを非表示にする", () => {
    const offSettings = { ...baseSettings, paperSize: "off" as const };
    const { handle } = mount({ settings: offSettings });
    // 余白ラベル（settingPaperMargin）を含むセクションが display:none。
    const marginCap = Array.from(paper().querySelectorAll("span,div")).find((e) =>
      e.textContent === "settingPaperMargin",
    );
    const sectionEl = marginCap?.closest('div[style*="margin-bottom"]') as HTMLElement;
    expect(sectionEl.style.display).toBe("none");
    handle.destroy();
  });

  it("reset: confirm=true で onReset を呼ぶ", async () => {
    let reset = 0;
    const { handle } = mount({
      onReset: () => { reset += 1; },
      confirm: () => Promise.resolve(true),
    });
    const resetBtn = Array.from(paper().querySelectorAll("button")).find((b) =>
      b.textContent?.includes("settingReset"),
    ) as HTMLButtonElement;
    resetBtn.click();
    await Promise.resolve();
    await Promise.resolve();
    expect(reset).toBe(1);
    handle.destroy();
  });

  it("reset: confirm=false では onReset を呼ばない", async () => {
    let reset = 0;
    const { handle } = mount({
      onReset: () => { reset += 1; },
      confirm: () => Promise.resolve(false),
    });
    const resetBtn = Array.from(paper().querySelectorAll("button")).find((b) =>
      b.textContent?.includes("settingReset"),
    ) as HTMLButtonElement;
    resetBtn.click();
    await Promise.resolve();
    await Promise.resolve();
    expect(reset).toBe(0);
    handle.destroy();
  });

  it("spell check Switch で onUpdate({spellCheck}) を呼ぶ", () => {
    const { handle, updates } = mount();
    const sw = paper().querySelector('input[aria-label="settingSpellCheck"]') as HTMLInputElement;
    sw.checked = true;
    sw.dispatchEvent(new Event("change"));
    expect(updates).toContainEqual({ spellCheck: true });
    handle.destroy();
  });

  it("destroy で Drawer を body から除去する", () => {
    const { handle } = mount();
    expect(paper()).toBeTruthy();
    handle.destroy();
    expect(document.body.querySelector('[role="dialog"]')).toBeNull();
  });
});

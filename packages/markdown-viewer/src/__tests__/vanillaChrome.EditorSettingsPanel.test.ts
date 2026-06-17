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

  it("テーブル幅 / ブロック要素の配置 / 単語の折り返しセクションを描画しない（UI 撤去）", () => {
    const { handle } = mount();
    const text = paper().textContent ?? "";
    expect(text).not.toContain("settingTableWidth");
    expect(text).not.toContain("settingTableFull");
    expect(text).not.toContain("settingBlockAlign");
    expect(text).not.toContain("settingWordBreak");
    handle.destroy();
  });

  it("ダークモードスイッチは設定パネルに描画しない（サイドツールバーへ移設・言語/プリセットは残る）", () => {
    const { handle } = mount({ themeMode: "light", onThemeModeChange: () => {} });
    // themeMode 連携時でもダークモードスイッチは出さない。
    expect(paper().querySelector('input[aria-label="settingDarkMode"]')).toBeNull();
    // 同セクションの言語トグルは引き続き描画される（移設の影響が言語へ波及しないこと）。
    expect(paper().textContent).toContain("settingLanguage");
    handle.destroy();
  });

  it("themeMode 非連携時は言語/プリセットセクションを描画しない", () => {
    const { handle } = mount();
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

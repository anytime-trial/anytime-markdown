/**
 * 脱React の vanilla DOM「EditorSettingsPanel」ファクトリ
 * （framework-decoupling Phase 3 / G2・追加のみ・本番未配線）。
 *
 * React 原版 `components/EditorSettingsPanel.tsx`（MUI Drawer + Switch/Slider/Select/
 * ToggleButtonGroup）の素 DOM 版。右からスライドする設定パネルで、ダークモード・言語・
 * テーマプリセット・フォントサイズ・テーブル幅・ブロック整列・用紙サイズ/余白・改行・
 * スペルチェック・リセットを操作する。
 *
 * React 版は `open` boolean で表示制御していたが、vanilla 版は ui-vanilla の createDrawer
 * （self-append: 生成時に document.body へ自前マウントし destroy で閉じる）に合わせ、生成時に
 * 開き `destroy()` で閉じる。
 *
 * 変換規約:
 * - React props → opts。`updateSettings` → `onUpdate(patch)`、`resetSettings` → `onReset()`。
 * - `useIsDark` は不要（ui-vanilla は `--am-color-*` CSS 変数でテーマ追従する）。
 * - `useConfirm` → `opts.confirm?: (message) => Promise<boolean>`（未指定時は確認なしで reset）。
 * - `useMarkdownLocale` → `opts.locale`。
 */

import {
  createButton,
  createDivider,
  createDrawer,
  createIconButton,
  createSelect,
  createSlider,
  createSwitch,
  createText,
  createToggleButton,
  createToggleButtonGroup,
  svgIcon,
} from "@anytime-markdown/ui-core";
import {
  PAPER_MARGIN_MAX,
  PAPER_MARGIN_MIN,
  PAPER_MARGIN_STEP,
  PAPER_SIZE_OPTIONS,
} from "../constants/dimensions";
import type { ThemePresetName } from "../constants/themePresets";
import { PRESET_NAMES, THEME_PRESETS } from "../constants/themePresets";
import type { TranslationFn } from "../types";
import type { EditorSettings } from "../editorSettings";
import { MEASURE_PRESETS } from "../utils/measurePreset";

/** measure プリセット → i18n ラベルキー。 */
const MEASURE_LABEL_KEY: Record<EditorSettings["measure"], string> = {
  focus: "settingMeasureFocus",
  standard: "settingMeasureStandard",
  wide: "settingMeasureWide",
  full: "settingMeasureFull",
};

// ui/icons.tsx と同一の Material SVG path（Close / RestartAlt）。
const ICON_CLOSE =
  "M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z";
const ICON_RESTART_ALT =
  "M12 5V2L8 6l4 4V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8";

/** {@link createEditorSettingsPanel} のオプション（React `EditorSettingsPanelProps` の vanilla 置換）。 */
export interface CreateEditorSettingsPanelOptions {
  t: TranslationFn;
  settings: EditorSettings;
  /** 設定変更（部分パッチ）。React `updateSettings` 相当。 */
  onUpdate: (patch: Partial<EditorSettings>) => void;
  /** 設定リセット。React `resetSettings` 相当。 */
  onReset: () => void;
  /** 閉じる要求（背景クリック / ESC / close ボタン）。 */
  onClose: () => void;
  /** 現在ロケール（React `useMarkdownLocale` 相当）。 */
  locale: string;
  /** リセット確認。未指定時は確認なしで即 reset。React `useConfirm` の置換。 */
  confirm?: (message: string) => Promise<boolean>;
  themeMode?: "light" | "dark";
  onThemeModeChange?: (mode: "light" | "dark") => void;
  onLocaleChange?: (locale: string) => void;
  presetName?: ThemePresetName;
  onPresetChange?: (name: ThemePresetName) => void;
}

/** {@link createEditorSettingsPanel} の戻り値。 */
export interface EditorSettingsPanelHandle {
  /** Drawer presentation ルート（createDrawer が自前マウント済み・参照用）。 */
  el: HTMLElement;
  /** Drawer を閉じ、子コントロールの listener を解放する。 */
  destroy: () => void;
}

const SECONDARY = "color:var(--am-color-text-secondary);";
const CAPTION_STYLE = `font-weight:600;${SECONDARY}`;

/** ラベル（caption）+ コントロールの縦積みセクションを作る。 */
function section(label: HTMLElement, control: HTMLElement, marginBottom = 24): HTMLElement {
  const wrap = document.createElement("div");
  wrap.style.cssText = `margin-bottom:${marginBottom}px;`;
  wrap.append(label, control);
  return wrap;
}

/** 下マージン付き区切り線（createDivider は style 非対応のため el に直接付与）。 */
function dividerEl(): HTMLElement {
  const d = createDivider({});
  d.el.style.marginBottom = "16px";
  return d.el;
}

/**
 * vanilla EditorSettingsPanel を生成する。createDrawer の self-append により生成時に開き、
 * `destroy()` で閉じる。設定変更は opts.onUpdate へ部分パッチで通知する。
 */
export function createEditorSettingsPanel(
  opts: CreateEditorSettingsPanelOptions,
): EditorSettingsPanelHandle {
  const { t, settings, onUpdate, onReset, onClose, locale } = opts;
  const handles: Array<{ destroy: () => void }> = [];

  /** caption テキスト要素（block 表示）を作る。 */
  const caption = (key: string): HTMLElement => {
    const h = createText({
      variant: "caption",
      text: t(key),
      style: `display:block;margin-bottom:4px;${CAPTION_STYLE}`,
    });
    handles.push(h);
    return h.el;
  };

  /** exclusive ToggleButtonGroup セクション（value 変更で onUpdate）を作る。 */
  const toggleSection = (
    labelKey: string,
    ariaKey: string,
    value: string,
    items: Array<{ value: string; label: string }>,
    onPick: (v: string) => void,
  ): HTMLElement => {
    const group = createToggleButtonGroup({
      value,
      size: "small",
      ariaLabel: t(ariaKey),
      onChange: (v) => {
        if (typeof v === "string") onPick(v);
      },
    });
    group.el.style.width = "100%";
    for (const item of items) {
      group.register(createToggleButton({ value: item.value, children: item.label }));
    }
    handles.push(group);
    return section(caption(labelKey), group.el);
  };

  const body = document.createElement("div");

  // --- ヘッダー（タイトル + close） ---
  const header = document.createElement("div");
  header.style.cssText = "display:flex;align-items:center;margin-bottom:16px;";
  const title = createText({
    variant: "subtitle1",
    text: t("editorSettings"),
    style: "font-weight:700;flex:1;",
  });
  title.el.id = "settings-panel-title";
  handles.push(title);
  const closeBtn = createIconButton({
    size: "small",
    ariaLabel: t("close"),
    children: svgIcon(ICON_CLOSE, 20),
    onClick: onClose,
  });
  handles.push(closeBtn);
  header.append(title.el, closeBtn.el);
  body.appendChild(header);

  // --- ダークモード / 言語 / テーマプリセット（themeMode 連携時のみ） ---
  if (opts.themeMode !== undefined && opts.onThemeModeChange) {
    const onThemeModeChange = opts.onThemeModeChange;

    const darkRow = document.createElement("div");
    darkRow.style.cssText =
      "margin-bottom:16px;display:flex;align-items:center;justify-content:space-between;";
    const darkCaption = createText({ variant: "caption", text: t("settingDarkMode"), style: CAPTION_STYLE });
    handles.push(darkCaption);
    const darkSwitch = createSwitch({
      checked: opts.themeMode === "dark",
      ariaLabel: t("settingDarkMode"),
      // 旧 React 版 parity: inputProps={{ role: "switch" }}（a11y・e2e の getByRole("switch")）。
      role: "switch",
      onChange: (checked) => onThemeModeChange(checked ? "dark" : "light"),
    });
    handles.push(darkSwitch);
    darkRow.append(darkCaption.el, darkSwitch.el);
    body.appendChild(darkRow);

    // 言語（ja / en）。現在ロケールと同値なら何もしない（React handleLocaleChange と同一）。
    const handleLocale = (next: string): void => {
      if (!next || next === locale) return;
      if (opts.onLocaleChange) {
        opts.onLocaleChange(next);
      } else {
        document.cookie = `NEXT_LOCALE=${next};path=/;max-age=31536000;SameSite=Lax;Secure`;
        globalThis.location.reload();
      }
    };
    body.appendChild(
      toggleSection(
        "settingLanguage",
        "languageSelect",
        locale,
        [
          { value: "ja", label: "日本語" },
          { value: "en", label: "English" },
        ],
        handleLocale,
      ),
    );

    // テーマプリセット（presetName 連携時のみ）。
    if (opts.presetName !== undefined && opts.onPresetChange) {
      const onPresetChange = opts.onPresetChange;
      const presetSelect = createSelect<ThemePresetName>({
        value: opts.presetName,
        ariaLabel: t("settingThemePreset"),
        options: PRESET_NAMES.map((name) => ({ value: name, label: THEME_PRESETS[name].label })),
        onChange: (v) => onPresetChange(v),
      });
      handles.push(presetSelect);
      body.appendChild(section(caption("settingThemePreset"), presetSelect.el, 16));
    }

    body.appendChild(dividerEl());
  }

  // --- フォントサイズ（Slider + px ラベル） ---
  const fontRow = document.createElement("div");
  fontRow.style.cssText = "display:flex;align-items:center;gap:8px;margin-top:4px;";
  const fontLabel = createText({
    variant: "body2",
    text: `${settings.fontSize}px`,
    style: "min-width:40px;text-align:right;font-family:monospace;",
  });
  handles.push(fontLabel);
  const fontSlider = createSlider({
    value: settings.fontSize,
    min: 12,
    max: 24,
    step: 1,
    size: "small",
    ariaLabel: t("settingFontSize"),
    onChange: (v) => {
      onUpdate({ fontSize: v });
      fontLabel.update({ text: `${v}px` });
    },
  });
  handles.push(fontSlider);
  fontRow.append(fontSlider.el, fontLabel.el);
  const fontCaptionWrap = document.createElement("div");
  fontCaptionWrap.style.cssText = "margin-bottom:24px;";
  const fontCaption = createText({ variant: "caption", text: t("settingFontSize"), style: CAPTION_STYLE });
  handles.push(fontCaption);
  fontCaptionWrap.append(fontCaption.el, fontRow);
  body.appendChild(fontCaptionWrap);

  body.appendChild(dividerEl());

  // --- 本文幅（measure プリセット・Select）。DOM 追加は用紙サイズの後（順序: 用紙サイズ → 本文の幅）。
  //     用紙サイズが off 以外のときは本文幅(measure)が用紙幅に CSS で上書きされ無反応になるため、
  //     off のときのみ操作可能にする（editorContentCss の
  //     [data-paper-size]:not([..="off"]) .tiptap 規則が measure を上書きする）。 ---
  const measureSelect = createSelect<EditorSettings["measure"]>({
    value: settings.measure,
    ariaLabel: t("settingMeasure"),
    options: MEASURE_PRESETS.map((preset) => ({
      value: preset,
      label: t(MEASURE_LABEL_KEY[preset]),
    })),
    onChange: (v) => onUpdate({ measure: v }),
  });
  handles.push(measureSelect);
  /** 用紙サイズ off のときのみ本文幅を操作可能にする（無効時は視覚・a11y 状態も同期）。 */
  const setMeasureEnabled = (enabled: boolean): void => {
    measureSelect.el.disabled = !enabled;
    measureSelect.el.style.opacity = enabled ? "1" : "0.5";
    measureSelect.el.style.cursor = enabled ? "pointer" : "not-allowed";
    measureSelect.el.setAttribute("aria-disabled", enabled ? "false" : "true");
  };
  const measureSectionEl = section(caption("settingMeasure"), measureSelect.el);

  // テーブル幅（既定: auto）/ ブロック要素の配置（既定: left）の設定は UI から撤去した。
  // 値は EditorSettings の既定（tableWidth:"auto" / blockAlign:"left"）に固定される。

  // --- 用紙サイズ（Select）+ 余白（Slider・paperSize !== off のときのみ表示） ---
  const paperSelect = createSelect<EditorSettings["paperSize"]>({
    value: settings.paperSize,
    ariaLabel: t("settingPaperSize"),
    options: PAPER_SIZE_OPTIONS.map((size) => ({
      value: size,
      label: size === "off" ? t("settingPaperSizeOff") : size,
    })),
    onChange: (v) => {
      onUpdate({ paperSize: v });
      marginSection.style.display = v === "off" ? "none" : "";
      setMeasureEnabled(v === "off");
    },
  });
  handles.push(paperSelect);
  body.appendChild(section(caption("settingPaperSize"), paperSelect.el));

  // 余白セクション（初期表示は paperSize に従う）。
  const marginRow = document.createElement("div");
  marginRow.style.cssText = "display:flex;align-items:center;gap:8px;margin-top:4px;";
  const marginLabel = createText({
    variant: "body2",
    text: `${settings.paperMargin}mm`,
    style: "min-width:48px;text-align:right;font-family:monospace;",
  });
  handles.push(marginLabel);
  const marginSlider = createSlider({
    value: settings.paperMargin,
    min: PAPER_MARGIN_MIN,
    max: PAPER_MARGIN_MAX,
    step: PAPER_MARGIN_STEP,
    size: "small",
    ariaLabel: t("settingPaperMargin"),
    onChange: (v) => {
      onUpdate({ paperMargin: v });
      marginLabel.update({ text: `${v}mm` });
    },
  });
  handles.push(marginSlider);
  marginRow.append(marginSlider.el, marginLabel.el);
  const marginSection = document.createElement("div");
  marginSection.style.cssText = "margin-bottom:24px;";
  const marginCaption = createText({ variant: "caption", text: t("settingPaperMargin"), style: CAPTION_STYLE });
  handles.push(marginCaption);
  marginSection.append(marginCaption.el, marginRow);
  marginSection.style.display = settings.paperSize === "off" ? "none" : "";
  body.appendChild(marginSection);

  // 本文幅セクションを用紙サイズの後に追加し、初期の有効/無効状態を反映する。
  setMeasureEnabled(settings.paperSize === "off");
  body.appendChild(measureSectionEl);

  body.appendChild(dividerEl());

  // 単語の折り返し（既定: keep-all）の設定は UI から撤去した。
  // 値は EditorSettings の既定（wordBreak:"keep-all"）に固定される。
  // スペルチェックの設定も撤去した。エディタ DOM 側で常に無効化される。

  // --- リセット（confirm → onReset） ---
  const resetBtn = createButton({
    variant: "outlined",
    size: "small",
    label: t("settingReset"),
    startIcon: svgIcon(ICON_RESTART_ALT, 18),
    onClick: () => {
      void handleReset();
    },
  });
  resetBtn.el.style.width = "100%";
  handles.push(resetBtn);
  const handleReset = async (): Promise<void> => {
    if (opts.confirm) {
      let ok = false;
      try {
        ok = await opts.confirm(t("resetSettingsConfirm"));
      } catch (error) {
        console.warn("[EditorSettingsPanel] reset confirm rejected", error);
        return;
      }
      if (!ok) return;
    }
    onReset();
  };
  body.appendChild(resetBtn.el);

  // --- Drawer（右・width 320・self-append） ---
  const drawer = createDrawer({
    anchor: "right",
    width: 320,
    onClose,
    paperStyle: { padding: "16px" },
    labelledBy: "settings-panel-title",
    children: body,
  });

  let destroyed = false;
  return {
    el: drawer.el,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      for (const h of handles) h.destroy();
      drawer.destroy();
    },
  };
}

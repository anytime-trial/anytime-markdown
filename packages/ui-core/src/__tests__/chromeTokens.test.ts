import {
  alpha,
  applyChromeColorTokens,
  applyChromeDimensionTokens,
  applyChromeTokens,
  type ChromeColorPalette,
} from "../chromeTokens";

const DARK: ChromeColorPalette = {
  divider: "rgba(255,255,255,0.12)",
  textPrimary: "rgba(255,255,255,0.87)",
  textSecondary: "rgba(255,255,255,0.60)",
  bgPaper: "#121212",
  bgDefault: "#0D1117",
  actionHover: "rgba(255,255,255,0.08)",
  actionSelected: "rgba(255,255,255,0.16)",
  actionActive: "rgba(255,255,255,0.56)",
  primaryMain: "#90CAF9",
  primaryContrast: "rgba(0,0,0,0.87)",
  errorMain: "#F44336",
  successMain: "#66BB6A",
  warningMain: "#FFA726",
};

function freshRoot(): HTMLElement {
  const el = document.createElement("div");
  document.body.appendChild(el);
  return el;
}

describe("alpha", () => {
  it("6 桁 hex に不透明度を適用する", () => {
    expect(alpha("#90CAF9", 0.38)).toBe("rgba(144, 202, 249, 0.38)");
  });

  it("3 桁 hex を展開して扱う", () => {
    expect(alpha("#fff", 0.5)).toBe("rgba(255, 255, 255, 0.5)");
  });

  it("8 桁 hex の既存アルファと乗算する", () => {
    expect(alpha("#00000080", 0.5)).toBe("rgba(0, 0, 0, 0.251)");
  });

  it("rgba の既存アルファと乗算する", () => {
    expect(alpha("rgba(255,255,255,0.8)", 0.5)).toBe("rgba(255, 255, 255, 0.4)");
  });

  it("解釈できない入力はそのまま返す", () => {
    expect(alpha("currentColor", 0.5)).toBe("currentColor");
  });

  it("不透明度は 0..1 にクランプする", () => {
    expect(alpha("#000000", 5)).toBe("rgba(0, 0, 0, 1)");
    expect(alpha("#000000", -1)).toBe("rgba(0, 0, 0, 0)");
  });
});

describe("applyChromeColorTokens", () => {
  it("パレットの値をそのまま対応トークンへ書く", () => {
    const root = freshRoot();
    applyChromeColorTokens(root, DARK, true);
    expect(root.style.getPropertyValue("--am-color-divider")).toBe(DARK.divider);
    expect(root.style.getPropertyValue("--am-color-text-primary")).toBe(DARK.textPrimary);
    expect(root.style.getPropertyValue("--am-color-bg-paper")).toBe(DARK.bgPaper);
    expect(root.style.getPropertyValue("--am-color-primary-main")).toBe(DARK.primaryMain);
    expect(root.style.getPropertyValue("--am-color-warning-main")).toBe(DARK.warningMain);
  });

  it("slider rail は primary-main の 0.38 で導出する", () => {
    const root = freshRoot();
    applyChromeColorTokens(root, DARK, true);
    expect(root.style.getPropertyValue("--am-color-slider-rail")).toBe("rgba(144, 202, 249, 0.38)");
  });

  it("skeleton 地色は text-primary から dark 0.13 / light 0.11 で導出する", () => {
    const dark = freshRoot();
    applyChromeColorTokens(dark, DARK, true);
    expect(dark.style.getPropertyValue("--am-color-skeleton-bg")).toBe(
      alpha(DARK.textPrimary, 0.13),
    );

    const light = freshRoot();
    applyChromeColorTokens(light, DARK, false);
    expect(light.style.getPropertyValue("--am-color-skeleton-bg")).toBe(
      alpha(DARK.textPrimary, 0.11),
    );
  });

  it("isDark で切り替わる派生トークンが dark/light で異なる", () => {
    const dark = freshRoot();
    const light = freshRoot();
    applyChromeColorTokens(dark, DARK, true);
    applyChromeColorTokens(light, DARK, false);

    for (const name of [
      "--am-overlay-elevation-16",
      "--am-color-input-border",
      "--am-color-switch-thumb-off",
      "--am-color-switch-track-off",
      "--am-switch-track-opacity-off",
      "--am-color-tooltip-bg",
    ]) {
      expect(dark.style.getPropertyValue(name)).not.toBe(light.style.getPropertyValue(name));
    }
  });

  it("light では elevation overlay を none にする", () => {
    const root = freshRoot();
    applyChromeColorTokens(root, DARK, false);
    expect(root.style.getPropertyValue("--am-overlay-elevation-16")).toBe("none");
  });

  it("tooltip の文字色はモード非依存", () => {
    const dark = freshRoot();
    const light = freshRoot();
    applyChromeColorTokens(dark, DARK, true);
    applyChromeColorTokens(light, DARK, false);
    expect(dark.style.getPropertyValue("--am-color-tooltip-text")).toBe("rgba(255,255,255,0.95)");
    expect(light.style.getPropertyValue("--am-color-tooltip-text")).toBe("rgba(255,255,255,0.95)");
  });
});

describe("applyChromeDimensionTokens", () => {
  it("寸法・モーショントークンを書く", () => {
    const root = freshRoot();
    applyChromeDimensionTokens(root);
    expect(root.style.getPropertyValue("--am-space-1")).toBe("4px");
    expect(root.style.getPropertyValue("--am-radius-md")).toBe("8px");
    expect(root.style.getPropertyValue("--am-duration-fast")).toBe("150ms");
    expect(root.style.getPropertyValue("--am-ease-standard")).toBe("cubic-bezier(0.4, 0, 0.2, 1)");
    expect(root.style.getPropertyValue("--am-font-size-dialog-header")).toBe("0.875rem");
  });

  it("モード非依存（isDark を取らない）", () => {
    const a = freshRoot();
    const b = freshRoot();
    applyChromeDimensionTokens(a);
    applyChromeDimensionTokens(b);
    expect(a.style.cssText).toBe(b.style.cssText);
  });
});

describe("applyChromeTokens", () => {
  it("色と寸法の両方を適用する", () => {
    const root = freshRoot();
    applyChromeTokens(root, DARK, true);
    expect(root.style.getPropertyValue("--am-color-bg-paper")).toBe(DARK.bgPaper);
    expect(root.style.getPropertyValue("--am-space-2")).toBe("8px");
  });

  it("同じ root へ dark → light と適用すると light の値で上書きされる", () => {
    const root = freshRoot();
    applyChromeTokens(root, DARK, true);
    applyChromeTokens(root, DARK, false);
    expect(root.style.getPropertyValue("--am-overlay-elevation-16")).toBe("none");
    expect(root.style.getPropertyValue("--am-color-input-border")).toBe("rgba(0,0,0,0.23)");
  });
});

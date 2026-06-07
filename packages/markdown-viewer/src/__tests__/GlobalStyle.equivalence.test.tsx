/**
 * T5b 等価検証: 旧 @mui/material/GlobalStyles が注入する CSS と、
 * 新 ui/GlobalStyle(serializeGlobalStyles) が生成する CSS が一致することを保証する。
 *
 * 両者を jsdom CSSOM で再パースし cssText を比較することで、
 * 表記差を吸収しつつ「規則・プロパティ・値・順序」の同一性を検証する。
 */
import MuiGlobalStyles from "@mui/material/GlobalStyles";
import { render, cleanup } from "@testing-library/react";

import { serializeGlobalStyles } from "../ui/GlobalStyle";
import type { StyleObject } from "../ui/GlobalStyle";
import { getEditorPaperSx } from "../styles/editorStyles";
import { getMergeTiptapStyles } from "../components/mergeTiptapStyles";
import { printStyles } from "../styles/printStyles";
import type { EditorSettings } from "../useEditorSettings";

const defaultSettings: EditorSettings = {
  fontSize: 16, lineHeight: 1.8, tableWidth: "auto", editorBg: "white",
  spellCheck: false, paperSize: "off", paperMargin: 20,
  darkBgColor: "", lightBgColor: "", darkTextColor: "", lightTextColor: "",
  blockAlign: "left", wordBreak: "keep-all",
} as EditorSettings;

function clearHead(): void {
  for (const s of Array.from(document.querySelectorAll("style"))) s.remove();
}

/** 現在 document に注入されている全 style の cssRules を cssText 配列で収集する。 */
function collectRules(): string[] {
  const parts: string[] = [];
  for (const el of Array.from(document.querySelectorAll("style"))) {
    const sheet = el.sheet;
    if (!sheet) continue;
    for (const rule of Array.from(sheet.cssRules)) parts.push(rule.cssText);
  }
  return parts;
}

/** 比較用に正規化（空白を畳む）。 */
function norm(rules: string[]): string {
  return rules.map((r) => r.replace(/\s+/g, " ").trim()).join("\n");
}

function muiCss(styles: StyleObject): string {
  clearHead();
  render(<MuiGlobalStyles styles={styles} />);
  const result = norm(collectRules());
  cleanup();
  return result;
}

function ownCss(styles: StyleObject): string {
  clearHead();
  const el = document.createElement("style");
  el.textContent = serializeGlobalStyles(styles);
  document.head.appendChild(el);
  const result = norm(collectRules());
  el.remove();
  return result;
}

describe("GlobalStyle equivalence with @mui GlobalStyles", () => {
  const cases: Array<[string, StyleObject]> = [
    [
      "editor tiptap (light, paperSize off)",
      { "#md-editor-content .tiptap": (getEditorPaperSx(false, defaultSettings, 600) as StyleObject)["& .tiptap"] as StyleObject },
    ],
    [
      "editor tiptap (dark, paperSize off)",
      { "#md-editor-content .tiptap": (getEditorPaperSx(true, defaultSettings, 600) as StyleObject)["& .tiptap"] as StyleObject },
    ],
    [
      "editor tiptap (light, A4, blockAlign center)",
      {
        "#md-editor-content .tiptap": (getEditorPaperSx(
          false,
          { ...defaultSettings, paperSize: "A4", blockAlign: "center" },
          600,
          { readonlyMode: true },
        ) as StyleObject)["& .tiptap"] as StyleObject,
      },
    ],
    [
      "merge tiptap (light, hover labels)",
      getMergeTiptapStyles(false, defaultSettings, { showHoverLabels: true }) as StyleObject,
    ],
    [
      "merge tiptap (dark, no hover labels)",
      getMergeTiptapStyles(true, defaultSettings, { showHoverLabels: false }) as StyleObject,
    ],
    ["print styles (@page + @media print)", printStyles],
  ];

  test.each(cases)("%s", (_name, styles) => {
    expect(ownCss(styles)).toBe(muiCss(styles));
  });
});

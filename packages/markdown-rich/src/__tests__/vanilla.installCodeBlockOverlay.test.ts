/**
 * vanilla/installCodeBlockOverlay.ts のスモークテスト。
 *
 * chrome（選択追従ツールバー）と各ダイアログは個別テスト済みのため、本テストは
 * installer の装着 / 破棄と editState 連携の生存確認に絞る。jsdom のため配置計算・
 * mermaid 実レンダは対象外（seam は安全に no-op する）。
 */

// lowlight（ESM）は jest が解析できないため最小 mock（既存 vanilla dialog テストと同形）。
jest.mock("lowlight", () => ({
  common: {},
  createLowlight: () => ({
    listLanguages: () => [],
    highlight: (_lang: string, code: string) => ({ children: [], code }),
  }),
}));

// markdown-viewer barrel は heavy なため、必要サブモジュールの実体 + ダイアログが読む定数のみ注入
// （codeBlockChrome.test.ts / vanilla.createMermaidEditDialog.test.ts と同パターン）。
jest.mock("@anytime-markdown/markdown-viewer", () => ({
  ...jest.requireActual("@anytime-markdown/markdown-viewer/src/chrome/blockChrome"),
  ...jest.requireActual("@anytime-markdown/markdown-viewer/src/chrome/vanillaToolbar"),
  ...jest.requireActual("@anytime-markdown/markdown-viewer/src/utils/embedInfoString"),
  ...jest.requireActual("@anytime-markdown/markdown-viewer/src/ui-vanilla"),
  PREVIEW_MAX_HEIGHT: 400,
  getDivider: () => "#ccc",
  getEditDialogBg: () => "#fff",
  getTextDisabled: () => "#888",
  getTextPrimary: () => "#000",
  getTextSecondary: () => "#555",
  getActionHover: () => "rgba(0,0,0,0.04)",
  DEFAULT_DARK_BG: "#1e1e1e",
  DEFAULT_LIGHT_BG: "#ffffff",
  MERMAID_SAMPLES: [],
  PLANTUML_SAMPLES: [],
  MATH_SAMPLES: [],
  CODE_HELLO_SAMPLES: {},
  FS_CODE_INITIAL_WIDTH: 500,
  FS_CODE_MIN_WIDTH: 120,
  FS_PANEL_HEADER_FONT_SIZE: "0.75rem",
  CHIP_FONT_SIZE: "0.75rem",
  FS_CHIP_HEIGHT: 26,
  FS_ZOOM_LABEL_WIDTH: 36,
  SMALL_CAPTION_FONT_SIZE: "0.75rem",
}));

import { Editor } from "@anytime-markdown/markdown-core";
import { StarterKit } from "@anytime-markdown/markdown-starter-kit";

import { installCodeBlockOverlay } from "../vanilla/installCodeBlockOverlay";

const t = (key: string): string => key;

function makeEditor(content: string): Editor {
  const element = document.createElement("div");
  document.body.appendChild(element);
  return new Editor({ element, extensions: [StarterKit], content });
}

describe("installCodeBlockOverlay", () => {
  it("装着・破棄が例外なく行え、chrome の購読が解放される", () => {
    const editor = makeEditor("<pre><code>const a = 1;</code></pre>");
    const dispose = installCodeBlockOverlay(editor, { t });
    expect(typeof dispose).toBe("function");
    dispose();
    editor.destroy();
  });

  it("getIsDark / getHideGraph / getStyle が未指定でも既定値で動作する", () => {
    const editor = makeEditor("<p>no codeblock</p>");
    const dispose = installCodeBlockOverlay(editor, {
      t,
      getIsDark: () => true,
      getHideGraph: () => true,
      getStyle: () => ({ editorBg: "white", fontSize: 14, lineHeight: 1.5 }),
    });
    dispose();
    editor.destroy();
  });
});

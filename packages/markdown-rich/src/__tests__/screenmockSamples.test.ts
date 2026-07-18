/**
 * screenmock ブロックのサンプル（SCREENMOCK_SAMPLES）の内容と、編集ダイアログへの配線の
 * リグレッションテスト。
 *
 * 修正前は installCodeBlockOverlay の screenmock 分岐が customSamples を渡しておらず、
 * createCodeBlockEditDialog のフォールバック（言語別 Hello World = CODE_HELLO_SAMPLES）が
 * 表示されていた。ここでは「サンプルが画面モックであること」と「screenmock ダイアログの
 * サンプルパネルが言語サンプルでないこと」を外部から観測できる形で固定する。
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
// （vanilla.installCodeBlockOverlay.compare.test.ts と同パターン）。SCREENMOCK_SAMPLES は
// 実データを注入し、配線が生きているかを実物で確認する。
jest.mock("@anytime-markdown/markdown-viewer", () => ({
  ...jest.requireActual("@anytime-markdown/markdown-viewer/src/chrome/blockChrome"),
  ...jest.requireActual("@anytime-markdown/markdown-viewer/src/chrome/vanillaToolbar"),
  ...jest.requireActual("@anytime-markdown/markdown-viewer/src/utils/embedInfoString"),
  ...jest.requireActual("@anytime-markdown/ui-core"),
  SCREENMOCK_SAMPLES: jest.requireActual("@anytime-markdown/markdown-viewer/src/constants/samples")
    .SCREENMOCK_SAMPLES,
  PREVIEW_MAX_HEIGHT: 400,
  getDivider: () => "#ccc",
  getHljsCssVars: () => ({}),
  getHljsTokenCss: () => "",
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

// chrome は capture モック。onSelect / onEdit をテストから直接駆動する。
interface ChromeCallbacks {
  onSelect: (pos: number, node: unknown) => void;
  onEdit: () => void;
}
let chromeCb: ChromeCallbacks | null = null;
jest.mock("../components/codeblock/codeBlockChrome", () => ({
  createCodeBlockChrome: (_editor: unknown, cb: ChromeCallbacks) => {
    chromeCb = cb;
    return () => {
      chromeCb = null;
    };
  },
}));

import { Editor } from "@anytime-markdown/markdown-core";
import type { Node as PMNode } from "@anytime-markdown/markdown-pm/model";
import { StarterKit } from "@anytime-markdown/markdown-starter-kit";
import { SCREENMOCK_SAMPLES } from "@anytime-markdown/markdown-viewer/src/constants/samples";

import { CODE_HELLO_SAMPLES } from "../constants/codeHelloSamples";
import { parseScreenmock } from "../vanilla/screenmockPreview";
import { installCodeBlockOverlay } from "../vanilla/installCodeBlockOverlay";

import jaMessages from "@anytime-markdown/markdown-viewer/src/i18n/ja.json";
import enMessages from "@anytime-markdown/markdown-viewer/src/i18n/en.json";

const t = (key: string): string => key;

function makeEditor(content: string): Editor {
  const element = document.createElement("div");
  document.body.appendChild(element);
  return new Editor({ element, extensions: [StarterKit], content });
}

function findCodeBlock(editor: Editor): { pos: number; node: PMNode } {
  let found: { pos: number; node: PMNode } | null = null;
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === "codeBlock" && !found) found = { pos, node };
  });
  if (!found) throw new Error("codeBlock not found");
  return found;
}

function flatMessages(messages: unknown): Record<string, string> {
  const flat: Record<string, string> = {};
  const walk = (value: unknown): void => {
    if (!value || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (typeof child === "string") flat[key] = child;
      else walk(child);
    }
  };
  walk(messages);
  return flat;
}

describe("SCREENMOCK_SAMPLES", () => {
  it("すべてのサンプルが画面モック（1 画面以上・sm- 部品語彙）として解釈できる", () => {
    expect(SCREENMOCK_SAMPLES.length).toBeGreaterThanOrEqual(5);
    for (const sample of SCREENMOCK_SAMPLES) {
      const screens = parseScreenmock(sample.code);
      expect(screens.length).toBeGreaterThanOrEqual(1);
      for (const screen of screens) {
        expect(screen.title.trim()).not.toBe("");
        expect(screen.html).toContain('class="sm-');
      }
    }
  });

  it("画面遷移（#id リンク）を含み、リンク先が同一サンプル内の画面 id と一致する", () => {
    const withTransition = SCREENMOCK_SAMPLES.filter((sample) => {
      const screens = parseScreenmock(sample.code);
      if (screens.length < 2) return false;
      const ids = new Set(screens.map((screen) => screen.id));
      return screens.some((screen) =>
        [...screen.html.matchAll(/href="#([^"]+)"/g)].some((m) => ids.has(m[1])),
      );
    });
    expect(withTransition.length).toBeGreaterThanOrEqual(1);
  });

  it("言語別 Hello World サンプルを流用していない", () => {
    const helloCodes = new Set(Object.values(CODE_HELLO_SAMPLES));
    for (const sample of SCREENMOCK_SAMPLES) {
      expect(helloCodes.has(sample.code)).toBe(false);
    }
  });

  it("i18nKey が ja / en 双方に定義されている", () => {
    const ja = flatMessages(jaMessages);
    const en = flatMessages(enMessages);
    for (const sample of SCREENMOCK_SAMPLES) {
      expect(ja[sample.i18nKey]).toBeTruthy();
      expect(en[sample.i18nKey]).toBeTruthy();
    }
  });
});

describe("screenmock 編集ダイアログのサンプルパネル", () => {
  let editor: Editor;
  let dispose: (() => void) | null = null;

  beforeEach(() => {
    editor = makeEditor('<pre><code class="language-screenmock">---\nid: a\n---\n<div class="sm-screen">a</div></code></pre>');
  });

  afterEach(() => {
    dispose?.();
    dispose = null;
    editor.destroy();
    document.body.replaceChildren();
  });

  it("言語サンプルではなく screenmock の画面サンプルを表示する", () => {
    dispose = installCodeBlockOverlay(editor, { t });
    const { pos, node } = findCodeBlock(editor);
    chromeCb?.onSelect(pos, node);
    chromeCb?.onEdit();

    const chipLabels = Array.from(document.querySelectorAll(".am-sp-chip")).map(
      (chip) => chip.textContent ?? "",
    );
    expect(chipLabels.length).toBe(SCREENMOCK_SAMPLES.length);
    // t は恒等関数なので chip のラベルは i18nKey がそのまま出る。
    expect(chipLabels).toEqual(SCREENMOCK_SAMPLES.map((sample) => sample.i18nKey));
    for (const language of Object.keys(CODE_HELLO_SAMPLES)) {
      expect(chipLabels).not.toContain(language);
    }
  });
});

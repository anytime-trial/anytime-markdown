/**
 * 適用（Apply）後にダイアログを開き直したとき、最新のブロック本文が表示されることの回帰テスト。
 *
 * chrome の選択トラッカーは pos が変わったときしか onSelect を再発火しないため、同一位置の
 * 本文差し替え（Apply）ではオーバーレイが持つ node スナップショットが古いままになる。
 * スナップショットを真実として使うと、再オープン時に適用前のテキストが表示される。
 */
jest.mock("lowlight", () => ({
  common: {},
  createLowlight: () => ({ listLanguages: () => [], highlight: (_l: string, code: string) => ({ children: [], code }) }),
}));

jest.mock("@anytime-markdown/markdown-viewer", () => ({
  ...jest.requireActual("@anytime-markdown/markdown-viewer/src/chrome/blockChrome"),
  ...jest.requireActual("@anytime-markdown/markdown-viewer/src/chrome/vanillaToolbar"),
  ...jest.requireActual("@anytime-markdown/markdown-viewer/src/utils/embedInfoString"),
  ...jest.requireActual("@anytime-markdown/ui-core"),
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
  SCREENMOCK_SAMPLES: [],
  CODE_HELLO_SAMPLES: {},
  FS_CODE_INITIAL_WIDTH: 500,
  FS_CODE_MIN_WIDTH: 120,
  FS_PANEL_HEADER_FONT_SIZE: "0.75rem",
  CHIP_FONT_SIZE: "0.75rem",
  FS_CHIP_HEIGHT: 26,
  FS_ZOOM_LABEL_WIDTH: 36,
  SMALL_CAPTION_FONT_SIZE: "0.75rem",
}));

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

import { installCodeBlockOverlay } from "../vanilla/installCodeBlockOverlay";

const t = (key: string): string => key;

function findCodeBlock(editor: Editor): { pos: number; node: PMNode } {
  let found: { pos: number; node: PMNode } | null = null;
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === "codeBlock" && !found) found = { pos, node };
  });
  if (!found) throw new Error("codeBlock not found");
  return found;
}

it("適用後に再オープンしたダイアログが最新のテキストを表示する", () => {
  const element = document.createElement("div");
  document.body.appendChild(element);
  const editor = new Editor({
    element,
    extensions: [StarterKit],
    content: '<pre><code class="language-screenmock">&lt;div class="sm-screen"&gt;a&lt;/div&gt;</code></pre>',
  });
  const dispose = installCodeBlockOverlay(editor, { t });

  // 1 回目: 選択 → 編集 → テキスト変更 → 適用
  const first = findCodeBlock(editor);
  chromeCb?.onSelect(first.pos, first.node);
  chromeCb?.onEdit();
  const textarea = document.querySelector("textarea") as HTMLTextAreaElement;
  textarea.value = '<div class="sm-screen" style="position: relative;">a</div>';
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
  const applyButton = Array.from(document.querySelectorAll("button")).find((b) =>
    (b.textContent ?? "").includes("apply"),
  );
  applyButton?.click();

  const docText = editor.state.doc.textContent;

  // 2 回目: 実機と同じく chrome は pos 不変では onSelect を再発火しない。
  chromeCb?.onEdit();
  const reopened = document.querySelector("textarea") as HTMLTextAreaElement | null;

  expect(docText).toContain("position: relative");
  expect(reopened?.value).toContain("position: relative");

  dispose();
  editor.destroy();
  document.body.replaceChildren();
});

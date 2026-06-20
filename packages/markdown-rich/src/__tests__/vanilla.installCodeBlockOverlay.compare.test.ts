/**
 * installCodeBlockOverlay の compare（merge）モード分岐の統合テスト
 * （2026-06-10 レビュー指摘 3: 旧 useBlockMergeCompare の両エディタ適用の復元）。
 *
 * merge ビューが開いている（getMergeEditors() が左右エディタを返す）状態で編集 intent を
 * 受けると、通常の編集ダイアログではなく diff ビューを開き、編集・マージの結果を
 * 両エディタの対応コードブロックへ適用することを検証する。
 * chrome（選択追従）は個別テスト済みのため capture モックで onSelect / onEdit を直接駆動する。
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
// （vanilla.installCodeBlockOverlay.test.ts と同パターン）。
jest.mock("@anytime-markdown/markdown-viewer", () => ({
  ...jest.requireActual("@anytime-markdown/markdown-viewer/src/chrome/blockChrome"),
  ...jest.requireActual("@anytime-markdown/markdown-viewer/src/chrome/vanillaToolbar"),
  ...jest.requireActual("@anytime-markdown/markdown-viewer/src/utils/embedInfoString"),
  ...jest.requireActual("@anytime-markdown/ui-core"),
  PREVIEW_MAX_HEIGHT: 400,
  getDivider: () => "#ccc",
  getHljsCssVars: () => ({}),
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
import { setMergeEditors } from "@anytime-markdown/markdown-viewer/src/contexts/MergeEditorsContext";

import { installCodeBlockOverlay } from "../vanilla/installCodeBlockOverlay";

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

function openEditOnBlock(editor: Editor): void {
  const { pos, node } = findCodeBlock(editor);
  chromeCb?.onSelect(pos, node);
  chromeCb?.onEdit();
}

describe("installCodeBlockOverlay compare（merge）モード", () => {
  let editor: Editor;
  let leftEditor: Editor;
  let dispose: (() => void) | null = null;

  beforeEach(() => {
    editor = makeEditor('<pre><code class="language-js">a\nb</code></pre>');
    leftEditor = makeEditor('<pre><code class="language-js">a\nc</code></pre>');
  });

  afterEach(() => {
    dispose?.();
    dispose = null;
    setMergeEditors(null);
    editor.destroy();
    leftEditor.destroy();
    document.body.replaceChildren();
  });

  it("merge ビュー中の編集 intent では diff ビュー（textarea 2 枚）が開く", () => {
    setMergeEditors({ rightEditor: editor, leftEditor });
    dispose = installCodeBlockOverlay(editor, { t });
    openEditOnBlock(editor);

    const tas = document.querySelectorAll("textarea");
    expect(tas.length).toBe(2);
    // 左 = 比較側（leftEditor のコード）・readOnly。
    expect((tas[0] as HTMLTextAreaElement).value).toBe("a\nc");
    expect((tas[0] as HTMLTextAreaElement).readOnly).toBe(true);
    // 右 = 編集側（このエディタのコード）。
    expect((tas[1] as HTMLTextAreaElement).value).toBe("a\nb");
  });

  it("右ペインの編集が編集側エディタへ適用され、比較側は保たれる", () => {
    setMergeEditors({ rightEditor: editor, leftEditor });
    dispose = installCodeBlockOverlay(editor, { t });
    openEditOnBlock(editor);

    const right = document.querySelectorAll("textarea")[1] as HTMLTextAreaElement;
    right.value = "a\nz";
    right.dispatchEvent(new Event("input"));

    expect(editor.state.doc.textContent).toBe("a\nz");
    expect(leftEditor.state.doc.textContent).toBe("a\nc");
  });

  it("ブロックマージ（比較側→編集側）が両エディタへ整合的に適用される", () => {
    setMergeEditors({ rightEditor: editor, leftEditor });
    dispose = installCodeBlockOverlay(editor, { t });
    openEditOnBlock(editor);

    const btn = document.querySelector<HTMLButtonElement>('button[aria-label="mergeLeftToRight"]');
    expect(btn).toBeTruthy();
    btn?.click();

    expect(editor.state.doc.textContent).toBe("a\nc");
    expect(leftEditor.state.doc.textContent).toBe("a\nc");
  });

  it("merge ビューが開いていなければ通常の編集ダイアログ（textarea 1 枚）へフォールバックする", () => {
    setMergeEditors(null);
    dispose = installCodeBlockOverlay(editor, { t });
    openEditOnBlock(editor);

    const tas = document.querySelectorAll("textarea");
    expect(tas.length).toBe(1);
  });

  it("counterpart が見つからない場合（比較側に同言語ブロックなし）は通常ダイアログへフォールバックする", () => {
    const other = makeEditor("<p>no codeblock</p>");
    setMergeEditors({ rightEditor: editor, leftEditor: other });
    dispose = installCodeBlockOverlay(editor, { t });
    openEditOnBlock(editor);

    const tas = document.querySelectorAll("textarea");
    expect(tas.length).toBe(1);
    other.destroy();
  });
});

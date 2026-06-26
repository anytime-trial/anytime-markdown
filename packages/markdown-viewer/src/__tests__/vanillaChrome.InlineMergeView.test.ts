/**
 * components-vanilla/InlineMergeView.ts の素 DOM ファクトリのユニットテスト。
 *
 * React/JSX を使わず素の DOM API で検証する。左パネルの readOnly エディタは本ファクトリが
 * `new Editor`（markdown-core）で生成するため、右エディタも実 Editor を渡す。
 *
 * jsdom の制約により実レイアウト（scroll / 行高さ / ResizeObserver 実挙動）は検証しない。
 * 検証対象: 生成/destroy・sourceMode 切替・compareContent 適用で diff 行が両パネルに供給される・
 * onUndoRedoChange の発火。
 */

import { Editor } from "@anytime-markdown/markdown-core";

// buildEditorExtensions は lowlight（ESM）を間接 import するため、軽量な実拡張に差し替える。
// 内部 leftEditor が必要とする diff/align コマンドは DiffHighlight / BlockAlignSpacers が供給する。
jest.mock("../buildEditorExtensions", () => ({
  buildEditorExtensions: () => [
    jest.requireActual("@anytime-markdown/markdown-starter-kit").default,
    jest.requireActual("../extensions/diffHighlight").DiffHighlight,
    jest.requireActual("../extensions/blockAlignSpacers").BlockAlignSpacers,
    jest.requireActual("../extensions/reviewModeExtension").ReviewModeExtension,
  ],
}));

// StarterKit には tiptap-markdown storage が無いため、左エディタの markdown 往復系を
// no-op / identity に差し替える（diff 供給ロジックの検証には不要）。
jest.mock("../utils/editorContentLoader", () => ({
  ...jest.requireActual("../utils/editorContentLoader"),
  applyMarkdownToEditor: () => ({ frontmatter: null, comments: new Map(), body: "" }),
}));
jest.mock("../utils/mergeContentSync", () => ({
  ...jest.requireActual("../utils/mergeContentSync"),
  normalizeCompareMarkdown: (_editor: unknown, raw: string) => raw,
}));

import { buildEditorExtensions } from "../buildEditorExtensions";
import {
  createInlineMergeView,
  type CreateInlineMergeViewOptions,
  type InlineMergeViewHandle,
  type MergeUndoRedo,
} from "../components-vanilla/InlineMergeView";

const t = (key: string, vars?: Record<string, string | number>): string =>
  vars ? `${key}:${JSON.stringify(vars)}` : key;

const settings = { fontSize: 14, lineHeight: 1.6 };

// ResizeObserver を最小モック（jsdom 未実装）。
class MockResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

function mkEditor(): Editor {
  const element = document.createElement("div");
  return new Editor({
    element,
    extensions: buildEditorExtensions({ mode: "compare" }),
    content: "",
  });
}

function mkView(over: Partial<CreateInlineMergeViewOptions> = {}): {
  handle: InlineMergeViewHandle;
  rightEditor: Editor;
} {
  const rightEditor = mkEditor();
  const handle = createInlineMergeView({
    editor: rightEditor,
    t,
    settings,
    sourceMode: true,
    editorContent: "",
    ...over,
  });
  return { handle, rightEditor };
}

function textareas(root: HTMLElement): HTMLTextAreaElement[] {
  return Array.from(root.querySelectorAll("textarea"));
}

describe("createInlineMergeView", () => {
  let handle: InlineMergeViewHandle | null = null;
  let rightEditor: Editor | null = null;
  let originalRO: typeof ResizeObserver | undefined;

  let rafSpy: jest.SpyInstance | undefined;

  beforeEach(() => {
    originalRO = globalThis.ResizeObserver;
    globalThis.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;
    // rAF を同期実行に置換し、scheduleSync / diff highlight / align を即時に流す。
    rafSpy = jest
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((cb: FrameRequestCallback): number => {
        cb(0);
        return 0;
      });
  });

  afterEach(() => {
    handle?.destroy();
    if (rightEditor && !rightEditor.isDestroyed) rightEditor.destroy();
    handle = null;
    rightEditor = null;
    if (originalRO) {
      globalThis.ResizeObserver = originalRO;
    } else {
      delete (globalThis as { ResizeObserver?: unknown }).ResizeObserver;
    }
    rafSpy?.mockRestore();
    document.body.replaceChildren();
  });

  it("ソースモード: root を返し、左右 2 つの textarea パネルを構成する", () => {
    ({ handle, rightEditor } = mkView({ editorContent: "本文1\n本文2" }));
    document.body.appendChild(handle.el);
    // 左（比較・空）+ 右（本文）= textarea が 2 つ以上。
    const tas = textareas(handle.el);
    expect(tas.length).toBe(2);
    // 右パネルには editorContent が流れる。
    const values = tas.map((ta) => ta.value);
    expect(values).toContain("本文1\n本文2");
  });

  it("ソースモード: 左パネル readOnly エディタを生成し、destroy で破棄する", () => {
    ({ handle, rightEditor } = mkView());
    // 内部 leftEditor は ProseMirror を mount している（生成された .ProseMirror が存在）。
    document.body.appendChild(handle.el);
    handle.destroy();
    // destroy 後は root が空。
    expect(handle.el.children.length).toBe(0);
    // 右エディタは呼び元の責務なので破棄されない。
    expect(rightEditor!.isDestroyed).toBe(false);
  });

  it("compareContent 適用で diff 行が左右パネル両方に供給される", () => {
    ({ handle, rightEditor } = mkView({ editorContent: "alpha\nbeta\ngamma" }));
    document.body.appendChild(handle.el);
    // 外部比較コンテンツを update で差し込む（右本文と差分が出る内容）。
    handle.update({ compareContent: "alpha\nBETA\ngamma" });
    // diff 行供給後、ナビゲーションカウンタが 0/0 でなくなる（ブロック検出）。
    const counter = handle.el.querySelector('[aria-live="polite"]');
    expect(counter?.textContent).not.toBe("0 / 0");
    // 両パネルそれぞれの textarea に compare/edit テキストが供給される。
    const tas = textareas(handle.el);
    const values = tas.map((ta) => ta.value);
    // 左パネル（比較）= alpha/BETA/gamma、右パネル（本文）= alpha/beta/gamma。
    expect(values.some((v) => v.includes("BETA"))).toBe(true);
    expect(values.some((v) => v.includes("beta") && !v.includes("BETA"))).toBe(true);
    // diff ハイライト（mirror の added/removed 着色）が左右どちらかの merge mirror に出る。
    const mirrorCss = Array.from(handle.el.querySelectorAll('[aria-hidden="true"]'))
      .flatMap((m) => Array.from((m as HTMLElement).children) as HTMLElement[])
      .map((c) => c.style.backgroundColor)
      .join(" ");
    expect(mirrorCss).toMatch(/var\(--am-color-(success|error)-main\)/);
  });

  it("onCompareContentConsumed が compareContent 反映後に呼ばれる", () => {
    let consumed = 0;
    ({ handle, rightEditor } = mkView({
      editorContent: "x",
      compareContent: "y",
      onCompareContentConsumed: () => {
        consumed++;
      },
    }));
    expect(consumed).toBe(1);
  });

  it("onUndoRedoChange が初期化時に発火し、ハンドルを公開する", () => {
    const handles: MergeUndoRedo[] = [];
    ({ handle, rightEditor } = mkView({
      editorContent: "a",
      onUndoRedoChange: (h) => {
        if (h) handles.push(h);
      },
    }));
    expect(handles.length).toBeGreaterThan(0);
    const last = handles.at(-1)!;
    expect(typeof last.undo).toBe("function");
    expect(typeof last.redo).toBe("function");
    // 初期は履歴なし。
    expect(last.canUndo).toBe(false);
    expect(last.canRedo).toBe(false);
  });

  it("merge 操作で onUndoRedoChange の canUndo が true になる", () => {
    const handles: MergeUndoRedo[] = [];
    ({ handle, rightEditor } = mkView({
      editorContent: "alpha\nbeta",
      compareContent: "alpha\nBETA",
      onUndoRedoChange: (h) => {
        if (h) handles.push(h);
      },
    }));
    document.body.appendChild(handle.el);
    // 左ペインのマージボタン（mergeLeftToRight）を押す。
    const btn = handle.el.querySelector<HTMLButtonElement>('button[aria-label="mergeLeftToRight"]');
    expect(btn).not.toBeNull();
    btn?.click();
    const last = handles.at(-1)!;
    expect(last.canUndo).toBe(true);
  });

  it("sourceMode 切替: false にすると textarea が editor マウントへ切り替わる", () => {
    ({ handle, rightEditor } = mkView({ editorContent: "本文" }));
    document.body.appendChild(handle.el);
    expect(textareas(handle.el).length).toBe(2);
    handle.update({ sourceMode: false });
    // WYSIWYG では textarea を持たず editor マウントへ切り替わる。
    expect(textareas(handle.el).length).toBe(0);
  });

  it("onRightFileOpsChange が loadFile / exportFile ハンドルを公開する", () => {
    let ops: { loadFile: () => void; exportFile: () => void } | null = null;
    ({ handle, rightEditor } = mkView({
      editorContent: "a",
      onRightFileOpsChange: (o) => {
        ops = o;
      },
    }));
    expect(ops).not.toBeNull();
    expect(typeof ops!.loadFile).toBe("function");
    expect(typeof ops!.exportFile).toBe("function");
  });

  it("destroy 後の update は no-op（再描画しない）", () => {
    ({ handle, rightEditor } = mkView({ editorContent: "a" }));
    handle.destroy();
    handle.update({ editorContent: "b" });
    expect(handle.el.children.length).toBe(0);
  });

  it("F8 キーで次の diff ブロックへ移動する（カウンタが 1/N → 2/N）", () => {
    ({ handle, rightEditor } = mkView({
      editorContent: "l1\nl2\nl3\nl4",
      compareContent: "L1\nl2\nL3\nl4",
    }));
    document.body.appendChild(handle.el);
    const counter = handle.el.querySelector('[aria-live="polite"]');
    // 2 ブロック（1 行目・3 行目の変更）が検出される。
    expect(counter?.textContent).toBe("1 / 2");
    handle.el.dispatchEvent(new KeyboardEvent("keydown", { key: "F8", bubbles: true }));
    expect(counter?.textContent).toBe("2 / 2");
  });

  it("ミニマップ連携: getRightScroller/getDiffBlockRatios を公開し onDiffChange を発火する", () => {
    const onDiffChange = jest.fn();
    ({ handle, rightEditor } = mkView({
      sourceMode: false,
      editorContent: "l1\nl2\nl3\nl4",
      compareContent: "L1\nl2\nL3\nl4",
      onDiffChange,
    }));
    document.body.appendChild(handle.el);
    // 差分ハイライト/アライン適用で onDiffChange が呼ばれる（rAF は同期実行）。
    expect(onDiffChange).toHaveBeenCalled();
    // 右ペインスクローラを公開する。
    const scroller = handle.getRightScroller();
    expect(scroller).toBeInstanceOf(HTMLElement);
    // 差分比率は配列で返る（jsdom は scrollHeight=0 のため空配列・throw しないこと）。
    expect(Array.isArray(handle.getDiffBlockRatios())).toBe(true);
  });

  // 2026-06-16: WYSIWYG 比較モードで frontmatter も比較対象に含める（差分表示を内蔵）。
  describe("frontmatter 比較行", () => {
    it("WYSIWYG: 本ファイル/比較ファイルの frontmatter を比較行に並置する", () => {
      ({ handle, rightEditor } = mkView({
        sourceMode: false,
        editorContent: "body",
        frontmatter: "title: Main",
        compareContent: "---\ntitle: Compare\n---\nbody",
      }));
      document.body.appendChild(handle.el);
      const row = handle.el.querySelector<HTMLElement>("[data-am-frontmatter-compare]");
      expect(row).not.toBeNull();
      expect(row!.style.display).not.toBe("none");
      expect(row!.textContent).toContain("title: Main");
      expect(row!.textContent).toContain("title: Compare");
    });

    it("ソースモードでは frontmatter 比較行を隠す（テキスト diff に含まれるため）", () => {
      ({ handle, rightEditor } = mkView({
        sourceMode: true,
        editorContent: "body",
        frontmatter: "title: Main",
        compareContent: "---\ntitle: Compare\n---\nbody",
      }));
      document.body.appendChild(handle.el);
      const row = handle.el.querySelector<HTMLElement>("[data-am-frontmatter-compare]");
      expect(row?.style.display).toBe("none");
    });

    it("nav バー（不一致数・変更箇所のみ表示アイコン）が frontmatter 比較行の上に位置する", () => {
      ({ handle, rightEditor } = mkView({
        sourceMode: false,
        editorContent: "body",
        frontmatter: "title: Main",
        compareContent: "---\ntitle: Compare\n---\nbody",
      }));
      document.body.appendChild(handle.el);
      const counter = handle.el.querySelector('[aria-live="polite"]')!; // nav バー内の不一致数
      const row = handle.el.querySelector("[data-am-frontmatter-compare]")!;
      // row が counter より後（DOM 順で下）にある = nav バーが上。
      expect(counter.compareDocumentPosition(row) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it("update で frontmatter 変更が比較行に反映される", () => {
      ({ handle, rightEditor } = mkView({
        sourceMode: false,
        editorContent: "body",
        frontmatter: "title: Old",
        compareContent: "---\ntitle: Compare\n---\nbody",
      }));
      document.body.appendChild(handle.el);
      const row = (): HTMLElement =>
        handle!.el.querySelector<HTMLElement>("[data-am-frontmatter-compare]")!;
      expect(row().textContent).toContain("title: Old");
      handle.update({ frontmatter: "title: New" });
      expect(row().textContent).toContain("title: New");
      expect(row().textContent).not.toContain("title: Old");
    });

    it("両ファイルとも frontmatter が無ければ比較行は非表示", () => {
      ({ handle, rightEditor } = mkView({
        sourceMode: false,
        editorContent: "body",
        compareContent: "body",
      }));
      document.body.appendChild(handle.el);
      const row = handle.el.querySelector<HTMLElement>("[data-am-frontmatter-compare]");
      expect(row?.style.display).toBe("none");
    });
  });

  // 2026-06-10 レビュー補足（潜在バグ A）: compareContent の consume 契約の固定。
  // null は「新しい外部コンテンツなし」（消費パターン）であり比較テキストを保持する。
  // クリアは空文字 "" を明示的に渡す。
  describe("compareContent の consume 契約（レビュー補足 A）", () => {
    it('update({compareContent: ""}) で比較テキストがクリアされる', () => {
      ({ handle, rightEditor } = mkView({ editorContent: "alpha", compareContent: "COMPARE" }));
      document.body.appendChild(handle.el);
      expect(textareas(handle.el).some((ta) => ta.value.includes("COMPARE"))).toBe(true);

      handle.update({ compareContent: "" });
      expect(textareas(handle.el).some((ta) => ta.value.includes("COMPARE"))).toBe(false);
    });

    it("update({compareContent: null}) は比較テキストを保持する（消費パターンの no-op）", () => {
      ({ handle, rightEditor } = mkView({ editorContent: "alpha", compareContent: "COMPARE" }));
      document.body.appendChild(handle.el);

      // orchestrator は消費後 null を渡し続ける（syncMergeView）。null でクリアしてはいけない。
      handle.update({ compareContent: null });
      expect(textareas(handle.el).some((ta) => ta.value.includes("COMPARE"))).toBe(true);
    });
  });

  describe("ドロッププレースホルダ（左ペイン）", () => {
    const placeholder = (h: InlineMergeViewHandle): HTMLElement =>
      h.el.querySelector("[data-am-merge-drop-placeholder]") as HTMLElement;

    it("比較ファイル未ロード時は左ペインにプレースホルダを表示する（pointer-events:none）", () => {
      ({ handle, rightEditor } = mkView({ editorContent: "本文" }));
      document.body.appendChild(handle.el);
      const ph = placeholder(handle);
      expect(ph).toBeTruthy();
      expect(ph.textContent).toBe("mergeDropPlaceholder");
      expect(ph.style.display).not.toBe("none");
      // 下のドロップ判定を阻害しないこと。
      expect(ph.style.pointerEvents).toBe("none");
      // 上端配置 + ソース textarea(z-index:1) より前面（z-index:2）で確実に視認できること。
      expect(ph.style.alignItems).toBe("flex-start");
      expect(ph.style.zIndex).toBe("2");
    });

    it("compareContent ロード後はプレースホルダを非表示にする", () => {
      ({ handle, rightEditor } = mkView({ editorContent: "本文", compareContent: "比較" }));
      document.body.appendChild(handle.el);
      expect(placeholder(handle).style.display).toBe("none");
    });

    it("比較テキストをクリアするとプレースホルダが再表示される", () => {
      ({ handle, rightEditor } = mkView({ editorContent: "本文", compareContent: "比較" }));
      document.body.appendChild(handle.el);
      expect(placeholder(handle).style.display).toBe("none");
      handle.update({ compareContent: "" });
      expect(placeholder(handle).style.display).not.toBe("none");
    });
  });
});

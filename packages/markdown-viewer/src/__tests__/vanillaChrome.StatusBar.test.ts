/**
 * components-vanilla/StatusBar.ts — 脱React のステータスバー（vanilla）のテスト。
 *
 * 検証観点:
 *   1. DOM 生成 / 構造（root fixed / aria-live 群 / 行・文字・行数テキスト / 右寄せ群）
 *   2. 属性（id / role=region / aria-label / contenteditable=false / 色が CSS 変数）
 *   3. 派生値（カーソル行/列・文字数・行数・行末 LF/CRLF・エンコード表示）
 *   4. editor 購読（selectionUpdate / update でカーソル更新、onStatusChange 通知）
 *   5. ソースモード（textarea から行/列算出・document listener の登録/解除）
 *   6. 行末メニュー（button クリックで createMenu 生成、項目クリックで onLineEndingChange + 閉じる）
 *   7. エンコードメニュー（confirm 解決で onEncodingChange、reject / 同値で呼ばない、confirm 未指定で即適用）
 *   8. ファイル名 / dirty ドット（fileName 表示・isDirty で SVG circle + tooltip）
 *   9. hidden（display:none・region 属性除去）
 *  10. destroy のクリーンアップ（editor off / document listener 解除 / 開いている menu 破棄）
 *
 * StatusBar は createMenu → createFloating / createTooltip → createFloating を使うため
 * @floating-ui/dom をモックする。editor は mock（state / on / off スタブ）。
 * jsdom は継承された CSS カスタムプロパティを getComputedStyle で解決しないため、色は
 * el.style.cssText / el.style.color が var(--am-...) を含むことで検証する（computed 値は見ない）。
 */

// --- @floating-ui/dom モック（createMenu / createTooltip → createFloating が呼ぶ） ----------
const computePositionMock = jest.fn();
const autoUpdateMock = jest.fn();

jest.mock("@floating-ui/dom", () => ({
  computePosition: (...args: unknown[]) => computePositionMock(...args),
  autoUpdate: (...args: unknown[]) => autoUpdateMock(...args),
  offset: (px: number) => ({ name: "offset", px }),
  flip: (o: unknown) => ({ name: "flip", o }),
  shift: (o: unknown) => ({ name: "shift", o }),
}));

import { createStatusBar } from "../components-vanilla/StatusBar";
import type { CreateStatusBarOptions } from "../components-vanilla/StatusBar";

/** 翻訳スタブ（key をそのまま返す。values は無視）。 */
const t = ((key: string) => key) as unknown as CreateStatusBarOptions["t"];

/** editor mock（selection / doc / on / off スタブ）。emit でイベント発火。 */
function makeEditor(init?: {
  index?: number;
  parentOffset?: number;
  textContent?: string;
  childCount?: number;
}) {
  const listeners: Record<string, Array<() => void>> = {};
  const sel = {
    index: init?.index ?? 0,
    parentOffset: init?.parentOffset ?? 0,
  };
  const doc = {
    textContent: init?.textContent ?? "hello world",
    childCount: init?.childCount ?? 3,
  };
  const editor: any = {
    state: {
      selection: {
        $from: {
          index: () => sel.index,
          // 後から sel.parentOffset を書き換えるテストがあるため live getter にする
          // （値で捕捉すると初期値のまま固定され selectionUpdate 後の再計算を検証できない）。
          get parentOffset() {
            return sel.parentOffset;
          },
        },
      },
      doc: {
        get textContent() {
          return doc.textContent;
        },
        content: {
          get childCount() {
            return doc.childCount;
          },
        },
      },
    },
    on(evt: string, fn: () => void) {
      (listeners[evt] ??= []).push(fn);
    },
    off(evt: string, fn: () => void) {
      listeners[evt] = (listeners[evt] ?? []).filter((f) => f !== fn);
    },
  };
  return {
    editor,
    sel,
    doc,
    emit: (evt: string) => (listeners[evt] ?? []).forEach((f) => f()),
    listenerCount: (evt: string) => (listeners[evt] ?? []).length,
  };
}

function baseOpts(
  overrides: Partial<CreateStatusBarOptions> = {},
): CreateStatusBarOptions {
  return {
    editor: makeEditor().editor,
    t,
    ...overrides,
  };
}

beforeEach(() => {
  computePositionMock.mockReset();
  autoUpdateMock.mockReset();
  computePositionMock.mockResolvedValue({ x: 0, y: 0, placement: "bottom" });
  autoUpdateMock.mockReturnValue(() => {});
  document.body.innerHTML = "";
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("components-vanilla/StatusBar", () => {
  describe("生成 / 構造", () => {
    it("region role / id / aria-label / contenteditable=false を持つ fixed な root を生成する", () => {
      const { editor } = makeEditor();
      const { el, destroy } = createStatusBar(baseOpts({ editor }));
      expect(el.tagName).toBe("DIV");
      expect(el.id).toBe("md-editor-statusbar");
      expect(el.getAttribute("role")).toBe("region");
      expect(el.getAttribute("aria-label")).toBe("statusBar");
      expect(el.getAttribute("contenteditable")).toBe("false");
      expect(el.style.cssText).toContain("position: fixed");
      expect(el.style.cssText).toContain("bottom: 0");
      destroy();
    });

    it("背景 / border / テキスト色が CSS 変数で表現される", () => {
      const { el, destroy } = createStatusBar(baseOpts());
      expect(el.style.cssText).toContain("var(--am-color-bg-paper)");
      expect(el.style.cssText).toContain("var(--am-color-divider)");
      destroy();
    });

    it("aria-live=polite の群に行/列・文字数・行数の 3 テキストを描画する", () => {
      const { editor } = makeEditor({ textContent: "abc", childCount: 2 });
      const { el, destroy } = createStatusBar(baseOpts({ editor }));
      const live = el.querySelector('[aria-live="polite"]') as HTMLElement;
      expect(live).toBeTruthy();
      expect(live.getAttribute("aria-atomic")).toBe("true");
      const texts = Array.from(live.children).map((c) => c.textContent);
      expect(texts[0]).toContain("cursorLine");
      expect(texts[1]).toContain("chars");
      expect(texts[2]).toContain("lines");
      destroy();
    });
  });

  describe("派生値の表示", () => {
    it("カーソル行/列を index+1 / parentOffset+1 で表示する", () => {
      const { editor } = makeEditor({ index: 4, parentOffset: 9 });
      const { el, destroy } = createStatusBar(baseOpts({ editor }));
      const cursor = el.querySelector('[aria-live="polite"]')!.children[0];
      // "cursorLine 5 cursorCol 10"
      expect(cursor.textContent).toContain("5");
      expect(cursor.textContent).toContain("10");
      destroy();
    });

    it("WYSIWYG では文字数は doc.textContent.length、行数は content.childCount を表示する", () => {
      const { editor } = makeEditor({ textContent: "abcde", childCount: 7 });
      const { el, destroy } = createStatusBar(baseOpts({ editor }));
      const children = el.querySelector('[aria-live="polite"]')!.children;
      expect(children[1].textContent).toContain("5");
      expect(children[2].textContent).toContain("7");
      destroy();
    });

    it("sourceText に \\r\\n が含まれれば CRLF、無ければ LF を表示する", () => {
      const lf = createStatusBar(baseOpts({ sourceMode: true, sourceText: "a\nb" }));
      expect(lf.el.textContent).toContain("LF");
      expect(lf.el.textContent).not.toContain("CRLF");
      lf.destroy();

      const crlf = createStatusBar(baseOpts({ sourceMode: true, sourceText: "a\r\nb" }));
      expect(crlf.el.textContent).toContain("CRLF");
      crlf.destroy();
    });

    it("エンコード未指定なら UTF-8 を表示する", () => {
      const { el, destroy } = createStatusBar(baseOpts());
      expect(el.textContent).toContain("UTF-8");
      destroy();
    });
  });

  describe("editor カーソル購読", () => {
    it("生成時に selectionUpdate / update を購読する", () => {
      const m = makeEditor();
      const handle = createStatusBar(baseOpts({ editor: m.editor }));
      expect(m.listenerCount("selectionUpdate")).toBe(1);
      expect(m.listenerCount("update")).toBe(1);
      handle.destroy();
    });

    it("selectionUpdate 発火でカーソル表示を再計算する", () => {
      const m = makeEditor({ index: 0, parentOffset: 0 });
      const handle = createStatusBar(baseOpts({ editor: m.editor }));
      m.sel.index = 2;
      m.sel.parentOffset = 5;
      m.emit("selectionUpdate");
      const cursor = handle.el.querySelector('[aria-live="polite"]')!.children[0];
      expect(cursor.textContent).toContain("3"); // line
      expect(cursor.textContent).toContain("6"); // col
      handle.destroy();
    });

    it("onStatusChange を生成時とカーソル更新時に通知する", () => {
      const m = makeEditor({ index: 0, parentOffset: 0, textContent: "abc", childCount: 1 });
      const onStatusChange = jest.fn();
      const handle = createStatusBar(baseOpts({ editor: m.editor, onStatusChange }));
      expect(onStatusChange).toHaveBeenCalledTimes(1);
      expect(onStatusChange).toHaveBeenLastCalledWith(
        expect.objectContaining({ line: 1, col: 1, charCount: 3, lineCount: 1, encoding: "UTF-8" }),
      );
      m.sel.index = 1;
      m.emit("update");
      expect(onStatusChange).toHaveBeenLastCalledWith(
        expect.objectContaining({ line: 2 }),
      );
      handle.destroy();
    });
  });

  describe("ソースモード", () => {
    /** sourceModeController の textarea 相当（data-am-source-textarea 属性付き）。 */
    function mkSourceTextarea(value: string): HTMLTextAreaElement {
      const ta = document.createElement("textarea");
      ta.setAttribute("data-am-source-textarea", "");
      ta.setAttribute("aria-label", "source");
      ta.value = value;
      document.body.appendChild(ta);
      return ta;
    }

    it("sourceMode 時に textarea の selectionStart から行/列を算出する", () => {
      const ta = mkSourceTextarea("line1\nline2\nXcursor");
      // "line1\nline2\n" = 12 文字。X の位置（pos=12）で line=3, col=1。
      ta.selectionStart = 12;

      const handle = createStatusBar(baseOpts({ sourceMode: true, sourceText: ta.value }));
      // 初回 bindSourceListeners → handleSourceCursor が走る。
      const cursor = handle.el.querySelector('[aria-live="polite"]')!.children[0];
      expect(cursor.textContent).toContain("3"); // line
      handle.destroy();
    });

    it("sourceMode 時は document の click/keyup/select でカーソルを更新する", () => {
      const ta = mkSourceTextarea("abc\ndef");
      ta.selectionStart = 0;
      const handle = createStatusBar(baseOpts({ sourceMode: true, sourceText: ta.value }));

      ta.selectionStart = 5; // line2 の 2 文字目
      document.dispatchEvent(new Event("keyup"));
      const cursor = handle.el.querySelector('[aria-live="polite"]')!.children[0];
      expect(cursor.textContent).toContain("2"); // line
      handle.destroy();
    });

    it("destroy / sourceMode 解除で document listener を解除する", () => {
      const ta = mkSourceTextarea("abc");
      ta.selectionStart = 0;
      const handle = createStatusBar(baseOpts({ sourceMode: true, sourceText: ta.value }));

      handle.update({ sourceMode: false });
      // 解除後はイベントを発火してもクラッシュしない（listener が無い）。
      expect(() => document.dispatchEvent(new Event("keyup"))).not.toThrow();
      handle.destroy();
    });

    // 2026-06-10 レビュー指摘 8: textarea[aria-label] の document 全域検索は merge ビュー等の
    // 無関係な textarea に誤マッチする。data-am-source-textarea / getter で特定する。
    it("aria-label 付きの無関係な textarea（ダイアログ等）には誤マッチしない", () => {
      // 先に DOM へ置かれた decoy（merge パネルの textarea 相当・aria-label のみ）。
      const decoy = document.createElement("textarea");
      decoy.setAttribute("aria-label", "sourceEditor");
      decoy.value = "x";
      decoy.selectionStart = 0; // decoy なら line=1
      document.body.appendChild(decoy);

      const ta = mkSourceTextarea("line1\nline2\nXcursor");
      ta.selectionStart = 12; // 本物なら line=3

      const handle = createStatusBar(baseOpts({ sourceMode: true, sourceText: ta.value }));
      const cursor = handle.el.querySelector('[aria-live="polite"]')!.children[0];
      expect(cursor.textContent).toContain("3");
      handle.destroy();
    });

    it("getSourceTextarea 指定時は DOM 検索より getter を優先する", () => {
      // data 属性付きの別 textarea が DOM にあっても getter の textarea を使う。
      mkSourceTextarea("other");
      const ta = document.createElement("textarea");
      ta.value = "a\nb\nc\nX";
      ta.selectionStart = 6; // line=4 の 1 文字目
      document.body.appendChild(ta);

      const handle = createStatusBar(
        baseOpts({ sourceMode: true, sourceText: ta.value, getSourceTextarea: () => ta }),
      );
      const cursor = handle.el.querySelector('[aria-live="polite"]')!.children[0];
      expect(cursor.textContent).toContain("4");
      handle.destroy();
    });
  });

  describe("行末メニュー", () => {
    it("onLineEndingChange 指定時は行末をボタンで描画する", () => {
      const { el, destroy } = createStatusBar(
        baseOpts({ onLineEndingChange: jest.fn(), sourceText: "a\nb" }),
      );
      const buttons = Array.from(el.querySelectorAll("button"));
      const lf = buttons.find((b) => b.textContent === "LF");
      expect(lf).toBeTruthy();
      destroy();
    });

    it("onLineEndingChange 未指定なら行末はテキストのみ（ボタンなし）", () => {
      const { el, destroy } = createStatusBar(baseOpts({ sourceText: "a\nb" }));
      const buttons = Array.from(el.querySelectorAll("button"));
      expect(buttons.find((b) => b.textContent === "LF")).toBeUndefined();
      expect(el.textContent).toContain("LF");
      destroy();
    });

    it("行末ボタンクリックで menu(role=menu) を document.body に生成する", () => {
      const { el, destroy } = createStatusBar(
        baseOpts({ onLineEndingChange: jest.fn(), sourceText: "a\nb" }),
      );
      const lfBtn = Array.from(el.querySelectorAll("button")).find(
        (b) => b.textContent === "LF",
      )!;
      lfBtn.click();
      const menu = document.body.querySelector('[data-am-menu-root] [role="menu"]');
      expect(menu).toBeTruthy();
      const items = menu!.querySelectorAll('[role="menuitem"]');
      expect(items.length).toBe(2); // LF / CRLF
      destroy();
    });

    it("行末項目クリックで onLineEndingChange を呼びメニューを閉じる", () => {
      const onLineEndingChange = jest.fn();
      const { el, destroy } = createStatusBar(
        baseOpts({ onLineEndingChange, sourceText: "a\nb" }),
      );
      const lfBtn = Array.from(el.querySelectorAll("button")).find(
        (b) => b.textContent === "LF",
      )!;
      lfBtn.click();
      const crlfItem = Array.from(
        document.body.querySelectorAll('[role="menuitem"]'),
      ).find((i) => i.textContent === "CRLF") as HTMLElement;
      crlfItem.click();
      expect(onLineEndingChange).toHaveBeenCalledWith("CRLF");
      expect(document.body.querySelector("[data-am-menu-root]")).toBeNull();
      destroy();
    });
  });

  describe("エンコードメニュー", () => {
    function openEncodingMenu(
      el: HTMLElement,
    ): HTMLElement {
      const btn = Array.from(el.querySelectorAll("button")).find(
        (b) => b.textContent === "UTF-8",
      )!;
      btn.click();
      return document.body.querySelector("[data-am-menu-root]") as HTMLElement;
    }

    it("onEncodingChange 指定時はエンコードをボタンで描画する", () => {
      const { el, destroy } = createStatusBar(
        baseOpts({ onEncodingChange: jest.fn() }),
      );
      const utf8 = Array.from(el.querySelectorAll("button")).find(
        (b) => b.textContent === "UTF-8",
      );
      expect(utf8).toBeTruthy();
      destroy();
    });

    it("エンコードボタンクリックで 3 項目のメニューを生成する", () => {
      const { el, destroy } = createStatusBar(baseOpts({ onEncodingChange: jest.fn() }));
      const root = openEncodingMenu(el);
      const items = root.querySelectorAll('[role="menuitem"]');
      expect(items.length).toBe(3); // UTF-8 / Shift_JIS / EUC-JP
      destroy();
    });

    it("confirm が true 解決で onEncodingChange を呼ぶ", async () => {
      const onEncodingChange = jest.fn();
      const confirm = jest.fn().mockResolvedValue(true);
      const { el, destroy } = createStatusBar(
        baseOpts({ onEncodingChange, confirm }),
      );
      const root = openEncodingMenu(el);
      const sjis = Array.from(root.querySelectorAll('[role="menuitem"]')).find(
        (i) => i.textContent === "Shift_JIS",
      ) as HTMLElement;
      sjis.click();
      expect(confirm).toHaveBeenCalledWith("encodingChangeConfirm");
      await Promise.resolve();
      await Promise.resolve();
      expect(onEncodingChange).toHaveBeenCalledWith("Shift_JIS");
      destroy();
    });

    it("confirm が false 解決なら onEncodingChange を呼ばない", async () => {
      const onEncodingChange = jest.fn();
      const confirm = jest.fn().mockResolvedValue(false);
      const { el, destroy } = createStatusBar(
        baseOpts({ onEncodingChange, confirm }),
      );
      const root = openEncodingMenu(el);
      const sjis = Array.from(root.querySelectorAll('[role="menuitem"]')).find(
        (i) => i.textContent === "Shift_JIS",
      ) as HTMLElement;
      sjis.click();
      await Promise.resolve();
      await Promise.resolve();
      expect(onEncodingChange).not.toHaveBeenCalled();
      destroy();
    });

    it("現在値と同じエンコードを選んでも confirm / onEncodingChange を呼ばない", () => {
      const onEncodingChange = jest.fn();
      const confirm = jest.fn().mockResolvedValue(true);
      const { el, destroy } = createStatusBar(
        baseOpts({ onEncodingChange, confirm, encoding: "UTF-8" }),
      );
      const root = openEncodingMenu(el);
      const utf8 = Array.from(root.querySelectorAll('[role="menuitem"]')).find(
        (i) => i.textContent === "UTF-8",
      ) as HTMLElement;
      utf8.click();
      expect(confirm).not.toHaveBeenCalled();
      expect(onEncodingChange).not.toHaveBeenCalled();
      destroy();
    });

    it("confirm 未指定なら確認なしで即 onEncodingChange を呼ぶ", () => {
      const onEncodingChange = jest.fn();
      const { el, destroy } = createStatusBar(baseOpts({ onEncodingChange }));
      const root = openEncodingMenu(el);
      const sjis = Array.from(root.querySelectorAll('[role="menuitem"]')).find(
        (i) => i.textContent === "Shift_JIS",
      ) as HTMLElement;
      sjis.click();
      expect(onEncodingChange).toHaveBeenCalledWith("Shift_JIS");
      destroy();
    });
  });

  describe("ファイル名 / dirty", () => {
    it("fileName を表示し aria-label に反映する", () => {
      const { el, destroy } = createStatusBar(baseOpts({ fileName: "doc.md" }));
      expect(el.textContent).toContain("doc.md");
      const named = el.querySelector('[aria-label="doc.md"]');
      expect(named).toBeTruthy();
      destroy();
    });

    it("fileName 無しならファイル名要素を描画しない", () => {
      const { el, destroy } = createStatusBar(baseOpts({ fileName: null }));
      expect(el.querySelector('[aria-label="doc.md"]')).toBeNull();
      destroy();
    });

    it("isDirty で dirty ドット（warning 色の circle SVG）と aria-label を付与する", () => {
      const { el, destroy } = createStatusBar(
        baseOpts({ fileName: "doc.md", isDirty: true }),
      );
      const named = el.querySelector(
        '[aria-label="doc.md (unsavedChanges)"]',
      ) as HTMLElement;
      expect(named).toBeTruthy();
      const circle = named.querySelector("svg circle");
      expect(circle).toBeTruthy();
      expect(named.querySelector("svg")!.style.cssText).toContain(
        "var(--am-color-warning-main)",
      );
      destroy();
    });
  });

  describe("ファイル所在バッジ（ローカル / GitHub / Drive）", () => {
    it.each([
      ["local", "fileOriginLocal"],
      ["github", "fileOriginGitHub"],
      ["drive", "fileOriginDrive"],
    ] as const)("fileOrigin=%s でアイコンとラベルを出す", (origin, labelKey) => {
      const { el, destroy } = createStatusBar(
        baseOpts({ fileName: "doc.md", fileOrigin: origin }),
      );
      const badge = el.querySelector(`[data-am-file-origin="${origin}"]`) as HTMLElement;
      expect(badge).toBeTruthy();
      // 色だけに依存しない: アイコン（装飾）とラベル文字の双方を出す。
      expect(badge.querySelector("svg")).toBeTruthy();
      expect(badge.textContent).toBe(labelKey);
      // 読み上げはファイル名の aria-label へ一本化するため、バッジ自体は視覚専用。
      expect(badge.getAttribute("aria-hidden")).toBe("true");
      destroy();
    });

    it("所在の読み上げはファイル名の aria-label に一本化する（二重読み上げを避ける）", () => {
      const { el, destroy } = createStatusBar(
        baseOpts({ fileName: "doc.md", fileOrigin: "github", isDirty: true }),
      );
      // t スタブは vars を無視するため fileOriginLabel はキーのまま返る。
      expect(
        el.querySelector('[aria-label="fileOriginLabel doc.md (unsavedChanges)"]'),
      ).toBeTruthy();
      destroy();
    });

    it("fileName が無ければ所在バッジも描画しない", () => {
      const { el, destroy } = createStatusBar(
        baseOpts({ fileName: null, fileOrigin: "drive" }),
      );
      expect(el.querySelector("[data-am-file-origin]")).toBeNull();
      destroy();
    });

    it("update で所在が切り替わる（ローカルへ名前を付けて保存 → GitHub は消える）", () => {
      const bar = createStatusBar(baseOpts({ fileName: "doc.md", fileOrigin: "github" }));
      bar.update({ fileName: "copy.md", fileOrigin: "local" });
      expect(bar.el.querySelector('[data-am-file-origin="github"]')).toBeNull();
      expect(bar.el.querySelector('[data-am-file-origin="local"]')).toBeTruthy();
      expect(bar.el.textContent).toContain("copy.md");
      bar.update({ fileOrigin: null });
      expect(bar.el.querySelector("[data-am-file-origin]")).toBeNull();
      bar.destroy();
    });
  });

  describe("hidden", () => {
    it("hidden 時は display:none で region 属性を外す", () => {
      const { el, destroy } = createStatusBar(baseOpts({ hidden: true }));
      expect(el.style.cssText).toContain("display: none");
      expect(el.getAttribute("role")).toBeNull();
      expect(el.id).toBe("");
      destroy();
    });

    it("update({ hidden: false }) で再表示する", () => {
      const handle = createStatusBar(baseOpts({ hidden: true }));
      handle.update({ hidden: false });
      expect(handle.el.getAttribute("role")).toBe("region");
      expect(handle.el.style.cssText).toContain("position: fixed");
      handle.destroy();
    });
  });

  describe("update での再計算", () => {
    it("encoding の更新で表示と通知を再計算する", () => {
      const onStatusChange = jest.fn();
      const handle = createStatusBar(baseOpts({ onStatusChange }));
      onStatusChange.mockClear();
      handle.update({ encoding: "EUC-JP" });
      expect(handle.el.textContent).toContain("EUC-JP");
      expect(onStatusChange).toHaveBeenLastCalledWith(
        expect.objectContaining({ encoding: "EUC-JP" }),
      );
      handle.destroy();
    });

    it("sourceText の更新で行末表示が LF→CRLF に変わる", () => {
      const handle = createStatusBar(
        baseOpts({ sourceMode: true, sourceText: "a\nb" }),
      );
      expect(handle.el.textContent).toContain("LF");
      handle.update({ sourceText: "a\r\nb" });
      expect(handle.el.textContent).toContain("CRLF");
      handle.destroy();
    });
  });

  describe("destroy のクリーンアップ", () => {
    it("editor の selectionUpdate / update listener を解除する", () => {
      const m = makeEditor();
      const handle = createStatusBar(baseOpts({ editor: m.editor }));
      handle.destroy();
      expect(m.listenerCount("selectionUpdate")).toBe(0);
      expect(m.listenerCount("update")).toBe(0);
    });

    it("destroy 後の selectionUpdate 発火でクラッシュしない", () => {
      const m = makeEditor();
      const handle = createStatusBar(baseOpts({ editor: m.editor }));
      handle.destroy();
      expect(() => m.emit("selectionUpdate")).not.toThrow();
    });

    it("開いているメニューを destroy で閉じる", () => {
      const { el, destroy } = createStatusBar(
        baseOpts({ onLineEndingChange: jest.fn(), sourceText: "a\nb" }),
      );
      const lfBtn = Array.from(el.querySelectorAll("button")).find(
        (b) => b.textContent === "LF",
      )!;
      lfBtn.click();
      expect(document.body.querySelector("[data-am-menu-root]")).toBeTruthy();
      destroy();
      expect(document.body.querySelector("[data-am-menu-root]")).toBeNull();
    });
  });
});

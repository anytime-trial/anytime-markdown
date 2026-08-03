/**
 * Characterization test — installChrome が張る購読の台帳
 *
 * `installChrome` は 1281 行・32 セクションの手続きで、セクションを別モジュールへ
 * 切り出すリファクタでは「購読を 1 本落とす」「disposer を積み忘れる」形の退行が
 * **エラーにならず静かに起きる**（機能が効かなくなるだけ、あるいはリークするだけ）。
 *
 * そこで mount 時に登録される listener を target 種別つきで記録し、
 *
 *   1. installChrome が直接張る購読の集合（下記 OWNED_SUBSCRIPTIONS）
 *   2. destroy でそのすべてが解除されること
 *
 * を固定する。セクションを切り出しても、購読の登録・解除がこの台帳と一致する限り
 * 外から見た配線は変わっていない。
 *
 * 記録対象は installChrome が直接触る 4 つの target のみに絞る（tiptap / ProseMirror
 * 内部の listener はバージョンで揺れるためノイズになる）。
 */

import { StarterKit } from "@anytime-markdown/markdown-starter-kit";

jest.mock("../buildEditorExtensions", () => ({
  buildEditorExtensions: () => [StarterKit],
}));
jest.mock("../constants/templates", () => ({
  getBuiltinTemplates: () => [],
}));
jest.mock("@floating-ui/dom", () => ({
  computePosition: jest.fn(() =>
    Promise.resolve({ x: 0, y: 0, placement: "bottom-start", middlewareData: {} }),
  ),
  autoUpdate: jest.fn(() => () => {}),
  offset: jest.fn(() => ({})),
  flip: jest.fn(() => ({})),
  shift: jest.fn(() => ({})),
}));

import { mountVanillaMarkdownEditor } from "../host/vanillaMarkdownEditor";

const t = (key: string): string => key;

/**
 * installChrome が**自分で** addEventListener する購読。
 * `installVSCodeEditorEvents` 等の別モジュールが張る window:vscode-* は含めない
 * （それらは当該モジュール側の責務で、本 host の分割では動かない）。
 */
const OWNED_SUBSCRIPTIONS = [
  "content:dragleave",
  "content:dragover",
  "content:drop",
  "content:wheel",
  "document:keydown",
  "editorDom:keydown",
  "window:beforeunload",
  "window:vscode-exit-compare-mode",
  "window:vscode-load-compare-file",
];

interface Ledger {
  added: string[];
  removed: string[];
}

/** 記録対象の target を判別する。対象外は null（記録しない）。 */
function labelTarget(target: EventTarget, contentEl: Element | null, editorDom: Element | null): string | null {
  if (target === document) return "document";
  if (target === window) return "window";
  if (contentEl && target === contentEl) return "content";
  if (editorDom && target === editorDom) return "editorDom";
  return null;
}

/**
 * mount → destroy の間の addEventListener / removeEventListener を記録する。
 * contentEl / editorDom は mount 後にしか判明しないため、記録は生の target を保持し、
 * ラベル付けを後段でまとめて行う。
 */
function recordLedger(run: () => { contentEl: Element | null; editorDom: Element | null; destroy: () => void }): Ledger {
  const rawAdded: Array<{ target: EventTarget; type: string }> = [];
  const rawRemoved: Array<{ target: EventTarget; type: string }> = [];

  const origAdd = EventTarget.prototype.addEventListener;
  const origRemove = EventTarget.prototype.removeEventListener;
  // jsdom の window は EventTarget.prototype を経由しない自前の実装を持つため、
  // globalThis 側も個別に差し替える（installChrome は globalThis.addEventListener を使う）。
  const globalAdd = globalThis.addEventListener;
  const globalRemove = globalThis.removeEventListener;
  globalThis.addEventListener = function patchedGlobalAdd(type: string, ...rest: unknown[]) {
    rawAdded.push({ target: window, type });
    return (globalAdd as unknown as (...a: unknown[]) => void).call(globalThis, type, ...rest);
  } as typeof globalThis.addEventListener;
  globalThis.removeEventListener = function patchedGlobalRemove(type: string, ...rest: unknown[]) {
    rawRemoved.push({ target: window, type });
    return (globalRemove as unknown as (...a: unknown[]) => void).call(globalThis, type, ...rest);
  } as typeof globalThis.removeEventListener;

  EventTarget.prototype.addEventListener = function patchedAdd(
    this: EventTarget,
    type: string,
    ...rest: unknown[]
  ) {
    rawAdded.push({ target: this, type });
    return (origAdd as unknown as (this: EventTarget, ...a: unknown[]) => void).call(this, type, ...rest);
  } as typeof EventTarget.prototype.addEventListener;

  EventTarget.prototype.removeEventListener = function patchedRemove(
    this: EventTarget,
    type: string,
    ...rest: unknown[]
  ) {
    rawRemoved.push({ target: this, type });
    return (origRemove as unknown as (this: EventTarget, ...a: unknown[]) => void).call(this, type, ...rest);
  } as typeof EventTarget.prototype.removeEventListener;

  let mounted: { contentEl: Element | null; editorDom: Element | null; destroy: () => void };
  try {
    mounted = run();
    mounted.destroy();
  } finally {
    EventTarget.prototype.addEventListener = origAdd;
    EventTarget.prototype.removeEventListener = origRemove;
    globalThis.addEventListener = globalAdd;
    globalThis.removeEventListener = globalRemove;
  }

  const toLabels = (raw: Array<{ target: EventTarget; type: string }>): string[] =>
    raw
      .map(({ target, type }) => {
        const label = labelTarget(target, mounted.contentEl, mounted.editorDom);
        return label === null ? null : `${label}:${type}`;
      })
      .filter((v): v is string => v !== null);

  return { added: toLabels(rawAdded), removed: toLabels(rawRemoved) };
}

describe("installChrome subscription ledger", () => {
  let container: HTMLElement;
  let ledger: Ledger;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    ledger = recordLedger(() => {
      const handle = mountVanillaMarkdownEditor(container, {
        t,
        initialContent: "# Hello",
        sideToolbar: true,
      });
      return {
        contentEl: container.querySelector("[data-am-content]"),
        editorDom: handle.editor.view.dom,
        destroy: () => { handle.destroy(); },
      };
    });
  });

  afterEach(() => {
    container.remove();
  });

  it("registers exactly the subscriptions installChrome owns", () => {
    const owned = ledger.added.filter((s) => OWNED_SUBSCRIPTIONS.includes(s));
    expect([...new Set(owned)].sort()).toEqual(OWNED_SUBSCRIPTIONS);
  });

  it("releases every owned subscription on destroy", () => {
    for (const subscription of OWNED_SUBSCRIPTIONS) {
      expect(ledger.removed).toContain(subscription);
    }
  });

  it("registers each owned subscription the expected number of times", () => {
    // editorDom:keydown だけ 2 回登録される（installChrome の onShortcutKeyDown に加え、
    // ProseMirror の EditorView が自前の keydown を張るため）。件数まで固定して、
    // 切り出しで登録が消える／二重になる退行を検知する。
    const expected: Record<string, number> = Object.fromEntries(
      OWNED_SUBSCRIPTIONS.map((s) => [s, s === "editorDom:keydown" ? 2 : 1]),
    );
    const actual = Object.fromEntries(
      OWNED_SUBSCRIPTIONS.map((s) => [s, ledger.added.filter((a) => a === s).length]),
    );
    expect(actual).toEqual(expected);
  });
});

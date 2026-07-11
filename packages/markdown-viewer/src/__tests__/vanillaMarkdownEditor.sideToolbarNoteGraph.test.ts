/**
 * host/vanillaMarkdownEditor.ts — サイドツールバーへのノート網（noteGraph）配線のテスト。
 *
 * ノート網アイコンは `noteGraph` スロットが供給されたときのみ描画される（ホスト所有パネル提供時）。
 * web-app は GitHub から開いたときだけスロットを渡すため、この描画条件が満たされないと
 * 「サイドバーにアイコンが出ない」。ボタン有無は DOM で決定論的に検証できる（canvas 非依存）。
 *
 * mock 方針は vanillaMarkdownEditor.sideToolbarExplorer.test.ts と同一。
 */
import { StarterKit } from "@anytime-markdown/markdown-starter-kit";

jest.mock("../buildEditorExtensions", () => ({
  buildEditorExtensions: () => [StarterKit],
}));

jest.mock("../constants/templates", () => ({
  getBuiltinTemplates: () => [],
}));

jest.mock("../utils/markdownSerializer", () => ({
  ...jest.requireActual("../utils/markdownSerializer"),
  getMarkdownFromEditorSafe: () => "MD",
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

import { mountVanillaMarkdownEditor, type NoteGraphSlot } from "../host/vanillaMarkdownEditor";

const t = (key: string): string => key;

beforeAll(() => {
  const emptyRects = (): DOMRectList =>
    ({ length: 0, item: () => null, [Symbol.iterator]: function* () {} }) as unknown as DOMRectList;
  Element.prototype.getClientRects = Element.prototype.getClientRects ?? emptyRects;
  Range.prototype.getClientRects = Range.prototype.getClientRects ?? emptyRects;
  Range.prototype.getBoundingClientRect =
    Range.prototype.getBoundingClientRect ?? (() => new DOMRect());
});

describe("mountVanillaMarkdownEditor — サイドツールバーのノート網トグル", () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
    document.body.replaceChildren();
  });

  function makeSlot(): NoteGraphSlot {
    return { element: document.createElement("div") };
  }

  /** サイドツールバースロット内のノート網ボタンを取得する。 */
  function sideNoteGraphButton(): HTMLButtonElement | null {
    const slot = container.querySelector("[data-am-side-toolbar-slot]");
    return slot?.querySelector<HTMLButtonElement>('button[aria-label="noteGraph"]') ?? null;
  }

  it("noteGraph スロット供給時はサイドツールバーにノート網ボタンを描画する", () => {
    const handle = mountVanillaMarkdownEditor(container, {
      t,
      initialContent: "# a",
      sideToolbar: true,
      noteGraph: makeSlot(),
    });

    expect(sideNoteGraphButton()).not.toBeNull();

    handle.destroy();
  });

  it("noteGraph スロット未供給時はノート網ボタンを描画しない（GitHub 以外で非表示）", () => {
    const handle = mountVanillaMarkdownEditor(container, {
      t,
      initialContent: "# a",
      sideToolbar: true,
    });

    expect(sideNoteGraphButton()).toBeNull();

    handle.destroy();
  });

  it("ノート網ボタンのクリックでパネル開閉状態がトグルされる", () => {
    const modes: boolean[] = [];
    const handle = mountVanillaMarkdownEditor(container, {
      t,
      initialContent: "# a",
      sideToolbar: true,
      noteGraph: makeSlot(),
      onModeChange: (state) => modes.push(state.noteGraphOpen === true),
    });

    const btn = sideNoteGraphButton();
    expect(btn).not.toBeNull();
    btn?.click();
    expect(modes.at(-1)).toBe(true);
    btn?.click();
    expect(modes.at(-1)).toBe(false);

    handle.destroy();
  });
});

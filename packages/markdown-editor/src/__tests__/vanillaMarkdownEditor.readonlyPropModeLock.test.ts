/**
 * host/vanillaMarkdownEditor.ts — `readOnly` prop（ホスト強制ロック）とユーザー選択 "readonly"
 * モードの分離に関するリグレッションテスト。
 *
 * 旧実装は onModeApplied が `current.readOnly` を modeState.readonlyMode へ OR していたため:
 *   - ツールバーの currentMode() が常に "readonly" を返し、選択ピルが動かなかった
 *   - controller の内部 mode は "wysiwyg" のままなので「編集」は applyMode の早期 return に
 *     吸われ完全な no-op になり、ロック解除後もモードが戻らなかった
 * また EditorToolbar.update() が readonly ゲートの disabled を再評価しないため、readonly へ
 * 入っても「新規作成 / 通常 / 比較」が押せたままだった。
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

import { mountVanillaMarkdownEditor } from "../host/vanillaMarkdownEditor";

const t = (key: string): string => key;

beforeAll(() => {
  const emptyRects = (): DOMRectList =>
    ({ length: 0, item: () => null, [Symbol.iterator]: function* () {} }) as unknown as DOMRectList;
  Element.prototype.getClientRects = Element.prototype.getClientRects ?? emptyRects;
  Range.prototype.getClientRects = Range.prototype.getClientRects ?? emptyRects;
  Range.prototype.getBoundingClientRect =
    Range.prototype.getBoundingClientRect ?? (() => new DOMRect());
});

describe("mountVanillaMarkdownEditor — readOnly prop とモード切替の分離", () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
    document.body.replaceChildren();
  });

  /** モード切替グループ内のボタンを aria-label で取得する。 */
  function modeButton(label: string): HTMLButtonElement {
    const btn = container.querySelector<HTMLButtonElement>(
      `div[role="group"][aria-label="editMode"] button[aria-label="${label}"]`,
    );
    if (!btn) throw new Error(`mode button not found: ${label}`);
    return btn;
  }

  /** 現在 aria-pressed="true" のモードボタンの aria-label。 */
  function pressedMode(): string | null {
    const group = container.querySelector('div[role="group"][aria-label="editMode"]');
    return group?.querySelector('button[aria-pressed="true"]')?.getAttribute("aria-label") ?? null;
  }

  /** ツールバー全体から aria-label でボタンを取得する。 */
  function toolbarButton(label: string): HTMLButtonElement {
    const btn = container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
    if (!btn) throw new Error(`button not found: ${label}`);
    return btn;
  }

  it("readOnly prop 有効時はモード切替を無効化し、読み取り専用を状態表示する", () => {
    const handle = mountVanillaMarkdownEditor(container, {
      t,
      initialContent: "# a",
      readOnly: true,
      showReadonlyMode: true,
    });

    expect(pressedMode()).toBe("readonly");
    for (const label of ["readonly", "review", "wysiwyg", "source"]) {
      expect(modeButton(label).disabled).toBe(true);
    }
    // editingLocked() は hostReadOnly / readonlyMode の論理和。ユーザー選択モードが false でも
    // ホスト強制ロックだけで編集系ボタンが無効化されること（本バグの主眼）を直接押さえる。
    expect(toolbarButton("createNew").disabled).toBe(true);
    expect(toolbarButton("compare").disabled).toBe(true);

    handle.destroy();
  });

  it("readOnly prop が解除されるとモード切替が復帰し wysiwyg に戻る", () => {
    const handle = mountVanillaMarkdownEditor(container, {
      t,
      initialContent: "# a",
      readOnly: true,
      showReadonlyMode: true,
    });

    handle.update({ readOnly: false });

    // ロック解除後は内部 mode（wysiwyg）が素直に表に出る。
    expect(pressedMode()).toBe("wysiwyg");
    expect(modeButton("review").disabled).toBe(false);

    modeButton("review").click();
    expect(pressedMode()).toBe("review");

    handle.destroy();
  });

  it("ユーザーが選んだ readonly モードは「編集」へ戻せる", () => {
    const handle = mountVanillaMarkdownEditor(container, {
      t,
      initialContent: "# a",
      showReadonlyMode: true,
    });

    modeButton("readonly").click();
    expect(pressedMode()).toBe("readonly");

    modeButton("wysiwyg").click();
    expect(pressedMode()).toBe("wysiwyg");

    handle.destroy();
  });

  it("readonly モードでは編集系ボタンを再評価して無効化する", () => {
    const handle = mountVanillaMarkdownEditor(container, {
      t,
      initialContent: "# a",
      showReadonlyMode: true,
    });

    expect(toolbarButton("createNew").disabled).toBe(false);
    expect(toolbarButton("compare").disabled).toBe(false);

    modeButton("readonly").click();

    expect(toolbarButton("createNew").disabled).toBe(true);
    expect(toolbarButton("compare").disabled).toBe(true);

    modeButton("wysiwyg").click();

    expect(toolbarButton("createNew").disabled).toBe(false);
    expect(toolbarButton("compare").disabled).toBe(false);

    handle.destroy();
  });
});

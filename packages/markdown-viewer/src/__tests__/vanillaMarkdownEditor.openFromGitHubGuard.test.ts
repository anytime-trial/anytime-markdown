/**
 * host/vanillaMarkdownEditor.ts — 「GitHub から開く」経路の未保存ガードのテスト。
 *
 * GitHub オープンは fileOps の外側で本文を差し替えるため、Drive 経路と同様に
 * `fileOps.confirmContinue()`（= guardDirty）を通す必要がある。ガードを外すと
 * 未保存の編集内容が黙って破棄される。ツールバー / メニューのテストは「項目が並ぶか」
 * しか見ないため、ラッパを削除・反転してもそちらは green のまま通る。
 *
 * mock 方針は vanillaMarkdownEditor.regression.test.ts と同一。
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

describe("mountVanillaMarkdownEditor — GitHub から開く経路の未保存ガード", () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
    document.body.replaceChildren();
  });

  /** 「開く」メニューを開き、GitHub 項目をクリックする。 */
  function clickOpenFromGitHub(): void {
    const openBtn = container.querySelector('button[aria-label="openFile"]') as HTMLButtonElement;
    openBtn.click();
    const items = [...document.querySelectorAll('[role="menu"] [role="menuitem"]')];
    const gitHubItem = items.find((el) => el.textContent?.includes("openFromGitHub"));
    if (!gitHubItem) throw new Error("openFromGitHub のメニュー項目が見つからない");
    (gitHubItem as HTMLElement).click();
  }

  it("未編集ならガードを通過して onOpenFromGitHub を呼ぶ", async () => {
    const onOpenFromGitHub = jest.fn();
    const confirmSave = jest.fn();
    const handle = mountVanillaMarkdownEditor(container, {
      t,
      initialContent: "# a",
      fileHandlers: { onOpenFromGitHub },
      confirmSave,
    });

    clickOpenFromGitHub();
    await Promise.resolve();

    expect(confirmSave).not.toHaveBeenCalled();
    expect(onOpenFromGitHub).toHaveBeenCalledTimes(1);

    handle.destroy();
  });

  it("未保存の編集がありキャンセルすると onOpenFromGitHub を呼ばない", async () => {
    const onOpenFromGitHub = jest.fn();
    const confirmSave = jest.fn().mockResolvedValue("cancel");
    const handle = mountVanillaMarkdownEditor(container, {
      t,
      initialContent: "# a",
      fileHandlers: { onOpenFromGitHub },
      confirmSave,
    });
    handle.editor.commands.insertContent("x"); // dirty 化

    clickOpenFromGitHub();
    await Promise.resolve();
    await Promise.resolve();

    expect(confirmSave).toHaveBeenCalledTimes(1);
    expect(onOpenFromGitHub).not.toHaveBeenCalled();

    handle.destroy();
  });

  it("未保存の編集を破棄すれば onOpenFromGitHub を呼ぶ", async () => {
    const onOpenFromGitHub = jest.fn();
    const confirmSave = jest.fn().mockResolvedValue("discard");
    const handle = mountVanillaMarkdownEditor(container, {
      t,
      initialContent: "# a",
      fileHandlers: { onOpenFromGitHub },
      confirmSave,
    });
    handle.editor.commands.insertContent("x");

    clickOpenFromGitHub();
    await Promise.resolve();
    await Promise.resolve();

    expect(confirmSave).toHaveBeenCalledTimes(1);
    expect(onOpenFromGitHub).toHaveBeenCalledTimes(1);

    handle.destroy();
  });
});

/**
 * components-vanilla/EditorDialogs.ts の素 DOM ファクトリのユニットテスト。
 *
 * jest-dom は未導入のため素の DOM API で検証する。React/JSX は使わない。
 * createDialog は self-append（document.body へ自前マウント）するため body から検索する。
 *
 * jsdom の罠回避（F1/F2/G2 知見）:
 *  - getComputedStyle で継承 CSS カスタムプロパティを検証しない（style.cssText の var(--am-...) を見る）。
 *  - currentColor / border shorthand / opacity:var() は jsdom で round-trip しないため検証しない。
 */

import { createEditorDialogs, type EditorDialogsHandle } from "../components-vanilla/EditorDialogs";

const t = (key: string): string => key;

function dialogEl(): HTMLElement | null {
  return document.body.querySelector('[role="dialog"]');
}

function buttons(): HTMLButtonElement[] {
  return Array.from(document.body.querySelectorAll('[role="dialog"] button')) as HTMLButtonElement[];
}

/** 末尾の actions ボタン（cancel, insert）から insert（contained）を取る。 */
function insertButton(): HTMLButtonElement {
  const bs = buttons();
  return bs[bs.length - 1];
}

function typeInto(input: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  input.value = value;
  input.dispatchEvent(new Event("input"));
}

describe("createEditorDialogs", () => {
  let handle: EditorDialogsHandle;
  let comment: string[];
  let link: string[];
  let image: Array<[string, string]>;

  beforeEach(() => {
    comment = [];
    link = [];
    image = [];
    handle = createEditorDialogs({
      t,
      onCommentInsert: (text) => comment.push(text),
      onLinkInsert: (url) => link.push(url),
      onImageInsert: (url, alt) => image.push([url, alt]),
    });
  });

  afterEach(() => {
    handle.destroy();
    // 念のため取り残しを掃除。
    document.body.querySelectorAll('[role="dialog"]').forEach((d) => d.closest("div")?.remove());
  });

  it("openComment で multiline TextField を持つダイアログを body へ自前マウントする", () => {
    handle.openComment();
    expect(dialogEl()).toBeTruthy();
    expect(document.body.querySelector('[role="dialog"] textarea')).toBeTruthy();
    // 空入力では insert ボタンが disabled。
    expect(insertButton().disabled).toBe(true);
  });

  it("comment 入力で insert が活性化し、クリックで onCommentInsert + 閉じる", () => {
    handle.openComment();
    const ta = document.body.querySelector('[role="dialog"] textarea') as HTMLTextAreaElement;
    typeInto(ta, "hello");
    expect(insertButton().disabled).toBe(false);
    insertButton().click();
    expect(comment).toEqual(["hello"]);
    expect(dialogEl()).toBeNull();
  });

  it("openComment は初期テキストを反映する", () => {
    handle.openComment("seed");
    const ta = document.body.querySelector('[role="dialog"] textarea') as HTMLTextAreaElement;
    expect(ta.value).toBe("seed");
    expect(insertButton().disabled).toBe(false);
  });

  it("openLink: Enter で onLinkInsert を発火して閉じる", () => {
    handle.openLink();
    const input = document.body.querySelector('[role="dialog"] input') as HTMLInputElement;
    typeInto(input, "https://example.com");
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    expect(link).toEqual(["https://example.com"]);
    expect(dialogEl()).toBeNull();
  });

  it("openImage: 2 つの TextField を持ち、data: URL は disabled + (base64) 表示", () => {
    handle.openImage("data:image/png;base64,AAAA", "alt0");
    const inputs = document.body.querySelectorAll('[role="dialog"] input');
    expect(inputs.length).toBe(2);
    const urlInput = inputs[0] as HTMLInputElement;
    expect(urlInput.value).toBe("(base64)");
    expect(urlInput.disabled).toBe(true);
    // data: は空でないので insert は活性。
    expect(insertButton().disabled).toBe(false);
  });

  it("openImage: imageEditMode で insert ラベルが apply になる", () => {
    const h = createEditorDialogs({
      t,
      onCommentInsert: () => {},
      onLinkInsert: () => {},
      onImageInsert: () => {},
      imageEditMode: true,
    });
    h.openImage("http://x/y.png", "a");
    expect(insertButton().textContent).toContain("apply");
    h.destroy();
  });

  it("openImage: url + alt を渡して onImageInsert", () => {
    handle.openImage();
    const inputs = document.body.querySelectorAll('[role="dialog"] input');
    typeInto(inputs[0] as HTMLInputElement, "http://x/z.png");
    typeInto(inputs[1] as HTMLInputElement, "my alt");
    insertButton().click();
    expect(image).toEqual([["http://x/z.png", "my alt"]]);
    expect(dialogEl()).toBeNull();
  });

  it("openShortcuts: 情報ダイアログを開く（KEYBOARD_SHORTCUTS のキーチップ）", () => {
    handle.openShortcuts();
    expect(dialogEl()).toBeTruthy();
    // 少なくとも 1 つのキーチップ（monospace span）が描画される。
    const hasKeyChip = Array.from(document.body.querySelectorAll('[role="dialog"] span')).some((s) =>
      (s as HTMLElement).style.cssText.includes("monospace"),
    );
    expect(hasKeyChip).toBe(true);
  });

  it("openVersion: バージョン情報ダイアログを開く", () => {
    handle.openVersion();
    expect(dialogEl()).toBeTruthy();
    expect(document.body.querySelector('[role="dialog"] img')).toBeTruthy();
  });

  it("同時に開くのは 1 つ（新規 open は既存を閉じる）", () => {
    handle.openComment();
    handle.openLink();
    expect(document.body.querySelectorAll('[role="dialog"]').length).toBe(1);
    // link ダイアログ（input・textarea なし）。
    expect(document.body.querySelector('[role="dialog"] textarea')).toBeNull();
    expect(document.body.querySelector('[role="dialog"] input')).toBeTruthy();
  });

  it("closeAll / destroy でダイアログを除去する", () => {
    handle.openComment();
    handle.closeAll();
    expect(dialogEl()).toBeNull();
    handle.openLink();
    handle.destroy();
    expect(dialogEl()).toBeNull();
    // destroy 後は open しても開かない。
    handle.openComment();
    expect(dialogEl()).toBeNull();
  });

  it("cancel ボタンで閉じ、コールバックは発火しない", () => {
    handle.openComment();
    const bs = buttons();
    bs[0].click(); // cancel
    expect(comment).toEqual([]);
    expect(dialogEl()).toBeNull();
  });
});

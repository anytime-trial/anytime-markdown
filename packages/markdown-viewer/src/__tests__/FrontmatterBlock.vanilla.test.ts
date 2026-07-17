/**
 * components-vanilla/FrontmatterBlock の回帰テスト。
 *
 * React 除去（G4-B）でフロントマターの折りたたみ/編集/削除が失われた不具合の再発防止。
 * 開閉トグル・編集 onChange・削除（確認）・readOnly・expandAndFocus を検証する。
 */

import {
  createFrontmatterBlock,
  type FrontmatterBlockHandle,
} from "../components-vanilla/FrontmatterBlock";

const t = (key: string): string => key;

function header(block: FrontmatterBlockHandle): HTMLElement {
  return block.el.querySelector<HTMLElement>("div")!;
}
function textarea(block: FrontmatterBlockHandle): HTMLTextAreaElement | null {
  return block.el.querySelector<HTMLTextAreaElement>("[data-frontmatter-editor]");
}

describe("createFrontmatterBlock", () => {
  it("value=null のときは非表示（自己 hide）", () => {
    const block = createFrontmatterBlock({ initial: null, t, onChange: () => {} });
    expect(block.el.style.display).toBe("none");
    expect(textarea(block)).toBeNull();
    block.destroy();
  });

  it("既定で折りたたみ: ヘッダのみ表示・textarea なし", () => {
    const block = createFrontmatterBlock({ initial: "title: A", t, onChange: () => {} });
    expect(block.el.style.display).not.toBe("none");
    expect(block.el.textContent).toContain("Frontmatter");
    expect(textarea(block)).toBeNull();
    block.destroy();
  });

  it("ヘッダクリックで開閉できる", () => {
    const block = createFrontmatterBlock({ initial: "title: A", t, onChange: () => {} });
    // 開く
    header(block).click();
    expect(textarea(block)).not.toBeNull();
    expect(textarea(block)?.value).toBe("title: A");
    // 閉じる
    header(block).click();
    expect(textarea(block)).toBeNull();
    block.destroy();
  });

  it("ヘッダは role=button + tabindex でキーボード開閉できる", () => {
    const block = createFrontmatterBlock({ initial: "title: A", t, onChange: () => {} });
    const h = header(block);
    expect(h.getAttribute("role")).toBe("button");
    expect(h.tabIndex).toBe(0);
    expect(h.getAttribute("aria-expanded")).toBe("false");
    h.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(textarea(block)).not.toBeNull();
    expect(h.getAttribute("aria-expanded")).toBe("true");
    h.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true }));
    expect(textarea(block)).toBeNull();
    block.destroy();
  });

  it("textarea 編集で onChange(value) が発火する", () => {
    const onChange = jest.fn();
    const block = createFrontmatterBlock({ initial: "title: A", t, onChange });
    header(block).click();
    const ta = textarea(block)!;
    ta.value = "title: B";
    ta.dispatchEvent(new Event("input"));
    expect(onChange).toHaveBeenCalledWith("title: B");
    block.destroy();
  });

  it("空入力で onChange(null) が発火する", () => {
    const onChange = jest.fn();
    const block = createFrontmatterBlock({ initial: "title: A", t, onChange });
    header(block).click();
    const ta = textarea(block)!;
    ta.value = "";
    ta.dispatchEvent(new Event("input"));
    expect(onChange).toHaveBeenCalledWith(null);
    block.destroy();
  });

  it("削除ボタン: confirm OK で onChange(null) + 非表示", async () => {
    const onChange = jest.fn();
    const confirm = jest.fn().mockResolvedValue(true);
    const block = createFrontmatterBlock({ initial: "title: A", t, confirm, onChange });
    const delBtn = block.el.querySelector<HTMLButtonElement>("button")!;
    delBtn.click();
    await Promise.resolve();
    await Promise.resolve();
    expect(confirm).toHaveBeenCalledWith("deleteFrontmatterConfirm");
    expect(onChange).toHaveBeenCalledWith(null);
    expect(block.el.style.display).toBe("none");
    block.destroy();
  });

  it("削除ボタン: confirm キャンセルで onChange が呼ばれない", async () => {
    const onChange = jest.fn();
    const confirm = jest.fn().mockResolvedValue(false);
    const block = createFrontmatterBlock({ initial: "title: A", t, confirm, onChange });
    block.el.querySelector<HTMLButtonElement>("button")!.click();
    await Promise.resolve();
    await Promise.resolve();
    expect(onChange).not.toHaveBeenCalled();
    expect(block.el.style.display).not.toBe("none");
    block.destroy();
  });

  it("readOnly: 削除ボタン非表示・textarea が readOnly", () => {
    const block = createFrontmatterBlock({
      initial: "title: A",
      readOnly: true,
      t,
      onChange: () => {},
    });
    expect(block.el.querySelector<HTMLButtonElement>("button")?.style.display).toBe("none");
    header(block).click();
    expect(textarea(block)?.readOnly).toBe(true);
    block.destroy();
  });

  it("setReadOnly(true) で編集中の textarea も readOnly 化", () => {
    const block = createFrontmatterBlock({ initial: "title: A", t, onChange: () => {} });
    header(block).click();
    expect(textarea(block)?.readOnly).toBe(false);
    block.setReadOnly(true);
    expect(textarea(block)?.readOnly).toBe(true);
    block.destroy();
  });

  it("setValue(null→値) で展開し、expandAndFocus でフォーカスできる", () => {
    const block = createFrontmatterBlock({ initial: null, t, onChange: () => {} });
    expect(block.el.style.display).toBe("none");
    block.setValue("title: new");
    // null→値 遷移は展開する
    expect(textarea(block)).not.toBeNull();
    expect(textarea(block)?.value).toBe("title: new");
    block.destroy();
  });

  it("setValue(null→値, autoExpand: false) は折りたたみを保つ（セクションロック等のプログラム更新）", () => {
    const block = createFrontmatterBlock({ initial: null, t, onChange: () => {} });
    block.setValue("lockedSections:\n    - path: \"T > A\"", { autoExpand: false });
    // ブロック自体は表示されるが、body（textarea）は折りたたみのまま
    expect(block.el.style.display).not.toBe("none");
    expect(textarea(block)).toBeNull();
    block.destroy();
  });

  it("expandAndFocus: 折りたたみ状態から展開する", () => {
    const block = createFrontmatterBlock({ initial: "title: A", t, onChange: () => {} });
    expect(textarea(block)).toBeNull();
    block.expandAndFocus();
    expect(textarea(block)).not.toBeNull();
    block.destroy();
  });
});

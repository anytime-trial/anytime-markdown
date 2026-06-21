import { createListItemButton } from "../ListItemButton";

describe("createListItemButton", () => {
  it("li 要素を生成し role=button を持つ", () => {
    const { el } = createListItemButton();
    expect(el.tagName).toBe("LI");
    expect(el.getAttribute("role")).toBe("button");
  });

  it("children を流し込む", () => {
    const { el } = createListItemButton({ children: "click me" });
    expect(el.textContent).toBe("click me");
  });

  it("selected が true のとき aria-selected が true になる", () => {
    const { el } = createListItemButton({ selected: true });
    expect(el.getAttribute("aria-selected")).toBe("true");
  });

  it("selected が false のとき aria-selected が false になる", () => {
    const { el } = createListItemButton({ selected: false });
    expect(el.getAttribute("aria-selected")).toBe("false");
  });

  it("disabled が true のとき aria-disabled が true になる", () => {
    const { el } = createListItemButton({ disabled: true });
    expect(el.getAttribute("aria-disabled")).toBe("true");
  });

  it("disabled が true のとき tabIndex が -1 になる", () => {
    const { el } = createListItemButton({ disabled: true });
    expect(el.tabIndex).toBe(-1);
  });

  it("disabled が false のとき tabIndex が 0 になる", () => {
    const { el } = createListItemButton({ disabled: false });
    expect(el.tabIndex).toBe(0);
  });

  it("クリックで onClick が呼ばれる", () => {
    const onClick = jest.fn();
    const { el } = createListItemButton({ onClick });
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("disabled 時はクリックで onClick が呼ばれない", () => {
    const onClick = jest.fn();
    const { el } = createListItemButton({ onClick, disabled: true });
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(onClick).not.toHaveBeenCalled();
  });

  it("Enter キーで onClick が呼ばれる", () => {
    const onClick = jest.fn();
    const { el } = createListItemButton({ onClick });
    el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("Space キーで onClick が呼ばれる", () => {
    const onClick = jest.fn();
    const { el } = createListItemButton({ onClick });
    el.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("disabled 時はキーで onClick が呼ばれない", () => {
    const onClick = jest.fn();
    const { el } = createListItemButton({ onClick, disabled: true });
    el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(onClick).not.toHaveBeenCalled();
  });

  it("className に am-list-item-button を含む", () => {
    const { el } = createListItemButton({ className: "custom" });
    expect(el.className).toContain("am-list-item-button");
    expect(el.className).toContain("custom");
  });

  it("ariaLabel を反映する", () => {
    const { el } = createListItemButton({ ariaLabel: "open file" });
    expect(el.getAttribute("aria-label")).toBe("open file");
  });

  it("testId を反映する", () => {
    const { el } = createListItemButton({ testId: "lib-test" });
    expect(el.getAttribute("data-testid")).toBe("lib-test");
  });

  it("style を反映する", () => {
    const { el } = createListItemButton({ style: { color: "blue" } });
    expect(el.style.color).toBe("blue");
  });

  it("destroy 後はクリックで onClick が呼ばれない", () => {
    const onClick = jest.fn();
    const { el, destroy } = createListItemButton({ onClick });
    destroy();
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(onClick).not.toHaveBeenCalled();
  });

  it("update で selected を切り替えられる", () => {
    const { el, update } = createListItemButton({ selected: false });
    expect(el.getAttribute("aria-selected")).toBe("false");
    update({ selected: true });
    expect(el.getAttribute("aria-selected")).toBe("true");
  });

  it("update で disabled を切り替えられる", () => {
    const { el, update } = createListItemButton({ disabled: false });
    expect(el.hasAttribute("aria-disabled")).toBe(false);
    update({ disabled: true });
    expect(el.getAttribute("aria-disabled")).toBe("true");
  });

  it("onContextMenu が右クリックで呼ばれる", () => {
    const onContextMenu = jest.fn();
    const { el } = createListItemButton({ onContextMenu });
    el.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));
    expect(onContextMenu).toHaveBeenCalledTimes(1);
  });

  it("disabled=false のとき aria-disabled 属性を持たない", () => {
    const { el } = createListItemButton({ disabled: false });
    expect(el.hasAttribute("aria-disabled")).toBe(false);
  });

  it("update で disabled=true にすると aria-disabled=true かつ tabIndex=-1 になる", () => {
    const { el, update } = createListItemButton({ disabled: false });
    update({ disabled: true });
    expect(el.getAttribute("aria-disabled")).toBe("true");
    expect(el.tabIndex).toBe(-1);
  });

  it("update で disabled=false にすると aria-disabled が除去され tabIndex=0 になる", () => {
    const { el, update } = createListItemButton({ disabled: true });
    update({ disabled: false });
    expect(el.hasAttribute("aria-disabled")).toBe(false);
    expect(el.tabIndex).toBe(0);
  });
});

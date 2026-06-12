/**
 * ui-vanilla ファクトリ群のユニットテスト。
 * React 版 ui/*.tsx と同一のクラス名・DOM 構造・aria 属性を生成することを検証する。
 */

import {
  attachSvTooltip,
  createSvButton,
  createSvIconButton,
  createSvMenuItem,
  createSvRadioGroup,
  createSvSelect,
  createSvToggleGroup,
  openSvDialog,
  openSvMenu,
  svIcon,
} from "../ui-vanilla";

afterEach(() => {
  document.body.innerHTML = "";
  document.getElementById("anytime-spreadsheet-ui-styles")?.remove();
});

describe("ui-vanilla", () => {
  it("createSvButton: variant/size/color のクラス合成が React 版と一致する", () => {
    const btn = createSvButton({ label: "OK", variant: "contained", size: "small", color: "inherit" });
    expect(btn.className).toBe("sv-btn sv-btn--contained sv-btn--inherit sv-btn--small");
    expect(btn.type).toBe("button");
    expect(document.getElementById("anytime-spreadsheet-ui-styles")).toBeTruthy();
  });

  it("createSvIconButton: sv-icon-btn とクリックハンドラ", () => {
    const onClick = jest.fn();
    const btn = createSvIconButton({ icon: svIcon("Add"), size: "small", onClick });
    expect(btn.className).toBe("sv-icon-btn sv-icon-btn--small");
    expect(btn.querySelector('[data-testid="AddIcon"]')).toBeTruthy();
    btn.click();
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("svIcon: MUI 互換の data-testid と 1em サイズ", () => {
    const icon = svIcon("Delete", { fontSize: "small" });
    expect(icon.dataset.testid).toBe("DeleteIcon");
    expect(icon.getAttribute("width")).toBe("1em");
    expect(icon.style.fontSize).toBe("1.25rem");
  });

  it("openSvMenu: backdrop + role=menu paper を body に展開し close で除去する", () => {
    const onClose = jest.fn();
    const handle = openSvMenu({ anchorPosition: { top: 10, left: 20 }, onClose });
    expect(handle).toBeTruthy();
    expect(document.querySelector(".sv-menu-backdrop")).toBeTruthy();
    const paper = document.querySelector(".sv-menu-paper") as HTMLElement;
    expect(paper.getAttribute("role")).toBe("menu");
    expect(paper.style.top).toBe("10px");

    paper.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(onClose).toHaveBeenCalled();

    handle?.close();
    expect(document.querySelector(".sv-menu-paper")).toBeNull();
  });

  it("createSvMenuItem: role=menuitem + アイコン/ラベル構造", () => {
    const item = createSvMenuItem({ label: "コピー", icon: svIcon("ContentCopy") });
    expect(item.getAttribute("role")).toBe("menuitem");
    expect(item.querySelector(".sv-list-item-icon")).toBeTruthy();
    expect(item.querySelector(".sv-list-item-text")?.textContent).toBe("コピー");
  });

  it("openSvDialog: role=dialog を開き Escape で onClose・close で除去", () => {
    const onClose = jest.fn();
    const content = document.createElement("div");
    const handle = openSvDialog({ title: "確認", content, onClose });
    expect(document.querySelector('[role="dialog"]')).toBeTruthy();
    expect(document.querySelector(".sv-dialog-title")?.textContent).toBe("確認");

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(onClose).toHaveBeenCalled();

    handle.close();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it("createSvToggleGroup: aria-pressed で選択状態を表現し setValue で切り替わる", () => {
    const group = createSvToggleGroup({
      value: "left",
      buttons: [
        { value: "left", content: document.createTextNode("L") },
        { value: "right", content: document.createTextNode("R") },
      ],
      onChange: jest.fn(),
    });
    const [left, right] = [...group.el.querySelectorAll("button")];
    expect(left.getAttribute("aria-pressed")).toBe("true");
    expect(right.getAttribute("aria-pressed")).toBe("false");
    group.setValue("right");
    expect(right.getAttribute("aria-pressed")).toBe("true");
  });

  it("createSvSelect / createSvRadioGroup: 値変更がコールバックへ伝わる", () => {
    const onChange = jest.fn();
    const select = createSvSelect({
      value: "a",
      options: [
        { value: "a", label: "A" },
        { value: "b", label: "B" },
      ],
      onChange,
    });
    select.value = "b";
    select.dispatchEvent(new Event("change"));
    expect(onChange).toHaveBeenCalledWith("b");

    const onRadio = jest.fn();
    const radios = createSvRadioGroup({
      name: "g",
      value: "x",
      options: [
        { value: "x", label: "X" },
        { value: "y", label: "Y" },
      ],
      onChange: onRadio,
    });
    const y = [...radios.el.querySelectorAll("input")][1];
    y.checked = true;
    y.dispatchEvent(new Event("change"));
    expect(onRadio).toHaveBeenCalledWith("y");
  });

  it("attachSvTooltip: hover で表示・leave と dispose で除去", () => {
    const target = document.createElement("button");
    document.body.appendChild(target);
    const dispose = attachSvTooltip(target, "ヒント");

    target.dispatchEvent(new Event("mouseenter"));
    expect(document.querySelector(".sv-tooltip")?.textContent).toBe("ヒント");

    target.dispatchEvent(new Event("mouseleave"));
    expect(document.querySelector(".sv-tooltip")).toBeNull();

    target.dispatchEvent(new Event("mouseenter"));
    dispose();
    expect(document.querySelector(".sv-tooltip")).toBeNull();
  });
});

/**
 * createTab / createTabs（ui-vanilla/Tabs）の jsdom ユニットテスト。
 *
 * 検証観点: DOM 生成 / role / aria-selected / tabIndex / CSS 変数参照（cssText）/
 * クリックでの onChange 発火 / update による選択再描画 / destroy のクリーンアップ。
 *
 * 注意: jsdom は継承された CSS カスタムプロパティを getComputedStyle で解決しないため、
 * 色の computed 値は検証しない。代わりに el.style.cssText が var(--am-...) を含むことを検証する。
 */

import { createTab, createTabs } from "@anytime-markdown/graph-core/ui-vanilla/Tabs";

describe("createTab", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    document.documentElement.removeAttribute("style");
  });

  it("button[role=tab] を生成し label を持つ", () => {
    const { el } = createTab({ value: "a", label: "First" });
    expect(el.tagName).toBe("BUTTON");
    expect(el.type).toBe("button");
    expect(el.getAttribute("role")).toBe("tab");
    expect(el.getAttribute("data-value")).toBe("a");
    expect(el.textContent).toBe("First");
  });

  it("非選択時は aria-selected=false / tabIndex=-1 / text-secondary を参照する", () => {
    const { el } = createTab({ value: "a", label: "First" });
    expect(el.getAttribute("aria-selected")).toBe("false");
    expect(el.tabIndex).toBe(-1);
    expect(el.style.cssText).toContain("var(--am-color-text-secondary)");
    // 下線は透明（border-bottom 2px transparent はベース CSS に含まれる）。
    expect(el.style.cssText).toContain("border-bottom: 2px solid transparent");
  });

  it("選択時は aria-selected=true / tabIndex=0 / primary-main を参照する", () => {
    const { el } = createTab({ value: "a", label: "First", selected: true });
    expect(el.getAttribute("aria-selected")).toBe("true");
    expect(el.tabIndex).toBe(0);
    expect(el.style.cssText).toContain("var(--am-color-primary-main)");
    // 下線色も primary-main（border-bottom-color）。
    expect(el.style.cssText).toContain("border-bottom-color: var(--am-color-primary-main)");
  });

  it("disabled で button を無効化する", () => {
    const { el } = createTab({ value: "a", label: "X", disabled: true });
    expect(el.disabled).toBe(true);
  });

  it("ariaLabel / title / className / testId を設定する", () => {
    const { el } = createTab({
      value: "a",
      label: "X",
      ariaLabel: "最初のタブ",
      title: "ヒント",
      className: "my-tab",
      testId: "tab-a",
    });
    expect(el.getAttribute("aria-label")).toBe("最初のタブ");
    expect(el.title).toBe("ヒント");
    expect(el.className).toBe("my-tab");
    expect(el.getAttribute("data-testid")).toBe("tab-a");
  });

  it("label 未指定なら children を描画する", () => {
    const node = document.createElement("b");
    node.textContent = "bold";
    const { el } = createTab({ value: "a", children: node });
    expect(el.querySelector("b")?.textContent).toBe("bold");
  });

  it("click で onClick(value) が発火する", () => {
    const onClick = jest.fn();
    const { el } = createTab({ value: "a", label: "X", onClick });
    el.click();
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onClick).toHaveBeenCalledWith("a");
  });

  describe("update", () => {
    it("selected を切り替えると aria-selected / tabIndex / cssText が更新される", () => {
      const { el, update } = createTab({ value: "a", label: "X" });
      expect(el.getAttribute("aria-selected")).toBe("false");
      update({ selected: true });
      expect(el.getAttribute("aria-selected")).toBe("true");
      expect(el.tabIndex).toBe(0);
      expect(el.style.cssText).toContain("var(--am-color-primary-main)");
      update({ selected: false });
      expect(el.getAttribute("aria-selected")).toBe("false");
      expect(el.tabIndex).toBe(-1);
      expect(el.style.cssText).toContain("var(--am-color-text-secondary)");
    });

    it("disabled を切り替える", () => {
      const { el, update } = createTab({ value: "a", label: "X" });
      expect(el.disabled).toBe(false);
      update({ disabled: true });
      expect(el.disabled).toBe(true);
    });

    it("label を差し替える", () => {
      const { el, update } = createTab({ value: "a", label: "old" });
      update({ label: "new" });
      expect(el.textContent).toBe("new");
    });

    it("onClick を差し替えると旧ハンドラは呼ばれない", () => {
      const first = jest.fn();
      const second = jest.fn();
      const { el, update } = createTab({ value: "a", label: "X", onClick: first });
      update({ onClick: second });
      el.click();
      expect(first).not.toHaveBeenCalled();
      expect(second).toHaveBeenCalledWith("a");
    });
  });

  it("destroy 後は click で onClick が呼ばれない", () => {
    const onClick = jest.fn();
    const { el, destroy } = createTab({ value: "a", label: "X", onClick });
    el.click();
    expect(onClick).toHaveBeenCalledTimes(1);
    destroy();
    el.click();
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe("createTabs", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    document.documentElement.removeAttribute("style");
  });

  const sampleTabs = [
    { value: "a", label: "First" },
    { value: "b", label: "Second" },
    { value: "c", label: "Third" },
  ] as const;

  it("div[role=tablist] を生成し各 Tab を描画する", () => {
    const { el } = createTabs({ value: "a", tabs: sampleTabs });
    expect(el.tagName).toBe("DIV");
    expect(el.getAttribute("role")).toBe("tablist");
    const tabEls = el.querySelectorAll('[role="tab"]');
    expect(tabEls.length).toBe(3);
    expect(el.style.cssText).toContain("var(--am-tabs-min-height, 32px)");
  });

  it("value に一致する Tab のみ aria-selected=true になる", () => {
    const { el } = createTabs({ value: "b", tabs: sampleTabs });
    const tabEls = [...el.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
    expect(tabEls.map((t) => t.getAttribute("aria-selected"))).toEqual([
      "false",
      "true",
      "false",
    ]);
    expect(tabEls.map((t) => t.tabIndex)).toEqual([-1, 0, -1]);
  });

  it("Tab クリックで onChange(value) が発火する", () => {
    const onChange = jest.fn();
    const { el } = createTabs({ value: "a", tabs: sampleTabs, onChange });
    const second = el.querySelectorAll<HTMLButtonElement>('[role="tab"]')[1];
    second.click();
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("b");
  });

  it("className / testId / ariaLabel を設定する", () => {
    const { el } = createTabs({
      value: "a",
      tabs: sampleTabs,
      className: "my-tabs",
      testId: "tabs-root",
      ariaLabel: "セクション",
    });
    expect(el.className).toBe("my-tabs");
    expect(el.getAttribute("data-testid")).toBe("tabs-root");
    expect(el.getAttribute("aria-label")).toBe("セクション");
  });

  describe("update", () => {
    it("value 変更で選択 Tab が差し替わる（再構築せず差分更新）", () => {
      const { el, update } = createTabs({ value: "a", tabs: sampleTabs });
      const before = el.querySelectorAll('[role="tab"]')[0];
      update({ value: "c" });
      const tabEls = [...el.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
      expect(tabEls.map((t) => t.getAttribute("aria-selected"))).toEqual([
        "false",
        "false",
        "true",
      ]);
      // 差分更新なので既存の要素インスタンスが維持される。
      expect(el.querySelectorAll('[role="tab"]')[0]).toBe(before);
    });

    it("tabs 差し替えで Tab を再構築する", () => {
      const { el, update } = createTabs({ value: "a", tabs: sampleTabs });
      update({
        value: "x",
        tabs: [
          { value: "x", label: "X" },
          { value: "y", label: "Y" },
        ],
      });
      const tabEls = [...el.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
      expect(tabEls.length).toBe(2);
      expect(tabEls[0].getAttribute("aria-selected")).toBe("true");
      expect(tabEls[0].textContent).toBe("X");
    });

    it("onChange 差し替え後は新ハンドラが発火する", () => {
      const first = jest.fn();
      const second = jest.fn();
      const { el, update } = createTabs({ value: "a", tabs: sampleTabs, onChange: first });
      update({ onChange: second });
      el.querySelectorAll<HTMLButtonElement>('[role="tab"]')[1].click();
      expect(first).not.toHaveBeenCalled();
      expect(second).toHaveBeenCalledWith("b");
    });
  });

  it("destroy 後は Tab クリックで onChange が呼ばれない", () => {
    const onChange = jest.fn();
    const { el, destroy } = createTabs({ value: "a", tabs: sampleTabs, onChange });
    const second = el.querySelectorAll<HTMLButtonElement>('[role="tab"]')[1];
    second.click();
    expect(onChange).toHaveBeenCalledTimes(1);
    destroy();
    second.click();
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});

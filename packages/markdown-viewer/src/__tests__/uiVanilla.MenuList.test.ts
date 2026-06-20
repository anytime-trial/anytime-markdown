/**
 * createMenuList（ui-vanilla/MenuList）の jsdom ユニットテスト。
 *
 * 検証観点: DOM 生成 / role / CSS 変数参照（cssText）/ items append / キーボード state machine
 * （↑↓ / Home / End / Enter / Esc / wraparound / disabled スキップ）/ roving tabindex +
 * aria-activedescendant / pointerover ハイライト追従 / update / destroy のクリーンアップ。
 *
 * 注意: jsdom は継承された CSS カスタムプロパティを getComputedStyle で解決しないため、
 * 色の computed 値は検証しない。代わりに el.style.cssText の内容を検証する。
 */

import { createMenuList } from "@anytime-markdown/ui-core/MenuList";

/** テスト用の menuitem li を生成する。 */
function makeItem(label: string, opts: { disabled?: boolean } = {}): HTMLLIElement {
  const li = document.createElement("li");
  li.setAttribute("role", "menuitem");
  li.tabIndex = -1;
  li.textContent = label;
  if (opts.disabled) li.setAttribute("aria-disabled", "true");
  return li;
}

/** ul へ keydown を投げる。 */
function press(el: HTMLElement, key: string): KeyboardEvent {
  const evt = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
  el.dispatchEvent(evt);
  return evt;
}

describe("ui-vanilla/MenuList", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    document.documentElement.removeAttribute("style");
  });

  it("ul[role=menu] を生成し cssText に padding 8px 0 を含む", () => {
    const { el } = createMenuList();
    expect(el.tagName).toBe("UL");
    expect(el.getAttribute("role")).toBe("menu");
    expect(el.style.cssText).toContain("padding: 8px 0");
    expect(el.style.cssText).toContain("list-style: none");
  });

  it("role を listbox に変更できる", () => {
    const { el } = createMenuList({ role: "listbox" });
    expect(el.getAttribute("role")).toBe("listbox");
  });

  it("items（配列）を ul に append する", () => {
    const items = [makeItem("A"), makeItem("B"), makeItem("C")];
    const { el } = createMenuList({ items });
    expect(el.querySelectorAll('[role="menuitem"]').length).toBe(3);
  });

  it("ariaLabel / className / testId を設定する", () => {
    const { el } = createMenuList({
      ariaLabel: "メニュー",
      className: "my-menu",
      testId: "menu-1",
    });
    expect(el.getAttribute("aria-label")).toBe("メニュー");
    expect(el.className).toBe("my-menu");
    expect(el.getAttribute("data-testid")).toBe("menu-1");
  });

  describe("setActiveIndex / roving tabindex", () => {
    it("アクティブ項目のみ tabIndex=0 になり aria-activedescendant が連携する", () => {
      const items = [makeItem("A"), makeItem("B"), makeItem("C")];
      const { el, setActiveIndex, getActiveIndex } = createMenuList({ items });
      setActiveIndex(1);
      expect(getActiveIndex()).toBe(1);
      expect(items.map((i) => i.tabIndex)).toEqual([-1, 0, -1]);
      expect(el.getAttribute("aria-activedescendant")).toBe(items[1].id);
      expect(items[1].id).not.toBe("");
    });

    it("disabled 項目を setActiveIndex で指定しても無視される", () => {
      const items = [makeItem("A"), makeItem("B", { disabled: true }), makeItem("C")];
      const { getActiveIndex, setActiveIndex } = createMenuList({ items });
      setActiveIndex(1);
      expect(getActiveIndex()).toBe(-1);
    });

    it("setActiveIndex(-1) でハイライトを解除し aria-activedescendant を外す", () => {
      const items = [makeItem("A"), makeItem("B")];
      const { el, setActiveIndex, getActiveIndex } = createMenuList({ items });
      setActiveIndex(0);
      expect(el.getAttribute("aria-activedescendant")).not.toBeNull();
      setActiveIndex(-1);
      expect(getActiveIndex()).toBe(-1);
      expect(el.getAttribute("aria-activedescendant")).toBeNull();
    });

    it("onActiveChange はアクティブ変更時に index と el を通知する", () => {
      const items = [makeItem("A"), makeItem("B")];
      const onActiveChange = jest.fn();
      const { setActiveIndex } = createMenuList({ items, onActiveChange });
      setActiveIndex(1);
      expect(onActiveChange).toHaveBeenCalledWith(1, items[1]);
    });
  });

  describe("キーボード state machine", () => {
    it("ArrowDown で次の項目へ移動し preventDefault する", () => {
      const items = [makeItem("A"), makeItem("B"), makeItem("C")];
      const { el, getActiveIndex } = createMenuList({ items });
      const evt = press(el, "ArrowDown");
      expect(evt.defaultPrevented).toBe(true);
      expect(getActiveIndex()).toBe(0);
      press(el, "ArrowDown");
      expect(getActiveIndex()).toBe(1);
    });

    it("ArrowUp で前の項目へ移動する", () => {
      const items = [makeItem("A"), makeItem("B"), makeItem("C")];
      const { el, setActiveIndex, getActiveIndex } = createMenuList({ items });
      setActiveIndex(2);
      press(el, "ArrowUp");
      expect(getActiveIndex()).toBe(1);
    });

    it("ArrowDown は末尾で wraparound して先頭へ戻る（既定）", () => {
      const items = [makeItem("A"), makeItem("B")];
      const { el, setActiveIndex, getActiveIndex } = createMenuList({ items });
      setActiveIndex(1);
      press(el, "ArrowDown");
      expect(getActiveIndex()).toBe(0);
    });

    it("ArrowUp は先頭で wraparound して末尾へ移る（既定）", () => {
      const items = [makeItem("A"), makeItem("B"), makeItem("C")];
      const { el, setActiveIndex, getActiveIndex } = createMenuList({ items });
      setActiveIndex(0);
      press(el, "ArrowUp");
      expect(getActiveIndex()).toBe(2);
    });

    it("wraparound=false では端で止まる", () => {
      const items = [makeItem("A"), makeItem("B")];
      const { el, setActiveIndex, getActiveIndex } = createMenuList({
        items,
        wraparound: false,
      });
      setActiveIndex(1);
      press(el, "ArrowDown");
      expect(getActiveIndex()).toBe(1);
      setActiveIndex(0);
      press(el, "ArrowUp");
      expect(getActiveIndex()).toBe(0);
    });

    it("ArrowDown は disabled 項目をスキップする", () => {
      const items = [
        makeItem("A"),
        makeItem("B", { disabled: true }),
        makeItem("C"),
      ];
      const { el, setActiveIndex, getActiveIndex } = createMenuList({ items });
      setActiveIndex(0);
      press(el, "ArrowDown");
      expect(getActiveIndex()).toBe(2);
    });

    it("Home で最初の有効項目、End で最後の有効項目へ移る", () => {
      const items = [
        makeItem("A", { disabled: true }),
        makeItem("B"),
        makeItem("C"),
        makeItem("D", { disabled: true }),
      ];
      const { el, getActiveIndex } = createMenuList({ items });
      press(el, "End");
      expect(getActiveIndex()).toBe(2);
      press(el, "Home");
      expect(getActiveIndex()).toBe(1);
    });

    it("Enter でアクティブ項目を確定し onSelect を呼ぶ", () => {
      const items = [makeItem("A"), makeItem("B")];
      const onSelect = jest.fn();
      const { el, setActiveIndex } = createMenuList({ items, onSelect });
      setActiveIndex(1);
      const evt = press(el, "Enter");
      expect(evt.defaultPrevented).toBe(true);
      expect(onSelect).toHaveBeenCalledWith(1, items[1]);
    });

    it("アクティブ項目が無い状態の Enter は onSelect を呼ばない", () => {
      const items = [makeItem("A")];
      const onSelect = jest.fn();
      const { el } = createMenuList({ items, onSelect });
      press(el, "Enter");
      expect(onSelect).not.toHaveBeenCalled();
    });

    it("Escape で onCancel を呼び stopPropagation する", () => {
      const items = [makeItem("A")];
      const onCancel = jest.fn();
      const { el } = createMenuList({ items, onCancel });
      const evt = press(el, "Escape");
      expect(evt.defaultPrevented).toBe(true);
      expect(onCancel).toHaveBeenCalledTimes(1);
    });

    it("keyboard=false ではキー操作が無効", () => {
      const items = [makeItem("A"), makeItem("B")];
      const { el, getActiveIndex } = createMenuList({ items, keyboard: false });
      press(el, "ArrowDown");
      expect(getActiveIndex()).toBe(-1);
    });
  });

  describe("pointerover ハイライト追従", () => {
    it("項目ホバーでアクティブ index が追従する", () => {
      const items = [makeItem("A"), makeItem("B"), makeItem("C")];
      const { el, getActiveIndex } = createMenuList({ items });
      const evt = new Event("pointerover", { bubbles: true });
      Object.defineProperty(evt, "target", { value: items[2] });
      el.dispatchEvent(evt);
      expect(getActiveIndex()).toBe(2);
    });

    it("disabled 項目ホバーでは追従しない", () => {
      const items = [makeItem("A"), makeItem("B", { disabled: true })];
      const { el, getActiveIndex } = createMenuList({ items });
      const evt = new Event("pointerover", { bubbles: true });
      Object.defineProperty(evt, "target", { value: items[1] });
      el.dispatchEvent(evt);
      expect(getActiveIndex()).toBe(-1);
    });
  });

  describe("update", () => {
    it("items 差し替えで再構築しアクティブ index をクランプする", () => {
      const items = [makeItem("A"), makeItem("B"), makeItem("C")];
      const { el, update, setActiveIndex, getActiveIndex } = createMenuList({ items });
      setActiveIndex(2);
      update({ items: [makeItem("X")] });
      expect(el.querySelectorAll('[role="menuitem"]').length).toBe(1);
      // index 2 は新 items の範囲外なので解除される。
      expect(getActiveIndex()).toBe(-1);
      expect(el.getAttribute("aria-activedescendant")).toBeNull();
    });

    it("onSelect 差し替え後は新ハンドラが発火する", () => {
      const items = [makeItem("A")];
      const first = jest.fn();
      const second = jest.fn();
      const { el, update, setActiveIndex } = createMenuList({ items, onSelect: first });
      update({ onSelect: second });
      setActiveIndex(0);
      press(el, "Enter");
      expect(first).not.toHaveBeenCalled();
      expect(second).toHaveBeenCalledWith(0, items[0]);
    });

    it("wraparound を update で切り替えられる", () => {
      const items = [makeItem("A"), makeItem("B")];
      const { el, update, setActiveIndex, getActiveIndex } = createMenuList({ items });
      update({ wraparound: false });
      setActiveIndex(1);
      press(el, "ArrowDown");
      expect(getActiveIndex()).toBe(1);
    });

    it("keyboard を false に更新するとキー操作が無効化される", () => {
      const items = [makeItem("A"), makeItem("B")];
      const { el, update, getActiveIndex } = createMenuList({ items });
      update({ keyboard: false });
      press(el, "ArrowDown");
      expect(getActiveIndex()).toBe(-1);
    });
  });

  describe("destroy", () => {
    it("destroy 後はキー操作で onSelect / onCancel が呼ばれない", () => {
      const items = [makeItem("A")];
      const onSelect = jest.fn();
      const onCancel = jest.fn();
      const { el, setActiveIndex, destroy } = createMenuList({
        items,
        onSelect,
        onCancel,
      });
      setActiveIndex(0);
      destroy();
      press(el, "Enter");
      press(el, "Escape");
      expect(onSelect).not.toHaveBeenCalled();
      expect(onCancel).not.toHaveBeenCalled();
    });

    it("destroy 後は ArrowDown でアクティブ index が動かない", () => {
      const items = [makeItem("A"), makeItem("B")];
      const { el, getActiveIndex, destroy } = createMenuList({ items });
      destroy();
      press(el, "ArrowDown");
      expect(getActiveIndex()).toBe(-1);
    });
  });

  it("focusActive はアクティブ項目へフォーカスを移す", () => {
    const items = [makeItem("A"), makeItem("B")];
    const { el, setActiveIndex, focusActive } = createMenuList({ items });
    document.body.appendChild(el);
    setActiveIndex(1);
    focusActive();
    expect([items[1], document.body]).toContain(document.activeElement);
  });
});

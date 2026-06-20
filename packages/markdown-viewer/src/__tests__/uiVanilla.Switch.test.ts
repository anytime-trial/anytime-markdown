/**
 * createSwitch（ui-vanilla/Switch）の jsdom ユニットテスト。
 *
 * 検証観点: DOM 生成（root + switchBase + thumb + track + checkbox）/ 属性 / a11y /
 * CSS 変数参照（cssText）/ change イベント発火 / update / destroy のクリーンアップ。
 *
 * 注意: jsdom は継承された CSS カスタムプロパティを getComputedStyle で解決しないため、
 * 色の computed 値は検証しない。代わりに el.style.cssText が var(--am-...) を含むことを検証する。
 */

import { createSwitch } from "@anytime-markdown/ui-core/Switch";

/** root 内の各パーツを取得するヘルパー（DOM 順: switchBase → track → input）。 */
function parts(el: HTMLSpanElement) {
  const children = [...el.children];
  const input = el.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
  const switchBase = children[0] as HTMLSpanElement;
  const track = children[1] as HTMLSpanElement;
  return { switchBase, track, input };
}

describe("createSwitch", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    document.documentElement.removeAttribute("style");
  });

  it("root span 内に switchBase(thumb) + track + checkbox を生成する", () => {
    const { el } = createSwitch();
    expect(el.tagName).toBe("SPAN");
    const { switchBase, track, input } = parts(el);
    // DOM 順は switchBase → track → input。
    expect(el.children[0]).toBe(switchBase);
    expect(el.children[1]).toBe(track);
    expect(el.children[2]).toBe(input);
    // thumb は switchBase の子。
    expect(switchBase.children.length).toBe(1);
    expect(input.type).toBe("checkbox");
    expect(el.style.cssText).toContain("width: 40px");
    expect(el.style.cssText).toContain("height: 24px");
  });

  it("既定は checked=false（input.checked=false / data-checked=false / off 色）", () => {
    const { el, input } = createSwitch();
    expect(input.checked).toBe(false);
    expect(el.getAttribute("data-checked")).toBe("false");
    const { switchBase, track } = parts(el);
    expect(switchBase.style.cssText).toContain("var(--am-color-switch-thumb-off)");
    expect(track.style.cssText).toContain("var(--am-color-switch-track-off)");
  });

  it("checked=true で input.checked=true / data-checked=true / primary 色 + translateX", () => {
    const { el, input } = createSwitch({ checked: true });
    expect(input.checked).toBe(true);
    expect(el.getAttribute("data-checked")).toBe("true");
    const { switchBase, track } = parts(el);
    expect(switchBase.style.cssText).toContain("var(--am-color-primary-main)");
    expect(switchBase.style.cssText).toContain("translateX(16px)");
    expect(track.style.cssText).toContain("var(--am-color-primary-main)");
    expect(track.style.cssText).toContain("opacity: 0.5");
  });

  it("track / switchBase は inset7 / padding4 等の実測幾何を持つ", () => {
    const { el } = createSwitch();
    const { switchBase, track } = parts(el);
    expect(track.style.cssText).toContain("top: 7px");
    expect(track.style.cssText).toContain("left: 7px");
    expect(track.style.cssText).toContain("width: 26px");
    expect(track.style.cssText).toContain("height: 10px");
    expect(switchBase.style.cssText).toContain("padding: 4px");
  });

  it("thumb は 16x16 円形 + currentColor で描画する", () => {
    const { el } = createSwitch();
    const thumb = parts(el).switchBase.children[0] as HTMLSpanElement;
    expect(thumb.style.cssText).toContain("width: 16px");
    expect(thumb.style.cssText).toContain("height: 16px");
    expect(thumb.style.cssText).toContain("border-radius: 50%");
    expect(thumb.style.cssText).toContain("background-color: currentcolor");
  });

  it("input は全面を覆う透明 checkbox（opacity0 / inset0 / z-index2）", () => {
    const { input } = createSwitch();
    expect(input.style.cssText).toContain("opacity: 0");
    expect(input.style.cssText).toContain("inset: 0");
    expect(input.style.cssText).toContain("z-index: 2");
    expect(input.style.cssText).toContain("cursor: pointer");
  });

  it("disabled で input を無効化する", () => {
    const { input } = createSwitch({ disabled: true });
    expect(input.disabled).toBe(true);
  });

  it("role / ariaLabel / ariaLabelledBy を input に設定する", () => {
    const { input } = createSwitch({
      role: "switch",
      ariaLabel: "ダークモード",
      ariaLabelledBy: "label-id",
    });
    expect(input.getAttribute("role")).toBe("switch");
    expect(input.getAttribute("aria-label")).toBe("ダークモード");
    expect(input.getAttribute("aria-labelledby")).toBe("label-id");
  });

  it("className / testId / style を root に設定する", () => {
    const { el } = createSwitch({
      className: "my-switch",
      testId: "switch-1",
      style: { marginLeft: "8px" },
    });
    expect(el.className).toBe("my-switch");
    expect(el.getAttribute("data-testid")).toBe("switch-1");
    expect(el.style.marginLeft).toBe("8px");
  });

  it("CSS 変数を documentElement に注入すると getPropertyValue で読める", () => {
    document.documentElement.style.setProperty("--am-color-primary-main", "#1976d2");
    expect(
      document.documentElement.style.getPropertyValue("--am-color-primary-main"),
    ).toBe("#1976d2");
    const { el } = createSwitch({ checked: true });
    // checked 時の cssText に var 参照が含まれ、変数解決の対象になる。
    expect(parts(el).track.style.cssText).toContain("var(--am-color-primary-main)");
  });

  describe("change イベント", () => {
    it("input の change で onChange(checked, event) が発火し表示が同期する", () => {
      const onChange = jest.fn();
      const { el, input } = createSwitch({ checked: false, onChange });
      input.checked = true;
      input.dispatchEvent(new Event("change"));
      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange.mock.calls[0][0]).toBe(true);
      expect(onChange.mock.calls[0][1]).toBeInstanceOf(Event);
      // 内部状態と表示が on に同期する。
      expect(el.getAttribute("data-checked")).toBe("true");
      expect(parts(el).switchBase.style.cssText).toContain("translateX(16px)");
    });

    it("on → off へ戻す change で false を通知し off 表示へ戻る", () => {
      const onChange = jest.fn();
      const { el, input } = createSwitch({ checked: true, onChange });
      input.checked = false;
      input.dispatchEvent(new Event("change"));
      expect(onChange).toHaveBeenCalledWith(false, expect.any(Event));
      expect(el.getAttribute("data-checked")).toBe("false");
      expect(parts(el).switchBase.style.cssText).toContain("var(--am-color-switch-thumb-off)");
    });

    it("onChange 未指定でも change で例外を投げず表示が同期する", () => {
      const { el, input } = createSwitch({ checked: false });
      input.checked = true;
      expect(() => input.dispatchEvent(new Event("change"))).not.toThrow();
      expect(el.getAttribute("data-checked")).toBe("true");
    });
  });

  describe("update", () => {
    it("checked を切り替えると input / data-checked / cssText が更新される", () => {
      const { el, input, update } = createSwitch({ checked: false });
      update({ checked: true });
      expect(input.checked).toBe(true);
      expect(el.getAttribute("data-checked")).toBe("true");
      expect(parts(el).switchBase.style.cssText).toContain("translateX(16px)");
      update({ checked: false });
      expect(input.checked).toBe(false);
      expect(el.getAttribute("data-checked")).toBe("false");
      expect(parts(el).track.style.cssText).toContain("var(--am-color-switch-track-off)");
    });

    it("disabled を切り替える", () => {
      const { input, update } = createSwitch();
      expect(input.disabled).toBe(false);
      update({ disabled: true });
      expect(input.disabled).toBe(true);
      update({ disabled: false });
      expect(input.disabled).toBe(false);
    });

    it("ariaLabel / role を更新・除去する", () => {
      const { input, update } = createSwitch({ role: "switch", ariaLabel: "a" });
      update({ ariaLabel: "b" });
      expect(input.getAttribute("aria-label")).toBe("b");
      update({ ariaLabel: "" });
      expect(input.hasAttribute("aria-label")).toBe(false);
      update({ role: "" });
      expect(input.hasAttribute("role")).toBe(false);
    });

    it("className を更新する", () => {
      const { el, update } = createSwitch();
      update({ className: "next" });
      expect(el.className).toBe("next");
    });

    it("onChange を差し替えると旧ハンドラは呼ばれない", () => {
      const first = jest.fn();
      const second = jest.fn();
      const { input, update } = createSwitch({ onChange: first });
      update({ onChange: second });
      input.checked = true;
      input.dispatchEvent(new Event("change"));
      expect(first).not.toHaveBeenCalled();
      expect(second).toHaveBeenCalledTimes(1);
    });
  });

  describe("destroy", () => {
    it("destroy 後は change で onChange が呼ばれない", () => {
      const onChange = jest.fn();
      const { input, destroy } = createSwitch({ onChange });
      input.checked = true;
      input.dispatchEvent(new Event("change"));
      expect(onChange).toHaveBeenCalledTimes(1);
      destroy();
      input.checked = false;
      input.dispatchEvent(new Event("change"));
      expect(onChange).toHaveBeenCalledTimes(1);
    });
  });
});

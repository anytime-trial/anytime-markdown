/**
 * createRadio / createFormControlLabel / createRadioGroup（ui-vanilla/Radio）の jsdom ユニットテスト。
 *
 * 検証観点: DOM 生成（ring + dot + radio input / label + control / radiogroup）/ 属性 / a11y /
 * CSS 変数参照（cssText）/ change イベント発火 / register 注入による排他選択 / update / destroy。
 *
 * 注意: jsdom は継承された CSS カスタムプロパティを getComputedStyle で解決しないため、
 * 色の computed 値は検証しない。代わりに el.style.cssText が var(--am-...) を含むことを検証する。
 */

import {
  createRadio,
  createRadioGroup,
  createFormControlLabel,
} from "@anytime-markdown/graph-core/ui-vanilla/Radio";

/** Radio root 内の各パーツを取得するヘルパー（DOM 順: ring → dot → input）。 */
function radioParts(el: HTMLSpanElement) {
  const children = [...el.children];
  const ring = children[0] as HTMLSpanElement;
  const dot = children[1] as HTMLSpanElement;
  const input = el.querySelector<HTMLInputElement>('input[type="radio"]')!;
  return { ring, dot, input };
}

describe("createRadio", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    document.documentElement.removeAttribute("style");
  });

  it("root span 内に ring + dot + radio input を生成する", () => {
    const { el } = createRadio();
    expect(el.tagName).toBe("SPAN");
    const { ring, dot, input } = radioParts(el);
    expect(el.children[0]).toBe(ring);
    expect(el.children[1]).toBe(dot);
    expect(el.children[2]).toBe(input);
    expect(input.type).toBe("radio");
  });

  it("既定は checked=false（input.checked=false / data-checked=false / off 色 / dot scale(0)）", () => {
    const { el, input } = createRadio();
    expect(input.checked).toBe(false);
    expect(el.getAttribute("data-checked")).toBe("false");
    expect(el.style.cssText).toContain("var(--am-color-text-secondary)");
    const { dot } = radioParts(el);
    expect(dot.style.cssText).toContain("scale(0)");
  });

  it("checked=true で input.checked=true / data-checked=true / primary 色 / dot scale(1)", () => {
    const { el, input } = createRadio({ checked: true });
    expect(input.checked).toBe(true);
    expect(el.getAttribute("data-checked")).toBe("true");
    expect(el.style.cssText).toContain("var(--am-color-primary-main)");
    const { dot } = radioParts(el);
    expect(dot.style.cssText).toContain("scale(1)");
  });

  it("medium（既定）は ring 24x24 / dot 12x12 / root padding 9px", () => {
    const { el } = createRadio();
    const { ring, dot } = radioParts(el);
    expect(ring.style.cssText).toContain("width: 24px");
    expect(ring.style.cssText).toContain("height: 24px");
    expect(dot.style.cssText).toContain("width: 12px");
    expect(dot.style.cssText).toContain("height: 12px");
    expect(el.style.cssText).toContain("padding: 9px");
  });

  it("small は ring 20x20 / dot 10x10 / root padding 8px", () => {
    const { el } = createRadio({ size: "small" });
    const { ring, dot } = radioParts(el);
    expect(ring.style.cssText).toContain("width: 20px");
    expect(ring.style.cssText).toContain("height: 20px");
    expect(dot.style.cssText).toContain("width: 10px");
    expect(dot.style.cssText).toContain("height: 10px");
    expect(el.style.cssText).toContain("padding: 8px");
  });

  it("ring は border 2px currentColor / 円形", () => {
    const { el } = createRadio();
    const { ring } = radioParts(el);
    expect(ring.style.cssText).toContain("border: 2px solid currentcolor");
    expect(ring.style.cssText).toContain("border-radius: 50%");
  });

  it("dot は currentColor 背景 / 円形", () => {
    const { el } = createRadio();
    const { dot } = radioParts(el);
    expect(dot.style.cssText).toContain("background-color: currentcolor");
    expect(dot.style.cssText).toContain("border-radius: 50%");
  });

  it("input は全面を覆う透明 radio（opacity0 / inset0 / z-index1）", () => {
    const { input } = createRadio();
    expect(input.style.cssText).toContain("opacity: 0");
    expect(input.style.cssText).toContain("inset: 0");
    expect(input.style.cssText).toContain("z-index: 1");
  });

  it("value / name / ariaLabel を input に設定する", () => {
    const { input } = createRadio({ value: "a", name: "grp", ariaLabel: "選択肢A" });
    expect(input.value).toBe("a");
    expect(input.name).toBe("grp");
    expect(input.getAttribute("aria-label")).toBe("選択肢A");
  });

  it("disabled で input を無効化し opacity 0.38 を適用する", () => {
    const { el, input } = createRadio({ disabled: true });
    expect(input.disabled).toBe(true);
    expect(el.style.cssText).toContain("opacity: 0.38");
  });

  it("className / testId / style を root に設定する", () => {
    const { el } = createRadio({
      className: "my-radio",
      testId: "radio-1",
      style: { marginLeft: "4px" },
    });
    expect(el.className).toBe("my-radio");
    expect(el.getAttribute("data-testid")).toBe("radio-1");
    expect(el.style.marginLeft).toBe("4px");
  });

  describe("change イベント", () => {
    it("input の change で onChange(event) が発火し表示が同期する", () => {
      const onChange = jest.fn();
      const { el, input } = createRadio({ checked: false, onChange });
      input.checked = true;
      input.dispatchEvent(new Event("change"));
      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange.mock.calls[0][0]).toBeInstanceOf(Event);
      expect(el.getAttribute("data-checked")).toBe("true");
      expect(radioParts(el).dot.style.cssText).toContain("scale(1)");
    });

    it("onChange 未指定でも change で例外を投げず表示が同期する", () => {
      const { el, input } = createRadio({ checked: false });
      input.checked = true;
      expect(() => input.dispatchEvent(new Event("change"))).not.toThrow();
      expect(el.getAttribute("data-checked")).toBe("true");
    });
  });

  describe("update", () => {
    it("checked を切り替えると input / data-checked / dot scale が更新される", () => {
      const { el, input, update } = createRadio({ checked: false });
      update({ checked: true });
      expect(input.checked).toBe(true);
      expect(el.getAttribute("data-checked")).toBe("true");
      expect(radioParts(el).dot.style.cssText).toContain("scale(1)");
      update({ checked: false });
      expect(input.checked).toBe(false);
      expect(radioParts(el).dot.style.cssText).toContain("scale(0)");
    });

    it("disabled を切り替える（opacity も同期）", () => {
      const { el, input, update } = createRadio();
      update({ disabled: true });
      expect(input.disabled).toBe(true);
      expect(el.style.cssText).toContain("opacity: 0.38");
      update({ disabled: false });
      expect(input.disabled).toBe(false);
      expect(el.style.cssText).not.toContain("opacity: 0.38");
    });

    it("value / name / ariaLabel を更新する", () => {
      const { input, update } = createRadio({ value: "a", name: "g1" });
      update({ value: "b", name: "g2", ariaLabel: "新ラベル" });
      expect(input.value).toBe("b");
      expect(input.name).toBe("g2");
      expect(input.getAttribute("aria-label")).toBe("新ラベル");
      update({ ariaLabel: "" });
      expect(input.hasAttribute("aria-label")).toBe(false);
    });

    it("className を更新する", () => {
      const { el, update } = createRadio();
      update({ className: "next" });
      expect(el.className).toBe("next");
    });

    it("onChange を差し替えると旧ハンドラは呼ばれない", () => {
      const first = jest.fn();
      const second = jest.fn();
      const { input, update } = createRadio({ onChange: first });
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
      const { input, destroy } = createRadio({ onChange });
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

describe("createFormControlLabel", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    document.documentElement.removeAttribute("style");
  });

  it("label 内に control.el + label span を並べる", () => {
    const control = createRadio({ value: "a" });
    const { el } = createFormControlLabel({ control, label: "ラベルA", value: "a" });
    expect(el.tagName).toBe("LABEL");
    expect(el.children[0]).toBe(control.el);
    const labelSpan = el.children[1] as HTMLSpanElement;
    expect(labelSpan.textContent).toContain("ラベルA");
  });

  it("MUI 既定の負マージン（margin-left:-11px / margin-right:16px）を再現する", () => {
    const control = createRadio({ value: "a" });
    const { el } = createFormControlLabel({ control, label: "x", value: "a" });
    expect(el.style.cssText).toContain("margin-left: -11px");
    expect(el.style.cssText).toContain("margin-right: 16px");
  });

  it("label span は text-primary 色 CSS 変数を参照する", () => {
    const control = createRadio({ value: "a" });
    const { el } = createFormControlLabel({ control, label: "x", value: "a" });
    const labelSpan = el.children[1] as HTMLSpanElement;
    expect(labelSpan.style.cssText).toContain("var(--am-color-text-primary)");
  });

  it("disabled で control を無効化し label に opacity 0.38 を適用する", () => {
    const control = createRadio({ value: "a" });
    const { el } = createFormControlLabel({ control, label: "x", value: "a", disabled: true });
    expect(control.input.disabled).toBe(true);
    expect(el.style.cssText).toContain("cursor: default");
    const labelSpan = el.children[1] as HTMLSpanElement;
    expect(labelSpan.style.cssText).toContain("opacity: 0.38");
  });

  it("className / testId を root に設定する", () => {
    const control = createRadio({ value: "a" });
    const { el } = createFormControlLabel({
      control,
      label: "x",
      value: "a",
      className: "fcl",
      testId: "fcl-1",
    });
    expect(el.className).toBe("fcl");
    expect(el.getAttribute("data-testid")).toBe("fcl-1");
  });

  describe("register / setGroupValue", () => {
    it("register で value 一致時に control が checked になる", () => {
      const control = createRadio({ value: "a" });
      const fcl = createFormControlLabel({ control, label: "x", value: "a" });
      fcl.register({ value: "a", name: "grp" });
      expect(control.input.checked).toBe(true);
      expect(control.input.name).toBe("grp");
    });

    it("register で value 不一致時は control が未選択", () => {
      const control = createRadio({ value: "a" });
      const fcl = createFormControlLabel({ control, label: "x", value: "a" });
      fcl.register({ value: "b" });
      expect(control.input.checked).toBe(false);
    });

    it("setGroupValue で選択状態を切り替える", () => {
      const control = createRadio({ value: "a" });
      const fcl = createFormControlLabel({ control, label: "x", value: "a" });
      fcl.register({ value: "b" });
      expect(control.input.checked).toBe(false);
      fcl.setGroupValue("a");
      expect(control.input.checked).toBe(true);
    });

    it("control の change で register の onSelect(value, event) が呼ばれる", () => {
      const onSelect = jest.fn();
      const control = createRadio({ value: "a" });
      const fcl = createFormControlLabel({ control, label: "x", value: "a" });
      fcl.register({ value: "b", onSelect });
      control.input.checked = true;
      control.input.dispatchEvent(new Event("change"));
      expect(onSelect).toHaveBeenCalledTimes(1);
      expect(onSelect.mock.calls[0][0]).toBe("a");
      expect(onSelect.mock.calls[0][1]).toBeInstanceOf(Event);
    });
  });

  describe("update", () => {
    it("label を差し替える", () => {
      const control = createRadio({ value: "a" });
      const fcl = createFormControlLabel({ control, label: "旧", value: "a" });
      fcl.update({ label: "新" });
      const labelSpan = fcl.el.children[1] as HTMLSpanElement;
      expect(labelSpan.textContent).toContain("新");
      expect(labelSpan.textContent).not.toContain("旧");
    });

    it("disabled を切り替える", () => {
      const control = createRadio({ value: "a" });
      const fcl = createFormControlLabel({ control, label: "x", value: "a" });
      fcl.update({ disabled: true });
      expect(control.input.disabled).toBe(true);
      fcl.update({ disabled: false });
      expect(control.input.disabled).toBe(false);
    });
  });

  describe("destroy", () => {
    it("destroy 後は control の change で onSelect が呼ばれず control も破棄される", () => {
      const onSelect = jest.fn();
      const control = createRadio({ value: "a" });
      const fcl = createFormControlLabel({ control, label: "x", value: "a" });
      fcl.register({ value: "b", onSelect });
      fcl.destroy();
      control.input.checked = true;
      control.input.dispatchEvent(new Event("change"));
      expect(onSelect).not.toHaveBeenCalled();
    });
  });
});

describe("createRadioGroup", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    document.documentElement.removeAttribute("style");
  });

  /** value 配列から FormControlLabel 群を作るヘルパー。 */
  function makeChildren(values: readonly string[]) {
    return values.map((v) =>
      createFormControlLabel({ control: createRadio({ value: v }), label: v, value: v }),
    );
  }

  it("role=radiogroup の div を生成し子の el を並べる", () => {
    const children = makeChildren(["a", "b"]);
    const { el } = createRadioGroup({ value: "a", name: "grp", children });
    expect(el.tagName).toBe("DIV");
    expect(el.getAttribute("role")).toBe("radiogroup");
    expect(el.children[0]).toBe(children[0].el);
    expect(el.children[1]).toBe(children[1].el);
  });

  it("既定は縦並び（flex-direction:column）", () => {
    const { el } = createRadioGroup({ children: makeChildren(["a"]) });
    expect(el.style.cssText).toContain("flex-direction: column");
  });

  it("row で横並び（flex-direction:row / flex-wrap:wrap）", () => {
    const { el } = createRadioGroup({ row: true, children: makeChildren(["a"]) });
    expect(el.style.cssText).toContain("flex-direction: row");
    expect(el.style.cssText).toContain("flex-wrap: wrap");
  });

  it("register 注入で初期 value に一致する子だけ checked になる", () => {
    const children = makeChildren(["a", "b"]);
    createRadioGroup({ value: "b", name: "grp", children });
    expect(children[0].el.querySelector<HTMLInputElement>("input")!.checked).toBe(false);
    expect(children[1].el.querySelector<HTMLInputElement>("input")!.checked).toBe(true);
  });

  it("子に共有 name を注入する", () => {
    const children = makeChildren(["a", "b"]);
    createRadioGroup({ value: "a", name: "shared", children });
    expect(children[0].el.querySelector<HTMLInputElement>("input")!.name).toBe("shared");
    expect(children[1].el.querySelector<HTMLInputElement>("input")!.name).toBe("shared");
  });

  it("className / testId を root に設定する", () => {
    const { el } = createRadioGroup({
      children: makeChildren(["a"]),
      className: "rg",
      testId: "rg-1",
    });
    expect(el.className).toBe("rg");
    expect(el.getAttribute("data-testid")).toBe("rg-1");
  });

  describe("選択（排他制御）", () => {
    it("子の選択で onChange(value, event) が発火し他の子は未選択になる", () => {
      const onChange = jest.fn();
      const children = makeChildren(["a", "b"]);
      createRadioGroup({ value: "a", name: "grp", onChange, children });
      const inputB = children[1].el.querySelector<HTMLInputElement>("input")!;
      inputB.checked = true;
      inputB.dispatchEvent(new Event("change"));
      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange.mock.calls[0][0]).toBe("b");
      expect(onChange.mock.calls[0][1]).toBeInstanceOf(Event);
      // 排他: a は未選択 / b は選択。
      expect(children[0].el.querySelector<HTMLInputElement>("input")!.checked).toBe(false);
      expect(children[1].el.querySelector<HTMLInputElement>("input")!.checked).toBe(true);
    });
  });

  describe("update", () => {
    it("value を更新すると全子の checked が再同期する", () => {
      const children = makeChildren(["a", "b"]);
      const { update } = createRadioGroup({ value: "a", children });
      update({ value: "b" });
      expect(children[0].el.querySelector<HTMLInputElement>("input")!.checked).toBe(false);
      expect(children[1].el.querySelector<HTMLInputElement>("input")!.checked).toBe(true);
    });

    it("row を切り替える", () => {
      const { el, update } = createRadioGroup({ children: makeChildren(["a"]) });
      update({ row: true });
      expect(el.style.cssText).toContain("flex-direction: row");
      update({ row: false });
      expect(el.style.cssText).toContain("flex-direction: column");
    });

    it("onChange を差し替えると旧ハンドラは呼ばれない", () => {
      const first = jest.fn();
      const second = jest.fn();
      const children = makeChildren(["a", "b"]);
      const { update } = createRadioGroup({ value: "a", onChange: first, children });
      update({ onChange: second });
      const inputB = children[1].el.querySelector<HTMLInputElement>("input")!;
      inputB.checked = true;
      inputB.dispatchEvent(new Event("change"));
      expect(first).not.toHaveBeenCalled();
      expect(second).toHaveBeenCalledTimes(1);
    });

    it("className を更新する", () => {
      const { el, update } = createRadioGroup({ children: makeChildren(["a"]) });
      update({ className: "next" });
      expect(el.className).toBe("next");
    });
  });

  describe("destroy", () => {
    it("destroy 後は子の選択で onChange が呼ばれない", () => {
      const onChange = jest.fn();
      const children = makeChildren(["a", "b"]);
      const { destroy } = createRadioGroup({ value: "a", onChange, children });
      destroy();
      const inputB = children[1].el.querySelector<HTMLInputElement>("input")!;
      inputB.checked = true;
      inputB.dispatchEvent(new Event("change"));
      expect(onChange).not.toHaveBeenCalled();
    });
  });
});

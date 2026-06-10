/**
 * createTextField（ui-vanilla/TextField）の jsdom ユニットテスト。
 *
 * 検証観点: DOM 生成 / 属性 / a11y / multiline・maxRows / CSS 変数参照 /
 * イベント発火 / update（value / error / disabled / helperText）/ destroy のクリーンアップ。
 *
 * 注意: jsdom は継承された CSS カスタムプロパティを getComputedStyle で解決しないため、
 * inherit の computed 検証はしない。代わりに el.style.cssText が var(--am-...) を含むことを検証する。
 */

import { createTextField } from "../ui-vanilla/TextField";

describe("createTextField", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    document.head.innerHTML = "";
    document.documentElement.removeAttribute("style");
  });

  describe("生成と構造", () => {
    it("root div / inputWrap / input を生成する", () => {
      const { el, input } = createTextField({});
      expect(el.tagName).toBe("DIV");
      expect(el.getAttribute("data-am-tf-root")).toBe("");
      const wrap = el.querySelector("[data-am-tf-wrap]");
      expect(wrap).not.toBeNull();
      expect(input.tagName).toBe("INPUT");
      expect(input.getAttribute("data-am-tf-input")).toBe("");
      expect(wrap?.contains(input)).toBe(true);
    });

    it("type を指定すると input の type に反映する", () => {
      const { input } = createTextField({ type: "password" });
      expect((input as HTMLInputElement).type).toBe("password");
    });

    it("type 未指定なら text", () => {
      const { input } = createTextField({});
      expect((input as HTMLInputElement).type).toBe("text");
    });

    it("label を生成し input と htmlFor で関連付ける", () => {
      const { el, input } = createTextField({ label: "名前" });
      const label = el.querySelector<HTMLLabelElement>("[data-am-tf-label]");
      expect(label).not.toBeNull();
      expect(label?.textContent).toBe("名前");
      expect(label?.htmlFor).toBe(input.id);
      expect(input.id).not.toBe("");
    });

    it("label 未指定なら label 要素を生成しない", () => {
      const { el } = createTextField({});
      expect(el.querySelector("[data-am-tf-label]")).toBeNull();
    });

    it("required はラベル末尾に aria-hidden の * と input の required を付ける", () => {
      const { el, input } = createTextField({ label: "名前", required: true });
      const label = el.querySelector<HTMLLabelElement>("[data-am-tf-label]");
      const star = label?.querySelector('span[aria-hidden="true"]');
      expect(star?.textContent).toBe(" *");
      expect(input.required).toBe(true);
    });

    it("各インスタンスに一意な input id を採番する", () => {
      const a = createTextField({});
      const b = createTextField({});
      expect(a.input.id).not.toBe(b.input.id);
    });
  });

  describe("value / placeholder と label shrink", () => {
    it("value を input に設定する", () => {
      const { input } = createTextField({ value: "hello" });
      expect(input.value).toBe("hello");
    });

    it("placeholder を input に設定する", () => {
      const { input } = createTextField({ placeholder: "入力してください" });
      expect(input.placeholder).toBe("入力してください");
    });

    it("value も placeholder も無いとき label は shrink しない", () => {
      const { el } = createTextField({ label: "名前" });
      const label = el.querySelector("[data-am-tf-label]");
      expect(label?.getAttribute("data-shrink")).toBe("false");
    });

    it("value があると label が shrink する", () => {
      const { el } = createTextField({ label: "名前", value: "x" });
      const label = el.querySelector("[data-am-tf-label]");
      expect(label?.getAttribute("data-shrink")).toBe("true");
    });

    it("placeholder があると label が shrink する", () => {
      const { el } = createTextField({ label: "名前", placeholder: "ph" });
      const label = el.querySelector("[data-am-tf-label]");
      expect(label?.getAttribute("data-shrink")).toBe("true");
    });
  });

  describe("multiline / maxRows", () => {
    it("multiline で textarea を生成する", () => {
      const { input } = createTextField({ multiline: true });
      expect(input.tagName).toBe("TEXTAREA");
      expect(input.style.cssText).toContain("resize: vertical");
    });

    it("minRows を textarea の rows に反映する", () => {
      const { input } = createTextField({ multiline: true, minRows: 4 });
      expect((input as HTMLTextAreaElement).rows).toBe(4);
    });

    it("maxRows を max-height(em) に換算する", () => {
      const { input } = createTextField({ multiline: true, maxRows: 6 });
      // 6 * 1.4375 = 8.625em
      expect(input.style.maxHeight).toBe("8.625em");
    });

    it("maxRows 未指定なら max-height を設定しない", () => {
      const { input } = createTextField({ multiline: true });
      expect(input.style.maxHeight).toBe("");
    });
  });

  describe("error / disabled の a11y と data 属性", () => {
    it("error 時に root[data-error] と input[aria-invalid] を立てる", () => {
      const { el, input } = createTextField({ error: true });
      expect(el.getAttribute("data-error")).toBe("true");
      expect(input.getAttribute("aria-invalid")).toBe("true");
    });

    it("error でないとき aria-invalid を付けない", () => {
      const { el, input } = createTextField({});
      expect(el.getAttribute("data-error")).toBe("false");
      expect(input.hasAttribute("aria-invalid")).toBe(false);
    });

    it("disabled 時に root[data-disabled] と input.disabled を立てる", () => {
      const { el, input } = createTextField({ disabled: true });
      expect(el.getAttribute("data-disabled")).toBe("true");
      expect(input.disabled).toBe(true);
    });
  });

  describe("helper text と aria-describedby", () => {
    it("helperText を p 要素として root 末尾に置く", () => {
      const { el } = createTextField({ helperText: "8文字以上" });
      const helper = el.querySelector<HTMLParagraphElement>("[data-am-tf-helper]");
      expect(helper?.tagName).toBe("P");
      expect(helper?.textContent).toBe("8文字以上");
      expect(el.lastElementChild).toBe(helper);
    });

    it("helperTextId と aria-describedby を連携する", () => {
      const { el, input } = createTextField({
        helperText: "必須",
        helperTextId: "tf-help-1",
      });
      const helper = el.querySelector("[data-am-tf-helper]");
      expect(helper?.id).toBe("tf-help-1");
      expect(input.getAttribute("aria-describedby")).toBe("tf-help-1");
    });

    it("ariaDescribedBy が helper id より優先される", () => {
      const { input } = createTextField({
        helperText: "x",
        helperTextId: "tf-help-2",
        ariaDescribedBy: "external-desc",
      });
      expect(input.getAttribute("aria-describedby")).toBe("external-desc");
    });

    it("helperText 無しなら aria-describedby を付けない", () => {
      const { input } = createTextField({});
      expect(input.hasAttribute("aria-describedby")).toBe(false);
    });
  });

  describe("size / fullWidth / className / style / inputAttrs / testId", () => {
    it("medium は pad-y を 16.5px にする", () => {
      const { el } = createTextField({ size: "medium" });
      expect(el.style.cssText).toContain("--tf-input-pad-y: 16.5px");
    });

    it("small は pad-y を 8.5px にする", () => {
      const { el } = createTextField({ size: "small" });
      expect(el.style.cssText).toContain("--tf-input-pad-y: 8.5px");
    });

    it("fullWidth は display:flex と width:100% にする", () => {
      const { el } = createTextField({ fullWidth: true });
      expect(el.style.cssText).toContain("display: flex");
      expect(el.style.cssText).toContain("width: 100%");
    });

    it("className を root に付与する", () => {
      const { el } = createTextField({ className: "custom" });
      expect(el.className).toBe("custom");
    });

    it("style を root にマージする", () => {
      const { el } = createTextField({ style: { marginTop: "8px" } });
      expect(el.style.marginTop).toBe("8px");
    });

    it("inputAttrs を input に直接設定する", () => {
      const { input } = createTextField({ inputAttrs: { "aria-label": "検索" } });
      expect(input.getAttribute("aria-label")).toBe("検索");
    });

    it("testId を root に付与する", () => {
      const { el } = createTextField({ testId: "name-field" });
      expect(el.getAttribute("data-testid")).toBe("name-field");
    });
  });

  describe("CSS 変数参照", () => {
    it("input は divider 枠線と text-primary 文字色の CSS 変数を参照する", () => {
      const { input } = createTextField({});
      expect(input.style.cssText).toContain("var(--am-color-divider)");
      expect(input.style.cssText).toContain("var(--am-color-text-primary)");
    });

    it("CSS 変数を documentElement に注入すると getPropertyValue で読める", () => {
      document.documentElement.style.setProperty(
        "--am-color-divider",
        "rgba(0,0,0,0.23)",
      );
      expect(
        document.documentElement.style.getPropertyValue("--am-color-divider"),
      ).toBe("rgba(0,0,0,0.23)");
      const { input } = createTextField({});
      expect(input.style.cssText).toContain("var(--am-color-divider)");
    });

    it(":focus-within ルールを <style> として 1 度だけ注入する", () => {
      createTextField({});
      createTextField({});
      const styles = document.querySelectorAll("#am-vanilla-textfield-style");
      expect(styles.length).toBe(1);
      expect(styles[0].textContent).toContain(":focus-within");
      expect(styles[0].textContent).toContain("var(--am-color-primary-main)");
    });
  });

  describe("イベント", () => {
    it("input イベントで onChange が呼ばれる", () => {
      const onChange = jest.fn();
      const { input } = createTextField({ onChange });
      input.dispatchEvent(new Event("input"));
      expect(onChange).toHaveBeenCalledTimes(1);
    });

    it("blur イベントで onBlur が呼ばれる", () => {
      const onBlur = jest.fn();
      const { input } = createTextField({ onBlur });
      input.dispatchEvent(new FocusEvent("blur"));
      expect(onBlur).toHaveBeenCalledTimes(1);
    });

    it("keydown イベントで onKeyDown が呼ばれる", () => {
      const onKeyDown = jest.fn();
      const { input } = createTextField({ onKeyDown });
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
      expect(onKeyDown).toHaveBeenCalledTimes(1);
    });

    it("click イベントで onClick が呼ばれる", () => {
      const onClick = jest.fn();
      const { input } = createTextField({ onClick });
      input.dispatchEvent(new MouseEvent("click"));
      expect(onClick).toHaveBeenCalledTimes(1);
    });
  });

  describe("update", () => {
    it("value を差し替え label shrink を再計算する", () => {
      const { el, input, update } = createTextField({ label: "名前" });
      expect(el.querySelector("[data-am-tf-label]")?.getAttribute("data-shrink")).toBe(
        "false",
      );
      update({ value: "入力済" });
      expect(input.value).toBe("入力済");
      expect(el.querySelector("[data-am-tf-label]")?.getAttribute("data-shrink")).toBe(
        "true",
      );
    });

    it("placeholder を差し替え label shrink を再計算する", () => {
      const { el, update } = createTextField({ label: "名前" });
      update({ placeholder: "ph" });
      expect(el.querySelector("[data-am-tf-label]")?.getAttribute("data-shrink")).toBe(
        "true",
      );
    });

    it("error を切り替えると data-error と aria-invalid が連動する", () => {
      const { el, input, update } = createTextField({});
      update({ error: true });
      expect(el.getAttribute("data-error")).toBe("true");
      expect(input.getAttribute("aria-invalid")).toBe("true");
      update({ error: false });
      expect(el.getAttribute("data-error")).toBe("false");
      expect(input.hasAttribute("aria-invalid")).toBe(false);
    });

    it("disabled を切り替えると data-disabled と input.disabled が連動する", () => {
      const { el, input, update } = createTextField({});
      update({ disabled: true });
      expect(el.getAttribute("data-disabled")).toBe("true");
      expect(input.disabled).toBe(true);
      update({ disabled: false });
      expect(el.getAttribute("data-disabled")).toBe("false");
      expect(input.disabled).toBe(false);
    });

    it("helperText を差し替える", () => {
      const { el, update } = createTextField({ helperText: "old" });
      update({ helperText: "new" });
      expect(el.querySelector("[data-am-tf-helper]")?.textContent).toBe("new");
    });

    it("className を更新する", () => {
      const { el, update } = createTextField({});
      update({ className: "c2" });
      expect(el.className).toBe("c2");
    });

    it("onChange を差し替えると旧ハンドラは呼ばれない", () => {
      const first = jest.fn();
      const second = jest.fn();
      const { input, update } = createTextField({ onChange: first });
      update({ onChange: second });
      input.dispatchEvent(new Event("input"));
      expect(first).not.toHaveBeenCalled();
      expect(second).toHaveBeenCalledTimes(1);
    });
  });

  describe("destroy", () => {
    it("destroy 後は input イベントで onChange が呼ばれない", () => {
      const onChange = jest.fn();
      const { input, destroy } = createTextField({ onChange });
      input.dispatchEvent(new Event("input"));
      expect(onChange).toHaveBeenCalledTimes(1);
      destroy();
      input.dispatchEvent(new Event("input"));
      expect(onChange).toHaveBeenCalledTimes(1);
    });

    it("destroy 後は blur / keydown / click も呼ばれない", () => {
      const onBlur = jest.fn();
      const onKeyDown = jest.fn();
      const onClick = jest.fn();
      const { input, destroy } = createTextField({ onBlur, onKeyDown, onClick });
      destroy();
      input.dispatchEvent(new FocusEvent("blur"));
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "a" }));
      input.dispatchEvent(new MouseEvent("click"));
      expect(onBlur).not.toHaveBeenCalled();
      expect(onKeyDown).not.toHaveBeenCalled();
      expect(onClick).not.toHaveBeenCalled();
    });

    it("ハンドラ無しでも destroy は安全に呼べる", () => {
      const { destroy } = createTextField({});
      expect(() => destroy()).not.toThrow();
    });
  });
});

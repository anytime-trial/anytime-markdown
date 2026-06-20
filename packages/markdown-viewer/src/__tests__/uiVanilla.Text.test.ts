/**
 * ui-vanilla/Text.ts（脱React Text ファクトリ）の jsdom ユニットテスト。
 *
 * 検証観点（contract §6）:
 *  1. DOM 生成（tag / textContent / variant に応じたタグ）
 *  2. 属性（aria-label / className / component 上書き）
 *  3. children（string / Node / 配列）の展開
 *  4. CSS 変数テーマ追従（--am-color-* を documentElement に注入し inherit 確認）
 *  5. イベント（onClick 発火）
 *  6. update（text / variant / class / style の変更反映）
 *  7. destroy のクリーンアップ（listener 解除後は callback が呼ばれない）
 */

import { createText } from "@anytime-markdown/graph-core/ui-vanilla/Text";

describe("createText", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    document.documentElement.removeAttribute("style");
  });

  describe("DOM 生成", () => {
    test("既定 variant は body1 → p 要素を生成する", () => {
      const { el } = createText({ text: "hello" });
      expect(el.tagName).toBe("P");
      expect(el.textContent).toBe("hello");
    });

    test("variant に応じた既定タグを使う（h6 / subtitle → h6, caption → span）", () => {
      expect(createText({ variant: "h6" }).el.tagName).toBe("H6");
      expect(createText({ variant: "subtitle1" }).el.tagName).toBe("H6");
      expect(createText({ variant: "subtitle2" }).el.tagName).toBe("H6");
      expect(createText({ variant: "body2" }).el.tagName).toBe("P");
      expect(createText({ variant: "caption" }).el.tagName).toBe("SPAN");
    });

    test("component で描画タグを上書きできる", () => {
      const { el } = createText({ variant: "h6", component: "span" });
      expect(el.tagName).toBe("SPAN");
    });

    test("variant の font scale を inline style に反映する", () => {
      const { el } = createText({ variant: "h6" });
      expect(el.style.fontSize).toBe("1.25rem");
      expect(el.style.fontWeight).toBe("500");
      expect(el.style.margin).toBe("0px");
    });

    test("gutterBottom / noWrap を inline style に反映する", () => {
      const { el } = createText({ gutterBottom: true, noWrap: true });
      expect(el.style.marginBottom).toBe("0.35em");
      expect(el.style.whiteSpace).toBe("nowrap");
      expect(el.style.textOverflow).toBe("ellipsis");
    });

    test("追加 style を末尾に結合する", () => {
      const { el } = createText({ text: "x", style: "font-weight:700;" });
      expect(el.style.fontWeight).toBe("700");
    });
  });

  describe("属性", () => {
    test("ariaLabel / className を設定する", () => {
      const { el } = createText({
        text: "t",
        ariaLabel: "label-x",
        className: "foo bar",
      });
      expect(el.getAttribute("aria-label")).toBe("label-x");
      expect(el.className).toBe("foo bar");
    });

    test("色は指定しない（inherit のまま）", () => {
      const { el } = createText({ text: "t" });
      expect(el.style.color).toBe("");
    });
  });

  describe("children の展開", () => {
    test("string children を textNode として追加する", () => {
      const { el } = createText({ children: "child-text" });
      expect(el.textContent).toBe("child-text");
    });

    test("Node children をそのまま append する", () => {
      const span = document.createElement("span");
      span.textContent = "node-child";
      const { el } = createText({ children: span });
      expect(el.firstElementChild).toBe(span);
      expect(el.textContent).toBe("node-child");
    });

    test("配列 children を順に展開する", () => {
      const strong = document.createElement("strong");
      strong.textContent = "B";
      const { el } = createText({ children: ["A", strong, "C"] });
      expect(el.textContent).toBe("ABC");
      expect(el.childNodes.length).toBe(3);
      expect(el.childNodes[1]).toBe(strong);
    });

    test("children 指定時は text より children を優先する", () => {
      const { el } = createText({ text: "ignored", children: "used" });
      expect(el.textContent).toBe("used");
    });
  });

  describe("CSS 変数テーマ追従", () => {
    // 注: jsdom の getComputedStyle は継承された CSS カスタムプロパティを解決しないため、
    // inherit の computed 検証は行わず、style に var(--am-color-*) を参照することを確認する。

    test("color:var(--am-color-*) を style で渡すと CSS 変数を参照する", () => {
      const { el } = createText({
        text: "t",
        style: "color:var(--am-color-text-secondary);",
      });
      expect(el.style.color).toBe("var(--am-color-text-secondary)");
    });
  });

  describe("イベント", () => {
    test("onClick が click で発火する", () => {
      const onClick = jest.fn();
      const { el } = createText({ text: "btn", onClick });
      el.click();
      expect(onClick).toHaveBeenCalledTimes(1);
    });
  });

  describe("update", () => {
    test("text を更新する", () => {
      const handle = createText({ text: "before" });
      handle.update({ text: "after" });
      expect(handle.el.textContent).toBe("after");
    });

    test("children を更新すると既存内容を置き換える", () => {
      const handle = createText({ children: "old" });
      handle.update({ children: ["new1", "new2"] });
      expect(handle.el.textContent).toBe("new1new2");
    });

    test("variant 変更で font scale を再構築する", () => {
      const handle = createText({ variant: "body1" });
      expect(handle.el.style.fontSize).toBe("1rem");
      handle.update({ variant: "caption" });
      expect(handle.el.style.fontSize).toBe("0.75rem");
    });

    test("style / gutterBottom を更新後も保持して再構築する", () => {
      const handle = createText({ variant: "body1", style: "color:red;" });
      handle.update({ gutterBottom: true });
      // gutterBottom 追加後も style(color:red) が残る
      expect(handle.el.style.marginBottom).toBe("0.35em");
      expect(handle.el.style.color).toBe("red");
    });

    test("className を更新する", () => {
      const handle = createText({ className: "a" });
      handle.update({ className: "b c" });
      expect(handle.el.className).toBe("b c");
    });

    test("ariaLabel を空文字に更新すると属性を削除する", () => {
      const handle = createText({ ariaLabel: "x" });
      handle.update({ ariaLabel: "" });
      expect(handle.el.hasAttribute("aria-label")).toBe(false);
    });

    test("onClick を差し替えると旧 handler は呼ばれず新 handler が呼ばれる", () => {
      const oldClick = jest.fn();
      const newClick = jest.fn();
      const handle = createText({ text: "t", onClick: oldClick });
      handle.update({ onClick: newClick });
      handle.el.click();
      expect(oldClick).not.toHaveBeenCalled();
      expect(newClick).toHaveBeenCalledTimes(1);
    });
  });

  describe("destroy のクリーンアップ", () => {
    test("destroy 後は click で onClick が呼ばれない", () => {
      const onClick = jest.fn();
      const handle = createText({ text: "t", onClick });
      handle.el.click();
      expect(onClick).toHaveBeenCalledTimes(1);
      handle.destroy();
      handle.el.click();
      expect(onClick).toHaveBeenCalledTimes(1);
    });

    test("destroy は listener 未登録でも安全に呼べる", () => {
      const handle = createText({ text: "t" });
      expect(() => handle.destroy()).not.toThrow();
    });
  });
});

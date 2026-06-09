/**
 * createToggleButton / createToggleButtonGroup（ui-vanilla/ToggleButton）の jsdom ユニットテスト。
 *
 * 検証観点: DOM 生成 / role / aria-pressed / variant・size の CSS 変数参照（cssText）/
 * クリックでの onChange 発火 / group の register/notify による選択再評価 / 連結ボーダー（adjacency）/
 * update / destroy のクリーンアップ。
 *
 * 注意: jsdom は継承された CSS カスタムプロパティを getComputedStyle で解決しないため、
 * 色の computed 値は検証しない。代わりに el.style.cssText が var(--am-...) を含むことを検証する。
 */

import {
  createToggleButton,
  createToggleButtonGroup,
} from "../ui-vanilla/ToggleButton";

describe("createToggleButton", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    document.documentElement.removeAttribute("style");
  });

  it("button[aria-pressed] を生成し label を持つ", () => {
    const { el } = createToggleButton({ value: "a", label: "Bold" });
    expect(el.tagName).toBe("BUTTON");
    expect(el.type).toBe("button");
    expect(el.getAttribute("aria-pressed")).toBe("false");
    expect(el.textContent).toBe("Bold");
  });

  it("非選択 standard は action-active 文字色 + divider 枠線を参照する", () => {
    const { el } = createToggleButton({ value: "a", label: "X" });
    expect(el.getAttribute("data-variant")).toBe("standard");
    expect(el.getAttribute("aria-pressed")).toBe("false");
    expect(el.style.cssText).toContain("var(--am-color-action-active)");
    expect(el.style.cssText).toContain("var(--am-color-divider)");
    expect(el.style.cssText).toContain("min-height: 30px");
  });

  it("選択 standard は aria-pressed=true / action-selected 背景 + text-primary を参照する", () => {
    const { el } = createToggleButton({ value: "a", label: "X", selected: true });
    expect(el.getAttribute("aria-pressed")).toBe("true");
    expect(el.style.cssText).toContain("var(--am-color-action-selected)");
    expect(el.style.cssText).toContain("var(--am-color-text-primary)");
  });

  it("非選択 pill は text-secondary を参照し角丸 20px を持つ", () => {
    const { el } = createToggleButton({ value: "a", label: "X", variant: "pill" });
    expect(el.getAttribute("data-variant")).toBe("pill");
    expect(el.style.cssText).toContain("var(--am-color-text-secondary)");
    expect(el.style.cssText).toContain("border-radius: 20px");
  });

  it("選択 pill は bg-paper 背景 + text-primary + box-shadow を参照する", () => {
    const { el } = createToggleButton({
      value: "a",
      label: "X",
      variant: "pill",
      selected: true,
    });
    expect(el.getAttribute("aria-pressed")).toBe("true");
    expect(el.style.cssText).toContain("var(--am-color-bg-paper)");
    expect(el.style.cssText).toContain("var(--am-color-text-primary)");
    expect(el.style.cssText).toContain("box-shadow");
  });

  it("medium size は min-height 36px を持つ", () => {
    const { el } = createToggleButton({ value: "a", label: "X", size: "medium" });
    expect(el.getAttribute("data-size")).toBe("medium");
    expect(el.style.cssText).toContain("min-height: 36px");
  });

  it("disabled で button を無効化し opacity を下げる", () => {
    const { el } = createToggleButton({ value: "a", label: "X", disabled: true });
    expect(el.disabled).toBe(true);
    expect(el.style.cssText).toContain("opacity: 0.5");
  });

  it("ariaLabel / title / className / testId を設定する", () => {
    const { el } = createToggleButton({
      value: "a",
      label: "X",
      ariaLabel: "太字",
      title: "ヒント",
      className: "my-toggle",
      testId: "toggle-a",
    });
    expect(el.getAttribute("aria-label")).toBe("太字");
    expect(el.title).toBe("ヒント");
    expect(el.className).toBe("my-toggle");
    expect(el.getAttribute("data-testid")).toBe("toggle-a");
  });

  it("label 未指定なら children を描画する", () => {
    const node = document.createElement("b");
    node.textContent = "bold";
    const { el } = createToggleButton({ value: "a", children: node });
    expect(el.querySelector("b")?.textContent).toBe("bold");
  });

  it("click で onClick(value) が発火する", () => {
    const onClick = jest.fn();
    const { el } = createToggleButton({ value: "a", label: "X", onClick });
    el.click();
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onClick).toHaveBeenCalledWith("a");
  });

  describe("update", () => {
    it("selected を切り替えると aria-pressed / cssText が更新される", () => {
      const { el, update } = createToggleButton({ value: "a", label: "X" });
      expect(el.getAttribute("aria-pressed")).toBe("false");
      update({ selected: true });
      expect(el.getAttribute("aria-pressed")).toBe("true");
      expect(el.style.cssText).toContain("var(--am-color-action-selected)");
      update({ selected: false });
      expect(el.getAttribute("aria-pressed")).toBe("false");
      expect(el.style.cssText).toContain("var(--am-color-action-active)");
    });

    it("variant を切り替えると cssText と data 属性が更新される", () => {
      const { el, update } = createToggleButton({ value: "a", label: "X" });
      update({ variant: "pill" });
      expect(el.getAttribute("data-variant")).toBe("pill");
      expect(el.style.cssText).toContain("border-radius: 20px");
    });

    it("disabled を切り替える", () => {
      const { el, update } = createToggleButton({ value: "a", label: "X" });
      expect(el.disabled).toBe(false);
      update({ disabled: true });
      expect(el.disabled).toBe(true);
    });

    it("label を差し替える", () => {
      const { el, update } = createToggleButton({ value: "a", label: "old" });
      update({ label: "new" });
      expect(el.textContent).toBe("new");
    });

    it("onClick を差し替えると旧ハンドラは呼ばれない", () => {
      const first = jest.fn();
      const second = jest.fn();
      const { el, update } = createToggleButton({ value: "a", label: "X", onClick: first });
      update({ onClick: second });
      el.click();
      expect(first).not.toHaveBeenCalled();
      expect(second).toHaveBeenCalledWith("a");
    });
  });

  it("destroy 後は click で onClick が呼ばれない", () => {
    const onClick = jest.fn();
    const { el, destroy } = createToggleButton({ value: "a", label: "X", onClick });
    el.click();
    expect(onClick).toHaveBeenCalledTimes(1);
    destroy();
    el.click();
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe("createToggleButtonGroup", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    document.documentElement.removeAttribute("style");
  });

  const buildGroup = (
    groupOpts: Parameters<typeof createToggleButtonGroup>[0] = {},
    values: readonly string[] = ["a", "b", "c"],
  ) => {
    const group = createToggleButtonGroup(groupOpts);
    const children = values.map((v) => {
      const child = createToggleButton({ value: v, label: v.toUpperCase() });
      group.register(child);
      return child;
    });
    return { group, children };
  };

  it("div[role=group] を生成し各子を append する", () => {
    const { group } = buildGroup();
    expect(group.el.tagName).toBe("DIV");
    expect(group.el.getAttribute("role")).toBe("group");
    expect(group.el.querySelectorAll("button").length).toBe(3);
    expect(group.el.style.cssText).toContain("inline-flex");
  });

  it("pill variant は group に action-hover 地と角丸コンテナを付与する", () => {
    const { group } = buildGroup({ variant: "pill" });
    expect(group.el.getAttribute("data-variant")).toBe("pill");
    expect(group.el.style.cssText).toContain("var(--am-color-action-hover)");
    expect(group.el.style.cssText).toContain("border-radius: 20px");
    // 子も pill バリアントを継承する。
    const first = group.el.querySelector("button");
    expect(first?.getAttribute("data-variant")).toBe("pill");
  });

  it("group の value に一致する子のみ aria-pressed=true になる", () => {
    const { group } = buildGroup({ value: "b" });
    const btns = [...group.el.querySelectorAll<HTMLButtonElement>("button")];
    expect(btns.map((b) => b.getAttribute("aria-pressed"))).toEqual([
      "false",
      "true",
      "false",
    ]);
  });

  it("group が size を子へ注入する", () => {
    const { group } = buildGroup({ size: "medium" });
    const first = group.el.querySelector("button");
    expect(first?.getAttribute("data-size")).toBe("medium");
    expect(first?.style.cssText).toContain("min-height: 36px");
  });

  it("standard で連結ボーダー（margin / 角丸）を DOM 位置から付与する", () => {
    const { group } = buildGroup();
    const btns = [...group.el.querySelectorAll<HTMLButtonElement>("button")];
    expect(btns[0].style.marginLeft).toBe("0px");
    expect(btns[1].style.marginLeft).toBe("-1px");
    expect(btns[2].style.marginLeft).toBe("-1px");
    // first は左角丸、last は右角丸。
    expect(btns[0].style.borderTopLeftRadius).toBe("4px");
    expect(btns[0].style.borderTopRightRadius).toBe("");
    expect(btns[2].style.borderTopRightRadius).toBe("4px");
    expect(btns[2].style.borderTopLeftRadius).toBe("");
  });

  it("子クリックで group.onChange(value) が発火する（notify API）", () => {
    const onChange = jest.fn();
    const { group } = buildGroup({ onChange });
    const second = group.el.querySelectorAll<HTMLButtonElement>("button")[1];
    second.click();
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("b");
  });

  it("setValue で全子の選択状態が再評価される", () => {
    const { group } = buildGroup({ value: "a" });
    group.setValue("c");
    const btns = [...group.el.querySelectorAll<HTMLButtonElement>("button")];
    expect(btns.map((b) => b.getAttribute("aria-pressed"))).toEqual([
      "false",
      "false",
      "true",
    ]);
  });

  it("className / testId / ariaLabel を設定する", () => {
    const { group } = buildGroup({
      className: "my-group",
      testId: "group-root",
      ariaLabel: "書式",
    });
    expect(group.el.className).toBe("my-group");
    expect(group.el.getAttribute("data-testid")).toBe("group-root");
    expect(group.el.getAttribute("aria-label")).toBe("書式");
  });

  describe("update", () => {
    it("value 変更で選択子が差し替わる", () => {
      const { group } = buildGroup({ value: "a" });
      group.update({ value: "b" });
      const btns = [...group.el.querySelectorAll<HTMLButtonElement>("button")];
      expect(btns.map((b) => b.getAttribute("aria-pressed"))).toEqual([
        "false",
        "true",
        "false",
      ]);
    });

    it("variant 変更で group と子の cssText / data 属性が更新される", () => {
      const { group } = buildGroup();
      group.update({ variant: "pill" });
      expect(group.el.getAttribute("data-variant")).toBe("pill");
      expect(group.el.style.cssText).toContain("var(--am-color-action-hover)");
      const first = group.el.querySelector("button");
      expect(first?.getAttribute("data-variant")).toBe("pill");
      expect(first?.style.cssText).toContain("border-radius: 20px");
    });

    it("onChange 差し替え後は新ハンドラが発火する", () => {
      const first = jest.fn();
      const second = jest.fn();
      const { group } = buildGroup({ onChange: first });
      group.update({ onChange: second });
      group.el.querySelectorAll<HTMLButtonElement>("button")[1].click();
      expect(first).not.toHaveBeenCalled();
      expect(second).toHaveBeenCalledWith("b");
    });
  });

  it("destroy 後は子クリックで onChange が呼ばれない", () => {
    const onChange = jest.fn();
    const { group } = buildGroup({ onChange });
    const second = group.el.querySelectorAll<HTMLButtonElement>("button")[1];
    second.click();
    expect(onChange).toHaveBeenCalledTimes(1);
    group.destroy();
    second.click();
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("group 未登録の子は単体 selected で制御される", () => {
    const { el } = createToggleButton({ value: "a", label: "X", selected: true });
    expect(el.getAttribute("aria-pressed")).toBe("true");
  });
});

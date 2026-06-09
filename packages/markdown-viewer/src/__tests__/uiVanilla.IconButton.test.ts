/**
 * ui-vanilla/IconButton.ts の素 DOM ファクトリのユニットテスト。
 * jest-dom は未導入のため素の DOM API で検証する。
 *
 * 検証観点（contract §6）:
 *  1. DOM 生成（tagName / type / attribute / children）
 *  2. CSS 変数応答（--am-color-* が documentElement で解決される）
 *  3. イベント発火（onClick が呼ばれる）
 *  4. update（disabled / ariaLabel / size / children の変更）
 *  5. destroy（listener 削除後は callback が呼ばれない）
 */
import {
  createIconButton,
  type IconButtonHandle,
} from "../ui-vanilla/IconButton";

describe("createIconButton", () => {
  const root = document.documentElement;
  let handle: IconButtonHandle | undefined;

  beforeEach(() => {
    // CSS 変数を documentElement に注入（applyEditorThemeCssVars 相当）。
    root.style.setProperty("--am-color-action-hover", "rgba(0,0,0,0.04)");
    root.style.setProperty("--am-color-primary-main", "rgb(25,118,210)");
    root.style.setProperty("--am-color-text-secondary", "rgba(0,0,0,0.6)");
    root.style.setProperty("--am-duration-fast", "150ms");
    root.style.setProperty(
      "--am-ease-standard",
      "cubic-bezier(0.4, 0, 0.2, 1)",
    );
  });

  afterEach(() => {
    handle?.destroy();
    handle?.el.remove();
    handle = undefined;
  });

  it("button 要素を生成し type=button が既定になる", () => {
    handle = createIconButton({ ariaLabel: "閉じる" });
    expect(handle.el.tagName).toBe("BUTTON");
    expect(handle.el.type).toBe("button");
    expect(handle.el.getAttribute("aria-label")).toBe("閉じる");
    expect(handle.el.hasAttribute("data-ui-icon-button")).toBe(true);
  });

  it("title / data-testid / disabled / type を反映する", () => {
    handle = createIconButton({
      title: "削除",
      testId: "del-btn",
      disabled: true,
      type: "submit",
    });
    expect(handle.el.title).toBe("削除");
    expect(handle.el.getAttribute("data-testid")).toBe("del-btn");
    expect(handle.el.disabled).toBe(true);
    expect(handle.el.type).toBe("submit");
  });

  it("string children を span でラップして追加する", () => {
    handle = createIconButton({ children: "X" });
    const span = handle.el.querySelector("span");
    expect(span).not.toBeNull();
    expect(span?.textContent).toBe("X");
  });

  it("Node children をそのまま追加する", () => {
    const svg = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "svg",
    );
    handle = createIconButton({ children: svg });
    expect(handle.el.querySelector("svg")).toBe(svg);
  });

  it("配列 children を順に追加する", () => {
    const node = document.createElement("i");
    handle = createIconButton({ children: ["A", node] });
    expect(handle.el.querySelector("span")?.textContent).toBe("A");
    expect(handle.el.querySelector("i")).toBe(node);
  });

  it("size 別パディングを設定する（medium 既定）", () => {
    handle = createIconButton({});
    expect(handle.el.style.padding).toBe("8px");
    const xs = createIconButton({ size: "xs" });
    expect(xs.el.style.padding).toBe("2px");
    xs.destroy();
  });

  it("CSS 変数が documentElement で解決される", () => {
    handle = createIconButton({});
    document.body.appendChild(handle.el);
    const resolved = window
      .getComputedStyle(root)
      .getPropertyValue("--am-color-action-hover")
      .trim();
    expect(resolved).toBe("rgba(0,0,0,0.04)");
  });

  it("hover / focus / disabled 用の scoped style ルールを注入する", () => {
    handle = createIconButton({});
    const styleEl = handle.el.querySelector("style");
    expect(styleEl).not.toBeNull();
    const css = styleEl?.textContent ?? "";
    expect(css).toContain("var(--am-color-action-hover)");
    expect(css).toContain("var(--am-color-primary-main)");
    expect(css).toContain(":focus-visible");
    expect(css).toContain(":disabled");
  });

  it("onClick がクリックで発火する", () => {
    const onClick = jest.fn();
    handle = createIconButton({ onClick });
    document.body.appendChild(handle.el);
    handle.el.click();
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("update で disabled / ariaLabel / title / size を変更する", () => {
    handle = createIconButton({ ariaLabel: "before", size: "small" });
    expect(handle.el.style.padding).toBe("5px");
    handle.update({
      disabled: true,
      ariaLabel: "after",
      title: "tip",
      size: "medium",
    });
    expect(handle.el.disabled).toBe(true);
    expect(handle.el.getAttribute("aria-label")).toBe("after");
    expect(handle.el.title).toBe("tip");
    expect(handle.el.style.padding).toBe("8px");
  });

  it("update で children を入れ替え、scoped style は維持する", () => {
    handle = createIconButton({ children: "old" });
    const styleBefore = handle.el.querySelector("style");
    handle.update({ children: "new" });
    expect(handle.el.querySelector("span")?.textContent).toBe("new");
    // 旧 span は除去され、style 要素は残存する。
    const spans = handle.el.querySelectorAll("span");
    expect(spans.length).toBe(1);
    expect(handle.el.querySelector("style")).toBe(styleBefore);
  });

  it("destroy 後はクリックしても onClick が呼ばれない", () => {
    const onClick = jest.fn();
    handle = createIconButton({ onClick });
    document.body.appendChild(handle.el);
    handle.el.click();
    expect(onClick).toHaveBeenCalledTimes(1);
    handle.destroy();
    handle.el.click();
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("destroy で scoped style 要素を除去する", () => {
    handle = createIconButton({});
    expect(handle.el.querySelector("style")).not.toBeNull();
    handle.destroy();
    expect(handle.el.querySelector("style")).toBeNull();
  });
});

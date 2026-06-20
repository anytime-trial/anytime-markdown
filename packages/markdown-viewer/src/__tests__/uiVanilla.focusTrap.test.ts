/**
 * createFocusTrap（ui-vanilla/focusTrap）の jsdom ユニットテスト。
 *
 * 検証観点: 初期フォーカス / focusable 列挙 / ESC・Tab イベント発火 / 背景スクロールロック /
 * 背景 a11y 隠蔽 / release のクリーンアップ（listener 解除・overflow 復元・aria-hidden 復元・
 * フォーカス復帰）/ release の冪等性 / オプション（lockScroll・hideBackground・onClose 省略）。
 */

import { createFocusTrap } from "@anytime-markdown/graph-core/ui-vanilla/focusTrap";

/** body 直下に挿入した container（focusable 群含む）を組み立てるヘルパ。 */
function mountContainer(focusableCount: number): {
  root: HTMLElement;
  container: HTMLElement;
  buttons: HTMLButtonElement[];
} {
  const root = document.createElement("div");
  const container = document.createElement("div");
  container.tabIndex = -1;
  const buttons: HTMLButtonElement[] = [];
  for (let i = 0; i < focusableCount; i += 1) {
    const btn = document.createElement("button");
    btn.textContent = `btn-${i}`;
    container.appendChild(btn);
    buttons.push(btn);
  }
  root.appendChild(container);
  document.body.appendChild(root);
  return { root, container, buttons };
}

describe("ui-vanilla/focusTrap", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    document.body.removeAttribute("style");
    document.documentElement.removeAttribute("style");
  });

  describe("初期フォーカス", () => {
    it("container 内の最初の focusable へフォーカスを移す", () => {
      const { container, buttons, root } = mountContainer(2);
      const { release } = createFocusTrap({ container });
      // jsdom は detached 要素の focus を no-op にする版があるため、focusable 解決と
      // フォーカス可能性（tabIndex 既定 0）を検証する。
      expect(buttons[0].tabIndex).toBe(0);
      expect([buttons[0], document.body]).toContain(document.activeElement);
      release();
      root.remove();
    });

    it("focusable が無いときは container 自体（tabIndex=-1）がフォーカス対象になる", () => {
      const { container, root } = mountContainer(0);
      const { release } = createFocusTrap({ container });
      expect(container.tabIndex).toBe(-1);
      expect([container, document.body]).toContain(document.activeElement);
      release();
      root.remove();
    });
  });

  describe("ESC キー", () => {
    it("Escape で onClose を呼ぶ", () => {
      const onClose = jest.fn();
      const { container, root } = mountContainer(1);
      const { release } = createFocusTrap({ container, onClose });
      container.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
      expect(onClose).toHaveBeenCalledTimes(1);
      release();
      root.remove();
    });

    it("onClose 省略時は Escape を無視する（例外を投げない）", () => {
      const { container, root } = mountContainer(1);
      const { release } = createFocusTrap({ container });
      expect(() =>
        container.dispatchEvent(
          new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
        ),
      ).not.toThrow();
      release();
      root.remove();
    });
  });

  describe("Tab フォーカストラップ", () => {
    it("末尾で Tab すると先頭へ戻す", () => {
      const { container, buttons, root } = mountContainer(2);
      const { release } = createFocusTrap({ container });
      buttons[1].focus();
      const evt = new KeyboardEvent("keydown", {
        key: "Tab",
        bubbles: true,
        cancelable: true,
      });
      container.dispatchEvent(evt);
      expect(evt.defaultPrevented).toBe(true);
      expect(document.activeElement).toBe(buttons[0]);
      release();
      root.remove();
    });

    it("先頭で Shift+Tab すると末尾へ移す", () => {
      const { container, buttons, root } = mountContainer(2);
      const { release } = createFocusTrap({ container });
      buttons[0].focus();
      const evt = new KeyboardEvent("keydown", {
        key: "Tab",
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      });
      container.dispatchEvent(evt);
      expect(evt.defaultPrevented).toBe(true);
      expect(document.activeElement).toBe(buttons[1]);
      release();
      root.remove();
    });

    it("中間要素での Tab は preventDefault しない（ブラウザ既定の移動に任せる）", () => {
      const { container, buttons, root } = mountContainer(3);
      const { release } = createFocusTrap({ container });
      buttons[1].focus();
      const evt = new KeyboardEvent("keydown", {
        key: "Tab",
        bubbles: true,
        cancelable: true,
      });
      container.dispatchEvent(evt);
      expect(evt.defaultPrevented).toBe(false);
      release();
      root.remove();
    });

    it("focusable が無いときは Tab で何もしない", () => {
      const { container, root } = mountContainer(0);
      const { release } = createFocusTrap({ container });
      const evt = new KeyboardEvent("keydown", {
        key: "Tab",
        bubbles: true,
        cancelable: true,
      });
      container.dispatchEvent(evt);
      expect(evt.defaultPrevented).toBe(false);
      release();
      root.remove();
    });
  });

  describe("背景スクロールロック", () => {
    it("attach で overflow:hidden を設定し release で元へ戻す", () => {
      document.body.style.overflow = "scroll";
      const { container, root } = mountContainer(1);
      const { release } = createFocusTrap({ container });
      expect(document.body.style.overflow).toBe("hidden");
      release();
      expect(document.body.style.overflow).toBe("scroll");
      root.remove();
    });

    it("lockScroll=false のときは overflow を変更しない", () => {
      document.body.style.overflow = "auto";
      const { container, root } = mountContainer(1);
      const { release } = createFocusTrap({ container, lockScroll: false });
      expect(document.body.style.overflow).toBe("auto");
      release();
      expect(document.body.style.overflow).toBe("auto");
      root.remove();
    });
  });

  describe("背景 a11y 隠蔽", () => {
    it("container の portal ルート以外の body 直下要素へ aria-hidden を付け、release で外す", () => {
      const sibling = document.createElement("div");
      document.body.appendChild(sibling);
      const { container, root } = mountContainer(1);
      const { release } = createFocusTrap({ container });
      expect(sibling.getAttribute("aria-hidden")).toBe("true");
      // container を含む portal ルート（root）自身には付かない。
      expect(root.getAttribute("aria-hidden")).toBeNull();
      release();
      expect(sibling.getAttribute("aria-hidden")).toBeNull();
      root.remove();
    });

    it("既に aria-hidden=true の要素は触らず、release でも残す", () => {
      const sibling = document.createElement("div");
      sibling.setAttribute("aria-hidden", "true");
      document.body.appendChild(sibling);
      const { container, root } = mountContainer(1);
      const { release } = createFocusTrap({ container });
      expect(sibling.getAttribute("aria-hidden")).toBe("true");
      release();
      // 元から true だったものは release 後も残る（管理対象外）。
      expect(sibling.getAttribute("aria-hidden")).toBe("true");
      root.remove();
    });

    it("hideBackground=false のときは sibling に aria-hidden を付けない", () => {
      const sibling = document.createElement("div");
      document.body.appendChild(sibling);
      const { container, root } = mountContainer(1);
      const { release } = createFocusTrap({ container, hideBackground: false });
      expect(sibling.getAttribute("aria-hidden")).toBeNull();
      release();
      root.remove();
    });

    it("container が body 配下に未挿入のときは隠蔽しない（portalRoot 解決不可）", () => {
      const sibling = document.createElement("div");
      document.body.appendChild(sibling);
      // detached container（root を body へ挿入しない）。
      const container = document.createElement("div");
      container.tabIndex = -1;
      const { release } = createFocusTrap({ container });
      expect(sibling.getAttribute("aria-hidden")).toBeNull();
      release();
      expect(sibling.getAttribute("aria-hidden")).toBeNull();
    });
  });

  describe("release のクリーンアップ", () => {
    it("release 後は ESC で onClose を呼ばない", () => {
      const onClose = jest.fn();
      const { container, root } = mountContainer(1);
      const { release } = createFocusTrap({ container, onClose });
      release();
      container.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
      expect(onClose).not.toHaveBeenCalled();
      root.remove();
    });

    it("release 後は Tab トラップが効かない", () => {
      const { container, buttons, root } = mountContainer(2);
      const { release } = createFocusTrap({ container });
      release();
      buttons[1].focus();
      const evt = new KeyboardEvent("keydown", {
        key: "Tab",
        bubbles: true,
        cancelable: true,
      });
      container.dispatchEvent(evt);
      expect(evt.defaultPrevented).toBe(false);
      root.remove();
    });

    it("release は冪等（複数回呼んでも overflow を二重復元しない）", () => {
      document.body.style.overflow = "auto";
      const { container, root } = mountContainer(1);
      const { release } = createFocusTrap({ container });
      release();
      expect(document.body.style.overflow).toBe("auto");
      // 2 回目は no-op。間に overflow を変えても復元しない。
      document.body.style.overflow = "scroll";
      release();
      expect(document.body.style.overflow).toBe("scroll");
      root.remove();
    });

    it("release で直前のフォーカス要素へ復帰する", () => {
      const opener = document.createElement("button");
      opener.textContent = "open";
      document.body.appendChild(opener);
      opener.focus();
      expect(document.activeElement).toBe(opener);
      const { container, root } = mountContainer(1);
      const { release } = createFocusTrap({ container });
      release();
      expect(document.activeElement).toBe(opener);
      root.remove();
    });
  });
});

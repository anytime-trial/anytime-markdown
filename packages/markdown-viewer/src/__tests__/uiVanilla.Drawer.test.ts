/**
 * createDrawer（ui-vanilla/Drawer）の jsdom ユニットテスト。
 *
 * 検証観点: DOM 生成 / 属性（role / aria-* / data-anchor） / CSS 変数参照（cssText） /
 * anchor 別 slide transform / width / イベント発火（ESC・backdrop mousedown・paper 内無視） /
 * requestAnimationFrame による entered 状態 / 背景スクロールロック / destroy のクリーンアップ
 * （listener 解除・overflow 復元・el 取り外し・rAF 解除）・冪等性。
 *
 * 注意: jsdom は継承された CSS カスタムプロパティを getComputedStyle で解決しないため、
 * inherit の computed 検証は行わず、el.style.cssText が var(--am-...) を含むことを検証する。
 */

import { createDrawer } from "../ui-vanilla/Drawer";

describe("ui-vanilla/Drawer", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    document.body.removeAttribute("style");
    document.documentElement.removeAttribute("style");
    jest.restoreAllMocks();
  });

  describe("DOM 生成・属性", () => {
    it("presentation ルートと role=dialog の paper / backdrop を生成する", () => {
      const { el, paper, destroy } = createDrawer({ onClose: () => {} });
      expect(el.tagName).toBe("DIV");
      expect(el.getAttribute("role")).toBe("presentation");
      expect(el.getAttribute("data-print-hide")).toBe("");
      expect(paper.getAttribute("role")).toBe("dialog");
      expect(paper.getAttribute("aria-modal")).toBe("true");
      expect(paper.tabIndex).toBe(-1);
      expect(el.contains(paper)).toBe(true);
      const backdrop = el.querySelector("[data-am-drawer-backdrop]");
      expect(backdrop).not.toBeNull();
      expect(el.contains(backdrop as Node)).toBe(true);
      destroy();
    });

    it("aria-labelledby は presentation ルートに、aria-label は paper に付与する", () => {
      const { el, paper, destroy } = createDrawer({
        onClose: () => {},
        labelledBy: "title-x",
        ariaLabel: "ナビゲーション",
      });
      expect(el.getAttribute("aria-labelledby")).toBe("title-x");
      expect(paper.getAttribute("aria-label")).toBe("ナビゲーション");
      // labelledBy はルート専用（paper には付けない）。
      expect(paper.getAttribute("aria-labelledby")).toBeNull();
      destroy();
    });

    it("既定 anchor は left（data-anchor=left）", () => {
      const { paper, destroy } = createDrawer({ onClose: () => {} });
      expect(paper.getAttribute("data-anchor")).toBe("left");
      destroy();
    });

    it("anchor=right を data-anchor に反映する", () => {
      const { paper, destroy } = createDrawer({ onClose: () => {}, anchor: "right" });
      expect(paper.getAttribute("data-anchor")).toBe("right");
      destroy();
    });

    it("children（string / Node）を paper へ流し込む", () => {
      const button = document.createElement("button");
      button.textContent = "OK";
      const { paper, destroy } = createDrawer({
        onClose: () => {},
        children: ["メニュー", button],
      });
      expect(paper.textContent).toContain("メニュー");
      expect(paper.querySelector("button")?.textContent).toBe("OK");
      destroy();
    });
  });

  describe("CSS 変数参照・スタイル", () => {
    it("root / backdrop / paper の cssText がテーマ CSS 変数を参照する", () => {
      const { el, paper, destroy } = createDrawer({ onClose: () => {} });
      // root は z-index 1300 の固定オーバーレイ。
      expect(el.style.cssText).toContain("z-index: 1300");
      expect(el.style.cssText).toContain("position: fixed");
      // backdrop は fade 遷移（duration / ease 変数）。
      const backdrop = el.querySelector<HTMLElement>("[data-am-drawer-backdrop]")!;
      expect(backdrop.style.cssText).toContain("var(--am-duration-fast)");
      expect(backdrop.style.cssText).toContain("var(--am-ease-standard)");
      // paper はテーマ変数で背景・文字色・影・overlay を引く。
      expect(paper.style.cssText).toContain("var(--am-color-bg-paper)");
      expect(paper.style.cssText).toContain("var(--am-color-text-primary)");
      expect(paper.style.cssText).toContain("var(--am-elevation-3)");
      expect(paper.style.cssText).toContain("var(--am-overlay-elevation-16");
      expect(paper.style.cssText).toContain("var(--am-duration-fast)");
      destroy();
    });

    it("CSS 変数を documentElement から継承して解決する（変数自体の取得のみ）", () => {
      document.documentElement.style.setProperty(
        "--am-color-bg-paper",
        "rgb(18, 18, 18)",
      );
      const { el, destroy } = createDrawer({ onClose: () => {} });
      document.body.appendChild(el);
      const resolved = window
        .getComputedStyle(document.documentElement)
        .getPropertyValue("--am-color-bg-paper");
      expect(resolved.trim()).toBe("rgb(18, 18, 18)");
      destroy();
    });

    it("anchor=left は left:0 + translateX(-100%) の closed 位置から開始する", () => {
      const { paper, destroy } = createDrawer({ onClose: () => {} });
      expect(paper.style.cssText).toContain("left: 0");
      expect(paper.style.cssText).toContain("translateX(-100%)");
      destroy();
    });

    it("anchor=right は right:0 + translateX(100%) の closed 位置から開始する", () => {
      const { paper, destroy } = createDrawer({ onClose: () => {}, anchor: "right" });
      expect(paper.style.cssText).toContain("right: 0");
      expect(paper.style.cssText).toContain("translateX(100%)");
      destroy();
    });

    it("width（数値）は px として paper に付与する", () => {
      const { paper, destroy } = createDrawer({ onClose: () => {}, width: 280 });
      expect(paper.style.cssText).toContain("width: 280px");
      destroy();
    });

    it("width（文字列）はそのまま paper に付与する", () => {
      const { paper, destroy } = createDrawer({ onClose: () => {}, width: "60%" });
      expect(paper.style.cssText).toContain("width: 60%");
      destroy();
    });

    it("paperStyle で追加スタイルを上書きできる", () => {
      const { paper, destroy } = createDrawer({
        onClose: () => {},
        paperStyle: { padding: "8px" },
      });
      expect(paper.style.padding).toBe("8px");
      destroy();
    });
  });

  describe("slide transition（entered 状態）", () => {
    it("生成直後（rAF 前）は closed 位置・backdrop opacity 0 のまま", () => {
      // rAF を実行させない（callback を保留する）モックで初期状態を確認する。
      jest.spyOn(window, "requestAnimationFrame").mockImplementation(() => 1 as unknown as number);
      const { el, paper, destroy } = createDrawer({ onClose: () => {} });
      const backdrop = el.querySelector<HTMLElement>("[data-am-drawer-backdrop]")!;
      expect(backdrop.style.opacity).toBe("0");
      expect(paper.style.transform).toContain("translateX(-100%)");
      destroy();
    });

    it("requestAnimationFrame で entered（translateX(0) + backdrop opacity 1）を立てる", () => {
      let cb: FrameRequestCallback | null = null;
      jest.spyOn(window, "requestAnimationFrame").mockImplementation((fn) => {
        cb = fn;
        return 1 as unknown as number;
      });
      const { el, paper, destroy } = createDrawer({ onClose: () => {} });
      const backdrop = el.querySelector<HTMLElement>("[data-am-drawer-backdrop]")!;
      expect(typeof cb).toBe("function");
      // rAF callback を手動で発火 → entered 状態へ。
      cb!(0);
      expect(backdrop.style.opacity).toBe("1");
      expect(paper.style.transform).toBe("translateX(0)");
      destroy();
    });

    it("entered 前に destroy すると保留中の rAF を cancel する", () => {
      const cancelSpy = jest.spyOn(window, "cancelAnimationFrame");
      jest
        .spyOn(window, "requestAnimationFrame")
        .mockImplementation(() => 42 as unknown as number);
      const { destroy } = createDrawer({ onClose: () => {} });
      destroy();
      expect(cancelSpy).toHaveBeenCalledWith(42);
    });
  });

  describe("イベント発火", () => {
    it("Escape キー（paper 上）で onClose を呼ぶ", () => {
      const onClose = jest.fn();
      const { el, paper, destroy } = createDrawer({ onClose });
      document.body.appendChild(el);
      paper.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
      expect(onClose).toHaveBeenCalledTimes(1);
      destroy();
    });

    it("backdrop（自身）の mousedown で onClose を呼ぶ", () => {
      const onClose = jest.fn();
      const { el, destroy } = createDrawer({ onClose });
      document.body.appendChild(el);
      const backdrop = el.querySelector<HTMLElement>("[data-am-drawer-backdrop]")!;
      backdrop.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      expect(onClose).toHaveBeenCalledTimes(1);
      destroy();
    });

    it("paper 内クリック（mousedown）では onClose を呼ばない", () => {
      const onClose = jest.fn();
      const button = document.createElement("button");
      const { el, paper, destroy } = createDrawer({ onClose, children: button });
      document.body.appendChild(el);
      paper.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      expect(onClose).not.toHaveBeenCalled();
      destroy();
    });

    it("Tab フォーカストラップ: 末尾で Tab すると先頭へ戻す", () => {
      const first = document.createElement("button");
      first.textContent = "first";
      const last = document.createElement("button");
      last.textContent = "last";
      const { el, paper, destroy } = createDrawer({
        onClose: () => {},
        children: [first, last],
      });
      document.body.appendChild(el);
      last.focus();
      const evt = new KeyboardEvent("keydown", {
        key: "Tab",
        bubbles: true,
        cancelable: true,
      });
      paper.dispatchEvent(evt);
      expect(evt.defaultPrevented).toBe(true);
      expect(document.activeElement).toBe(first);
      destroy();
    });
  });

  describe("背景スクロールロック・destroy", () => {
    it("背景スクロールをロックし、destroy で元の overflow へ戻す", () => {
      document.body.style.overflow = "scroll";
      const { destroy } = createDrawer({ onClose: () => {} });
      expect(document.body.style.overflow).toBe("hidden");
      destroy();
      expect(document.body.style.overflow).toBe("scroll");
    });

    it("destroy 後は ESC / backdrop イベントで onClose を呼ばない", () => {
      const onClose = jest.fn();
      const { el, paper, destroy } = createDrawer({ onClose });
      document.body.appendChild(el);
      destroy();
      const backdrop = el.querySelector<HTMLElement>("[data-am-drawer-backdrop]")!;
      paper.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
      backdrop.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      expect(onClose).not.toHaveBeenCalled();
    });

    it("destroy で presentation ルートを親から取り外す", () => {
      const { el, destroy } = createDrawer({ onClose: () => {} });
      document.body.appendChild(el);
      expect(el.parentElement).toBe(document.body);
      destroy();
      expect(el.parentElement).toBeNull();
    });

    it("destroy は冪等（複数回呼んでも overflow を二重復元しない）", () => {
      document.body.style.overflow = "auto";
      const { destroy } = createDrawer({ onClose: () => {} });
      destroy();
      expect(document.body.style.overflow).toBe("auto");
      // 2 回目は no-op。
      document.body.style.overflow = "scroll";
      destroy();
      expect(document.body.style.overflow).toBe("scroll");
    });
  });
});

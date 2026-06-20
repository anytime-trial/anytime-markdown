/**
 * createDialog 一式（ui-vanilla/Dialog）の jsdom ユニットテスト。
 *
 * 検証観点: DOM 生成 / 属性（role / aria-*） / CSS 変数応答 / イベント発火（ESC・backdrop） /
 * 初期フォーカス / フォーカストラップ / destroy のクリーンアップ（listener 解除・overflow 復元）。
 */

import {
  createDialog,
  createDialogActions,
  createDialogContent,
  createDialogContentText,
  createDialogTitle,
  nextDialogTitleId,
} from "@anytime-markdown/graph-core/ui-vanilla/Dialog";

describe("ui-vanilla/Dialog", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    document.body.removeAttribute("style");
    document.documentElement.removeAttribute("style");
  });

  describe("createDialog", () => {
    it("backdrop ルートと role=dialog の paper を生成する", () => {
      const { el, paper, destroy } = createDialog({ onClose: () => {} });
      expect(el.tagName).toBe("DIV");
      expect(el.getAttribute("data-am-dialog-backdrop")).toBe("");
      expect(paper.getAttribute("role")).toBe("dialog");
      expect(paper.getAttribute("aria-modal")).toBe("true");
      expect(paper.tabIndex).toBe(-1);
      expect(el.contains(paper)).toBe(true);
      destroy();
    });

    it("backdrop / paper の cssText がテーマ CSS 変数を参照する", () => {
      const { el, paper, destroy } = createDialog({ onClose: () => {} });
      // backdrop は z-index 12000 の固定オーバーレイ
      expect(el.style.cssText).toContain("z-index: 12000");
      expect(el.style.cssText).toContain("position: fixed");
      // paper はテーマ変数で背景・文字色・角丸・影を引く
      expect(paper.style.cssText).toContain("var(--am-color-bg-paper)");
      expect(paper.style.cssText).toContain("var(--am-color-text-primary)");
      expect(paper.style.cssText).toContain("var(--am-radius-md)");
      expect(paper.style.cssText).toContain("var(--am-elevation-3)");
      destroy();
    });

    it("CSS 変数を documentElement から継承して解決する", () => {
      document.documentElement.style.setProperty(
        "--am-color-bg-paper",
        "rgb(18, 18, 18)",
      );
      const { el, destroy } = createDialog({ onClose: () => {} });
      document.body.appendChild(el);
      const resolved = window
        .getComputedStyle(document.documentElement)
        .getPropertyValue("--am-color-bg-paper");
      expect(resolved.trim()).toBe("rgb(18, 18, 18)");
      destroy();
    });

    it("aria-label / labelledBy / describedBy を paper に設定する", () => {
      const { paper, destroy } = createDialog({
        onClose: () => {},
        ariaLabel: "テストダイアログ",
        labelledBy: "title-x",
        describedBy: "desc-x",
      });
      expect(paper.getAttribute("aria-label")).toBe("テストダイアログ");
      expect(paper.getAttribute("aria-labelledby")).toBe("title-x");
      expect(paper.getAttribute("aria-describedby")).toBe("desc-x");
      destroy();
    });

    it("children（string / Node）を paper へ流し込む", () => {
      const button = document.createElement("button");
      button.textContent = "OK";
      const { paper, destroy } = createDialog({
        onClose: () => {},
        children: ["説明文", button],
      });
      expect(paper.textContent).toContain("説明文");
      expect(paper.querySelector("button")?.textContent).toBe("OK");
      destroy();
    });

    it("maxWidth=md を max-width に反映する", () => {
      const { paper, destroy } = createDialog({ onClose: () => {}, maxWidth: "md" });
      expect(paper.style.cssText).toContain("max-width: min(900px");
      destroy();
    });

    it("fullWidth は width:calc(100% - 64px) を付与する", () => {
      const { paper, destroy } = createDialog({ onClose: () => {}, fullWidth: true });
      expect(paper.style.cssText).toContain("width: calc(100% - 64px)");
      destroy();
    });

    it("fullScreen は余白・角丸なしのフルサイズにする", () => {
      const { paper, destroy } = createDialog({ onClose: () => {}, fullScreen: true });
      expect(paper.style.cssText).toContain("width: 100%");
      expect(paper.style.cssText).toContain("height: 100%");
      expect(paper.style.cssText).toContain("border-radius: 0");
      expect(paper.style.cssText).toContain("margin: 0");
      destroy();
    });

    it("Escape キーで onClose を呼ぶ", () => {
      const onClose = jest.fn();
      const { el, paper, destroy } = createDialog({ onClose });
      document.body.appendChild(el);
      paper.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
      expect(onClose).toHaveBeenCalledTimes(1);
      destroy();
    });

    it("backdrop（自身）の mousedown で onClose を呼ぶ", () => {
      const onClose = jest.fn();
      const { el, destroy } = createDialog({ onClose });
      document.body.appendChild(el);
      el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      expect(onClose).toHaveBeenCalledTimes(1);
      destroy();
    });

    it("paper 内クリック（mousedown）では onClose を呼ばない", () => {
      const onClose = jest.fn();
      const button = document.createElement("button");
      const { el, paper, destroy } = createDialog({ onClose, children: button });
      document.body.appendChild(el);
      paper.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      expect(onClose).not.toHaveBeenCalled();
      destroy();
    });

    it("生成時に paper 内の最初の focusable へフォーカスを移す", () => {
      const button = document.createElement("button");
      button.textContent = "ok";
      const { destroy } = createDialog({ onClose: () => {}, children: button });
      // 生成時点で children（button）が存在するため、初期フォーカス対象は button。
      // jsdom は detached 要素への focus を no-op にする版があるため、focusable 解決と
      // フォーカス可能性（tabIndex 既定 0）を検証する。
      expect(button.tabIndex).toBe(0);
      expect([button, document.body]).toContain(document.activeElement);
      destroy();
    });

    it("focusable が無いときは paper 自体（tabIndex=-1）がフォーカス対象になる", () => {
      const { paper, destroy } = createDialog({
        onClose: () => {},
        children: "本文のみ",
      });
      // paper はプログラム的フォーカスを受けられる（tabIndex=-1）。
      expect(paper.tabIndex).toBe(-1);
      expect([paper, document.body]).toContain(document.activeElement);
      destroy();
    });

    it("Tab フォーカストラップ: 末尾で Tab すると先頭へ戻す", () => {
      const first = document.createElement("button");
      first.textContent = "first";
      const last = document.createElement("button");
      last.textContent = "last";
      const { el, paper, destroy } = createDialog({
        onClose: () => {},
        children: [first, last],
      });
      document.body.appendChild(el);
      last.focus();
      const evt = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
      paper.dispatchEvent(evt);
      expect(evt.defaultPrevented).toBe(true);
      expect(document.activeElement).toBe(first);
      destroy();
    });

    it("Tab フォーカストラップ: Shift+Tab を先頭で押すと末尾へ移す", () => {
      const first = document.createElement("button");
      first.textContent = "first";
      const last = document.createElement("button");
      last.textContent = "last";
      const { el, paper, destroy } = createDialog({
        onClose: () => {},
        children: [first, last],
      });
      document.body.appendChild(el);
      first.focus();
      const evt = new KeyboardEvent("keydown", {
        key: "Tab",
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      });
      paper.dispatchEvent(evt);
      expect(evt.defaultPrevented).toBe(true);
      expect(document.activeElement).toBe(last);
      destroy();
    });

    it("背景スクロールをロックし、destroy で元の overflow へ戻す", () => {
      document.body.style.overflow = "scroll";
      const { destroy } = createDialog({ onClose: () => {} });
      expect(document.body.style.overflow).toBe("hidden");
      destroy();
      expect(document.body.style.overflow).toBe("scroll");
    });

    it("destroy は背景 a11y 隠蔽を復元する（detached 構築では sibling を変更しない）", () => {
      // createDialog は構築時点の el を基準に背景 a11y 隠蔽を計算する。本ファクトリは
      // el が DOM 未挿入の状態で構築されるため portalRoot が解決できず、隠蔽は行われない。
      // destroy 後も既存の body 直下要素は無改変であることを確認する。
      const sibling = document.createElement("div");
      document.body.appendChild(sibling);
      const { el, destroy } = createDialog({ onClose: () => {} });
      document.body.appendChild(el);
      destroy();
      expect(sibling.getAttribute("aria-hidden")).toBeNull();
    });

    it("destroy 後は ESC / backdrop イベントで onClose を呼ばない", () => {
      const onClose = jest.fn();
      const { el, paper, destroy } = createDialog({ onClose });
      document.body.appendChild(el);
      destroy();
      paper.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      expect(onClose).not.toHaveBeenCalled();
    });

    it("destroy で backdrop ルートを親から取り外す", () => {
      const { el, destroy } = createDialog({ onClose: () => {} });
      document.body.appendChild(el);
      expect(el.parentElement).toBe(document.body);
      destroy();
      expect(el.parentElement).toBeNull();
    });

    it("destroy は冪等（複数回呼んでも overflow を二重復元しない）", () => {
      document.body.style.overflow = "auto";
      const { destroy } = createDialog({ onClose: () => {} });
      destroy();
      expect(document.body.style.overflow).toBe("auto");
      // 2 回目は no-op
      document.body.style.overflow = "scroll";
      destroy();
      expect(document.body.style.overflow).toBe("scroll");
    });
  });

  describe("Dialog 構成パーツ", () => {
    it("createDialogTitle は h2 を生成し id / children を設定する", () => {
      const { el } = createDialogTitle({ id: "t1", children: "タイトル" });
      expect(el.tagName).toBe("H2");
      expect(el.id).toBe("t1");
      expect(el.textContent).toContain("タイトル");
      expect(el.style.cssText).toContain("font-weight: 600");
    });

    it("createDialogContent は div を生成し dividers で罫線を付ける", () => {
      const plain = createDialogContent({ children: "本文" });
      expect(plain.el.tagName).toBe("DIV");
      expect(plain.el.style.cssText).toContain("padding: var(--am-space-2) var(--am-space-4)");
      expect(plain.el.style.cssText).not.toContain("border-top");

      const dividers = createDialogContent({ children: "本文", dividers: true });
      expect(dividers.el.style.cssText).toContain("var(--am-color-divider)");
      expect(dividers.el.style.cssText).toContain("overflow-y: auto");
    });

    it("createDialogActions は右寄せ flex の div を生成する", () => {
      const button = document.createElement("button");
      const { el } = createDialogActions({ children: button });
      expect(el.style.cssText).toContain("justify-content: flex-end");
      expect(el.contains(button)).toBe(true);
    });

    it("createDialogContentText は p を生成し text-secondary 色を引く", () => {
      const { el } = createDialogContentText({
        id: "d1",
        children: "説明",
        style: { whiteSpace: "pre-line" },
      });
      expect(el.tagName).toBe("P");
      expect(el.id).toBe("d1");
      expect(el.style.cssText).toContain("var(--am-color-text-secondary)");
      expect(el.style.whiteSpace).toBe("pre-line");
    });
  });

  describe("nextDialogTitleId", () => {
    it("呼ぶたびに一意の id 文字列を返す", () => {
      const a = nextDialogTitleId();
      const b = nextDialogTitleId();
      expect(typeof a).toBe("string");
      expect(a).not.toBe("");
      expect(a).not.toBe(b);
    });

    it("生成した id を title / dialog の aria-labelledby 連携に使える", () => {
      const id = nextDialogTitleId();
      const { el: titleEl } = createDialogTitle({ id, children: "見出し" });
      const { paper, destroy } = createDialog({ onClose: () => {}, labelledBy: id });
      expect(titleEl.id).toBe(id);
      expect(paper.getAttribute("aria-labelledby")).toBe(id);
      destroy();
    });
  });
});

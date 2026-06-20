/**
 * createSkeleton（ui-vanilla/Skeleton.ts）の jsdom ユニットテスト。
 * 生成・variant クラス・width/height・style 上書き・update・keyframes 注入の冪等性を検証する。
 *
 * jsdom は継承された CSS カスタムプロパティを getComputedStyle で解決しないため、
 * inherit の computed 検証は行わない。代わりに el.style.cssText / 注入 style の textContent が
 * var(--am-...) を含むことを検証する。
 */
import { createSkeleton } from "@anytime-markdown/ui-core/Skeleton";

const STYLE_ID = "am-vanilla-skeleton-keyframes";
const ROOT_CLASS = "am-vanilla-skeleton";

function clearKeyframeStyles(): void {
  document.querySelectorAll(`#${STYLE_ID}`).forEach((n) => n.remove());
}

beforeEach(() => {
  clearKeyframeStyles();
});

afterEach(() => {
  clearKeyframeStyles();
});

describe("createSkeleton", () => {
  it("span 要素を root クラス付きで生成する", () => {
    const { el } = createSkeleton();
    expect(el.tagName).toBe("SPAN");
    expect(el.classList.contains(ROOT_CLASS)).toBe(true);
  });

  it("既定 variant は rectangular", () => {
    const { el } = createSkeleton();
    expect(el.classList.contains("am-vanilla-skeleton-rectangular")).toBe(true);
    expect(el.classList.contains("am-vanilla-skeleton-text")).toBe(false);
    expect(el.classList.contains("am-vanilla-skeleton-circular")).toBe(false);
  });

  describe("variant クラス", () => {
    it("text variant を反映する", () => {
      const { el } = createSkeleton({ variant: "text" });
      expect(el.classList.contains("am-vanilla-skeleton-text")).toBe(true);
      expect(el.classList.contains("am-vanilla-skeleton-rectangular")).toBe(false);
    });

    it("circular variant を反映する", () => {
      const { el } = createSkeleton({ variant: "circular" });
      expect(el.classList.contains("am-vanilla-skeleton-circular")).toBe(true);
    });

    it("rectangular variant を反映する", () => {
      const { el } = createSkeleton({ variant: "rectangular" });
      expect(el.classList.contains("am-vanilla-skeleton-rectangular")).toBe(true);
    });
  });

  describe("width / height", () => {
    it("number は px 化して適用する", () => {
      const { el } = createSkeleton({ width: 120, height: 24 });
      expect(el.style.width).toBe("120px");
      expect(el.style.height).toBe("24px");
    });

    it("string はそのまま適用する", () => {
      const { el } = createSkeleton({ width: "50%", height: "2rem" });
      expect(el.style.width).toBe("50%");
      expect(el.style.height).toBe("2rem");
    });

    it("未指定時は width/height を設定しない", () => {
      const { el } = createSkeleton();
      expect(el.style.width).toBe("");
      expect(el.style.height).toBe("");
    });
  });

  describe("className", () => {
    it("追加クラスを root クラスと併せて付与する", () => {
      const { el } = createSkeleton({ className: "custom-skel" });
      expect(el.classList.contains(ROOT_CLASS)).toBe(true);
      expect(el.classList.contains("custom-skel")).toBe(true);
    });
  });

  describe("style 上書き", () => {
    it("style オプションを要素に適用する", () => {
      const { el } = createSkeleton({ style: { marginTop: "8px" } });
      expect(el.style.marginTop).toBe("8px");
    });

    it("style は width/height より後に重なり上書きできる", () => {
      const { el } = createSkeleton({ width: 100, style: { width: "200px" } });
      expect(el.style.width).toBe("200px");
    });
  });

  describe("background はテーマ CSS 変数を参照する", () => {
    it("注入 style の root が --am-color-skeleton-bg を参照する", () => {
      createSkeleton();
      const styleEl = document.getElementById(STYLE_ID);
      expect(styleEl?.textContent).toContain("var(--am-color-skeleton-bg)");
    });
  });

  describe("update", () => {
    it("variant を rectangular から text に切り替える", () => {
      const skel = createSkeleton({ variant: "rectangular" });
      skel.update({ variant: "text" });
      expect(skel.el.classList.contains("am-vanilla-skeleton-text")).toBe(true);
      expect(skel.el.classList.contains("am-vanilla-skeleton-rectangular")).toBe(false);
    });

    it("width / height を更新する", () => {
      const skel = createSkeleton({ width: 100, height: 20 });
      skel.update({ width: 200, height: 40 });
      expect(skel.el.style.width).toBe("200px");
      expect(skel.el.style.height).toBe("40px");
    });

    it("className を差し替えても root / variant クラスは保持する", () => {
      const skel = createSkeleton({ variant: "circular", className: "old" });
      skel.update({ className: "new" });
      expect(skel.el.classList.contains(ROOT_CLASS)).toBe(true);
      expect(skel.el.classList.contains("am-vanilla-skeleton-circular")).toBe(true);
      expect(skel.el.classList.contains("new")).toBe(true);
      expect(skel.el.classList.contains("old")).toBe(false);
    });

    it("variant 変更時も既存 className を保持する", () => {
      const skel = createSkeleton({ variant: "rectangular", className: "keep" });
      skel.update({ variant: "circular" });
      expect(skel.el.classList.contains("keep")).toBe(true);
      expect(skel.el.classList.contains("am-vanilla-skeleton-circular")).toBe(true);
    });

    it("style 更新を適用する", () => {
      const skel = createSkeleton();
      skel.update({ style: { opacity: "0.5" } });
      expect(skel.el.style.opacity).toBe("0.5");
    });

    it("空オブジェクト update は既存属性を保持する", () => {
      const skel = createSkeleton({ variant: "text", width: 64 });
      skel.update({});
      expect(skel.el.classList.contains("am-vanilla-skeleton-text")).toBe(true);
      expect(skel.el.style.width).toBe("64px");
    });
  });

  describe("keyframes 注入", () => {
    it("初回生成で document.head に style を 1 つ注入する", () => {
      createSkeleton();
      const styles = document.querySelectorAll(`#${STYLE_ID}`);
      expect(styles.length).toBe(1);
      expect(styles[0]?.textContent).toContain("am-skeleton-pulse");
    });

    it("複数回生成しても style は冪等で 1 つに保つ", () => {
      createSkeleton();
      createSkeleton();
      createSkeleton();
      expect(document.querySelectorAll(`#${STYLE_ID}`).length).toBe(1);
    });

    it("prefers-reduced-motion で animation:none を含む", () => {
      createSkeleton();
      const styleEl = document.getElementById(STYLE_ID);
      expect(styleEl?.textContent).toContain("prefers-reduced-motion");
      expect(styleEl?.textContent).toContain("animation:none");
    });
  });
});

import { createAvatar } from "../Avatar";

describe("createAvatar", () => {
  it("span を生成する", () => {
    const { el } = createAvatar();
    expect(el.tagName).toBe("SPAN");
  });

  it("am-avatar クラスを持つ", () => {
    const { el } = createAvatar();
    expect(el.className).toContain("am-avatar");
  });

  it("src が指定されると img を内包する", () => {
    const { el } = createAvatar({ src: "https://example.com/avatar.png", alt: "Alice" });
    const img = el.querySelector("img");
    expect(img).not.toBeNull();
    expect(img?.src).toBe("https://example.com/avatar.png");
    expect(img?.alt).toBe("Alice");
  });

  it("src がないとき children を表示する", () => {
    const { el } = createAvatar({ children: "AB" });
    expect(el.textContent).toContain("AB");
    expect(el.querySelector("img")).toBeNull();
  });

  it("alt が aria-label に設定される", () => {
    const { el } = createAvatar({ alt: "Bob" });
    expect(el.getAttribute("aria-label")).toBe("Bob");
  });

  it("size=small で am-avatar--small クラスを付与する", () => {
    const { el } = createAvatar({ size: "small" });
    expect(el.className).toContain("am-avatar--small");
  });

  it("size=large で am-avatar--large クラスを付与する", () => {
    const { el } = createAvatar({ size: "large" });
    expect(el.className).toContain("am-avatar--large");
  });

  it("size=medium では small/large クラスを付与しない", () => {
    const { el } = createAvatar({ size: "medium" });
    expect(el.className).not.toContain("am-avatar--small");
    expect(el.className).not.toContain("am-avatar--large");
  });

  it("variant=rounded で am-avatar--rounded クラスを付与する", () => {
    const { el } = createAvatar({ variant: "rounded" });
    expect(el.className).toContain("am-avatar--rounded");
  });

  it("variant=square で am-avatar--square クラスを付与する", () => {
    const { el } = createAvatar({ variant: "square" });
    expect(el.className).toContain("am-avatar--square");
  });

  it("variant=circular では rounded/square クラスを付与しない", () => {
    const { el } = createAvatar({ variant: "circular" });
    expect(el.className).not.toContain("am-avatar--rounded");
    expect(el.className).not.toContain("am-avatar--square");
  });

  it("className / testId を反映する", () => {
    const { el } = createAvatar({ className: "extra", testId: "av-1" });
    expect(el.className).toContain("extra");
    expect(el.getAttribute("data-testid")).toBe("av-1");
  });

  it("style を反映する", () => {
    const { el } = createAvatar({ style: { width: "64px" } });
    expect(el.style.width).toBe("64px");
  });
});

import { createRating } from "../Rating";

describe("createRating", () => {
  it("span を生成し、max 個の星ボタンを内包する", () => {
    const { el } = createRating({ max: 5 });
    expect(el.tagName).toBe("SPAN");
    expect(el.querySelectorAll("button").length).toBe(5);
  });

  it("max の既定値は 5", () => {
    const { el } = createRating();
    expect(el.querySelectorAll("button").length).toBe(5);
  });

  it("am-rating クラスを持つ", () => {
    const { el } = createRating();
    expect(el.className).toContain("am-rating");
  });

  it("value に応じて塗り済み星（★）の数が正しい", () => {
    const { el } = createRating({ value: 3, max: 5 });
    const btns = el.querySelectorAll("button");
    const filled = [...btns].filter((b) => b.textContent === "★").length;
    const empty = [...btns].filter((b) => b.textContent === "☆").length;
    expect(filled).toBe(3);
    expect(empty).toBe(2);
  });

  it("value=null のとき全て空星（☆）になる", () => {
    const { el } = createRating({ value: null, max: 3 });
    const btns = el.querySelectorAll("button");
    for (const btn of btns) {
      expect(btn.textContent).toBe("☆");
    }
  });

  it("setValue で星の塗り状態が更新される", () => {
    const { el, setValue } = createRating({ value: 1, max: 5 });
    setValue(4);
    const btns = el.querySelectorAll("button");
    const filled = [...btns].filter((b) => b.textContent === "★").length;
    expect(filled).toBe(4);
  });

  it("setValue(null) で全星が空星になる", () => {
    const { el, setValue } = createRating({ value: 3, max: 3 });
    setValue(null);
    const btns = el.querySelectorAll("button");
    for (const btn of btns) {
      expect(btn.textContent).toBe("☆");
    }
  });

  it("星クリックで onClick が発火し、新しい値が渡される", () => {
    const handler = jest.fn();
    const { el } = createRating({ value: 1, max: 3, onClick: handler });
    const btns = el.querySelectorAll("button");
    // 3番目の星をクリック
    btns[2].click();
    expect(handler).toHaveBeenCalledWith(3);
  });

  it("同じ星を再クリックすると null が渡される（トグル動作）", () => {
    const handler = jest.fn();
    const { el } = createRating({ value: 3, max: 5, onClick: handler });
    const btns = el.querySelectorAll("button");
    btns[2].click(); // 3番目の星（currentValue=3 と同じ）
    expect(handler).toHaveBeenCalledWith(null);
  });

  it("readOnly のとき星ボタンはクリックイベントリスナーなし（クラス付与で確認）", () => {
    const { el } = createRating({ value: 2, max: 3, readOnly: true });
    expect(el.className).toContain("am-rating--readonly");
  });

  it("disabled のとき星ボタンが disabled になる", () => {
    const { el } = createRating({ disabled: true, max: 3 });
    const btns = el.querySelectorAll("button");
    for (const btn of btns) {
      expect((btn as HTMLButtonElement).disabled).toBe(true);
    }
  });

  it("size=small で am-rating--small クラスを付与する", () => {
    const { el } = createRating({ size: "small" });
    expect(el.className).toContain("am-rating--small");
  });

  it("size=large で am-rating--large クラスを付与する", () => {
    const { el } = createRating({ size: "large" });
    expect(el.className).toContain("am-rating--large");
  });

  it("className / testId を反映する", () => {
    const { el } = createRating({ className: "my-rating", testId: "rt-1" });
    expect(el.className).toContain("my-rating");
    expect(el.getAttribute("data-testid")).toBe("rt-1");
  });

  it("aria-label に現在の値を反映する", () => {
    const { el } = createRating({ value: 3 });
    expect(el.getAttribute("aria-label")).toBe("3 stars");
  });

  it("style を反映する", () => {
    const { el } = createRating({ style: { fontSize: "2rem" } });
    expect(el.style.fontSize).toBe("2rem");
  });

  it("hover 後 mouseleave で元の塗り状態に戻る", () => {
    const { el } = createRating({ value: 2, max: 5 });
    const btns = el.querySelectorAll("button");
    // 4番目の星にhover
    btns[3].dispatchEvent(new MouseEvent("mouseenter"));
    const filledOnHover = [...btns].filter((b) => b.textContent === "★").length;
    expect(filledOnHover).toBe(4);
    // hover 解除
    btns[3].dispatchEvent(new MouseEvent("mouseleave"));
    const filledAfter = [...btns].filter((b) => b.textContent === "★").length;
    expect(filledAfter).toBe(2);
  });

  it("destroy 後は星クリックで onClick が呼ばれない", () => {
    const handler = jest.fn();
    const { el, destroy } = createRating({ value: 1, max: 3, onClick: handler });
    destroy();
    const btns = el.querySelectorAll("button");
    btns[2].click();
    expect(handler).not.toHaveBeenCalled();
  });

  it("destroy 後は mouseenter/mouseleave でも星の表示が変わらない", () => {
    const { el, destroy } = createRating({ value: 2, max: 5 });
    destroy();
    const btns = el.querySelectorAll("button");
    // hover しても表示変化なし（リスナー除去済み）
    btns[4].dispatchEvent(new MouseEvent("mouseenter"));
    const filled = [...btns].filter((b) => b.textContent === "★").length;
    expect(filled).toBe(2);
  });

  it("インタラクティブ時、コンテナが role=radiogroup を持つ", () => {
    const { el } = createRating({ max: 5 });
    expect(el.getAttribute("role")).toBe("radiogroup");
  });

  it("インタラクティブ時、各星ボタンが role=radio を持つ", () => {
    const { el } = createRating({ max: 3 });
    const btns = el.querySelectorAll("button");
    for (const btn of btns) {
      expect(btn.getAttribute("role")).toBe("radio");
    }
  });

  it("インタラクティブ時、選択中の星は aria-checked=true、それ以外は false", () => {
    const { el } = createRating({ value: 2, max: 3 });
    const btns = el.querySelectorAll("button");
    expect(btns[0].getAttribute("aria-checked")).toBe("false");
    expect(btns[1].getAttribute("aria-checked")).toBe("true");
    expect(btns[2].getAttribute("aria-checked")).toBe("false");
  });

  it("readOnly 時、コンテナが role=img を持つ", () => {
    const { el } = createRating({ value: 3, max: 5, readOnly: true });
    expect(el.getAttribute("role")).toBe("img");
    expect(el.getAttribute("aria-label")).toContain("3/5 stars");
  });

  it("disabled 時、コンテナが role=img を持つ", () => {
    const { el } = createRating({ value: 2, max: 5, disabled: true });
    expect(el.getAttribute("role")).toBe("img");
  });

  it("ArrowRight キーでフォーカスが次の星に移る", () => {
    const { el } = createRating({ max: 3 });
    document.body.appendChild(el);
    try {
      const btns = el.querySelectorAll("button") as NodeListOf<HTMLButtonElement>;
      btns[0].focus();
      el.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
      expect(document.activeElement).toBe(btns[1]);
    } finally {
      document.body.removeChild(el);
    }
  });

  it("ArrowLeft キーでフォーカスが前の星に移る", () => {
    const { el } = createRating({ max: 3 });
    document.body.appendChild(el);
    try {
      const btns = el.querySelectorAll("button") as NodeListOf<HTMLButtonElement>;
      btns[2].focus();
      el.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
      expect(document.activeElement).toBe(btns[1]);
    } finally {
      document.body.removeChild(el);
    }
  });
});

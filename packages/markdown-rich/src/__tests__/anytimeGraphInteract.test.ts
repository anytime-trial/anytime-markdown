/**
 * @jest-environment jsdom
 */
import { renderThinkingDiagramSvg, parseGraphDsl } from "@anytime-markdown/graph-core";
import { describeNode } from "../vanilla/anytimeGraphMutate";
import { attachAnytimeGraphInteractions } from "../vanilla/anytimeGraphInteract";

function setup(dsl: string): { previewEl: HTMLElement; setCode: jest.Mock; detach: () => void } {
  const previewEl = document.createElement("div");
  previewEl.innerHTML = renderThinkingDiagramSvg(dsl, true);
  document.body.appendChild(previewEl);
  let code = dsl;
  const setCode = jest.fn((d: string) => {
    code = d;
  });
  const detach = attachAnytimeGraphInteractions({
    previewEl,
    getCode: () => code,
    setCode,
    isDark: true,
    t: (k) => k,
  });
  return { previewEl, setCode, detach };
}

function clickNode(previewEl: HTMLElement, path: string): void {
  const gs = previewEl.querySelectorAll("svg [data-metadata]");
  for (const g of gs) {
    const meta = JSON.parse(g.getAttribute("data-metadata") ?? "{}");
    if (meta.path === path) {
      g.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      return;
    }
  }
  throw new Error(`node not found: ${path}`);
}

function popover(): HTMLElement {
  const pop = document.querySelector(".am-atm-pop");
  if (!pop) throw new Error("popover not open");
  return pop as HTMLElement;
}

function buttonByText(root: HTMLElement, text: string): HTMLButtonElement {
  const b = Array.from(root.querySelectorAll("button")).find((el) => el.textContent === text);
  if (!b) throw new Error(`button not found: ${text}`);
  return b as HTMLButtonElement;
}

afterEach(() => {
  document.body.innerHTML = "";
  document.querySelectorAll(".am-atm-pop").forEach((e) => e.remove());
});

describe("describeNode", () => {
  it("fishbone カテゴリは label と items を持つ", () => {
    const spec = parseGraphDsl("type: fishbone\nproblem: P\n- 人: a, b");
    const d = describeNode(spec, "categories.0");
    expect(d).toMatchObject({ label: "人", canRemove: true, canAddSibling: true, items: ["a", "b"] });
  });

  it("double-diamond フェーズは label なし items あり", () => {
    const spec = parseGraphDsl("type: double-diamond\ndiscover: x, y");
    const d = describeNode(spec, "discover");
    expect(d?.label).toBeNull();
    expect(d?.items).toEqual(["x", "y"]);
  });

  it("pyramid tier は desc を持つ", () => {
    const spec = parseGraphDsl("type: pyramid\n- 理念: 長期\n- 戦略");
    expect(describeNode(spec, "tiers.0")?.desc).toBe("長期");
    expect(describeNode(spec, "tiers.1")?.desc).toBe("");
  });

  it("mindmap root は addChild 可・remove 不可", () => {
    const spec = parseGraphDsl("type: mindmap\nroot: R\n- b0");
    expect(describeNode(spec, "root")).toMatchObject({ canAddChild: true, canRemove: false });
  });

  it("未知 path は null", () => {
    const spec = parseGraphDsl("type: fishbone\nproblem: P\n- 人: a");
    expect(describeNode(spec, "nope.9")).toBeNull();
  });
});

describe("attachAnytimeGraphInteractions", () => {
  it("ノードクリックでポップオーバーが開きラベル編集が DSL に反映される", () => {
    const { previewEl, setCode } = setup("type: fishbone\nproblem: 旧\n- 人: a");
    clickNode(previewEl, "problem");
    const pop = popover();
    const input = pop.querySelector("input") as HTMLInputElement;
    input.value = "新";
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(setCode).toHaveBeenCalledTimes(1);
    const next = parseGraphDsl(setCode.mock.calls[0][0]);
    expect(next.type === "fishbone" && next.problem).toBe("新");
  });

  it("削除ボタンでカテゴリが消える", () => {
    const { previewEl, setCode } = setup("type: fishbone\nproblem: P\n- 人: a\n- 機械: b");
    clickNode(previewEl, "categories.0");
    buttonByText(popover(), "anytimeGraphRemove").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    const next = parseGraphDsl(setCode.mock.calls[0][0]);
    expect(next.type === "fishbone" && next.categories.map((c) => c.label)).toEqual(["機械"]);
  });

  it("子を追加ボタンで mindmap にブランチが増える", () => {
    const { previewEl, setCode } = setup("type: mindmap\nroot: R\n- b0");
    clickNode(previewEl, "root");
    buttonByText(popover(), "+ anytimeGraphAddChild").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    const next = parseGraphDsl(setCode.mock.calls[0][0]);
    expect(next.type === "mindmap" && next.branches.length).toBe(2);
  });

  it("集約リーフ項目を追加できる（double-diamond）", () => {
    const { previewEl, setCode } = setup("type: double-diamond\ndiscover: x");
    clickNode(previewEl, "discover");
    buttonByText(popover(), "+ anytimeGraphAddItem").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    const next = parseGraphDsl(setCode.mock.calls[0][0]);
    expect(next.type === "double-diamond" && next.discover.length).toBe(2);
  });

  it("パース不能な DSL では操作層を装着しない", () => {
    const previewEl = document.createElement("div");
    previewEl.innerHTML = "<pre>error</pre>";
    document.body.appendChild(previewEl);
    const detach = attachAnytimeGraphInteractions({
      previewEl,
      getCode: () => "type: fishbone",
      setCode: jest.fn(),
      isDark: true,
      t: (k) => k,
    });
    expect(previewEl.classList.contains("am-atm-interactive")).toBe(false);
    detach();
  });

  it("detach でクラスとポップオーバーが除去される", () => {
    const { previewEl, detach } = setup("type: fishbone\nproblem: P\n- 人: a");
    clickNode(previewEl, "problem");
    expect(document.querySelector(".am-atm-pop")).not.toBeNull();
    detach();
    expect(document.querySelector(".am-atm-pop")).toBeNull();
    expect(previewEl.classList.contains("am-atm-interactive")).toBe(false);
  });

  it("Escape でポップオーバーが閉じる", () => {
    const { previewEl } = setup("type: fishbone\nproblem: P\n- 人: a");
    clickNode(previewEl, "problem");
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(document.querySelector(".am-atm-pop")).toBeNull();
  });
});

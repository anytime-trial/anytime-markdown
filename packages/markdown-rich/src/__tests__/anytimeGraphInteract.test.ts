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

function hoverNode(previewEl: HTMLElement, path: string): void {
  const gs = previewEl.querySelectorAll("svg [data-metadata]");
  for (const g of gs) {
    const meta = JSON.parse(g.getAttribute("data-metadata") ?? "{}");
    if (meta.path === path) {
      g.dispatchEvent(new MouseEvent("mouseenter"));
      return;
    }
  }
  throw new Error(`node not found: ${path}`);
}

function inlineEditor(): HTMLTextAreaElement {
  const ta = document.querySelector(".am-atm-inline");
  if (!ta) throw new Error("inline editor not open");
  return ta as HTMLTextAreaElement;
}

function moreButton(): HTMLButtonElement {
  const b = document.querySelector(".am-atm-more");
  if (!b) throw new Error("… button not shown");
  return b as HTMLButtonElement;
}

function popover(): HTMLElement {
  const pop = document.querySelector(".am-atm-pop");
  if (!pop) throw new Error("popover not open");
  return pop as HTMLElement;
}

/** hover で出る「…」ボタンを押して構造操作ポップオーバーを開く。 */
function openStructuralPopover(previewEl: HTMLElement, path: string): HTMLElement {
  hoverNode(previewEl, path);
  moreButton().dispatchEvent(new MouseEvent("click", { bubbles: true }));
  return popover();
}

function buttonByText(root: HTMLElement, text: string): HTMLButtonElement {
  const b = Array.from(root.querySelectorAll("button")).find((el) => el.textContent === text);
  if (!b) throw new Error(`button not found: ${text}`);
  return b as HTMLButtonElement;
}

afterEach(() => {
  document.body.innerHTML = "";
  document.querySelectorAll(".am-atm-pop, .am-atm-inline, .am-atm-more").forEach((e) => e.remove());
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

describe("attachAnytimeGraphInteractions: インライン編集", () => {
  it("ノードの文字クリックでインライン編集欄が開き、Enter でラベルが DSL に反映される", () => {
    const { previewEl, setCode } = setup("type: fishbone\nproblem: 旧\n- 人: a");
    clickNode(previewEl, "problem");
    const ta = inlineEditor();
    ta.value = "新";
    ta.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(setCode).toHaveBeenCalledTimes(1);
    const next = parseGraphDsl(setCode.mock.calls[0][0]);
    expect(next.type === "fishbone" && next.problem).toBe("新");
  });

  it("causal-loop の極性エッジをクリックしてインライン編集し、DSL に反映される", () => {
    const { previewEl, setCode } = setup("type: causal-loop\n在庫 -> 出荷: +");
    clickNode(previewEl, "links.0.polarity");
    const ta = inlineEditor();
    ta.value = "-";
    ta.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(setCode).toHaveBeenCalledTimes(1);
    const next = parseGraphDsl(setCode.mock.calls[0][0]);
    expect(next.type === "causal-loop" && next.links[0].polarity).toBe("-");
  });

  it("値が同じなら確定しても setCode を呼ばない", () => {
    const { previewEl, setCode } = setup("type: fishbone\nproblem: P\n- 人: a");
    clickNode(previewEl, "problem");
    inlineEditor().dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(setCode).not.toHaveBeenCalled();
  });

  it("ラベルに混入した改行は空白へ正規化して反映する（行ベース DSL を壊さない）", () => {
    const { previewEl, setCode } = setup("type: fishbone\nproblem: 旧\n- 人: a");
    clickNode(previewEl, "problem");
    const ta = inlineEditor();
    ta.value = "新\nしい";
    ta.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    const next = parseGraphDsl(setCode.mock.calls[0][0]);
    expect(next.type === "fishbone" && next.problem).toBe("新 しい");
  });

  it("Escape では反映せずインライン編集欄を閉じる", () => {
    const { previewEl, setCode } = setup("type: fishbone\nproblem: P\n- 人: a");
    clickNode(previewEl, "problem");
    const ta = inlineEditor();
    ta.value = "編集中";
    ta.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(setCode).not.toHaveBeenCalled();
    expect(document.querySelector(".am-atm-inline")).toBeNull();
  });

  it("double-diamond は複数行インライン編集（Ctrl+Enter）で項目を一括反映する", () => {
    const { previewEl, setCode } = setup("type: double-diamond\ndiscover: x");
    clickNode(previewEl, "discover");
    const ta = inlineEditor();
    expect(ta.classList.contains("am-atm-inline--list")).toBe(true);
    ta.value = "x\ny\n z ";
    ta.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", ctrlKey: true, bubbles: true }));
    const next = parseGraphDsl(setCode.mock.calls[0][0]);
    expect(next.type === "double-diamond" && next.discover).toEqual(["x", "y", "z"]);
  });
});

describe("attachAnytimeGraphInteractions: 構造操作（…ボタン → ポップオーバー）", () => {
  it("hover の「…」から削除でカテゴリが消える", () => {
    const { previewEl, setCode } = setup("type: fishbone\nproblem: P\n- 人: a\n- 機械: b");
    const pop = openStructuralPopover(previewEl, "categories.0");
    buttonByText(pop, "anytimeGraphRemove").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    const next = parseGraphDsl(setCode.mock.calls[0][0]);
    expect(next.type === "fishbone" && next.categories.map((c) => c.label)).toEqual(["機械"]);
  });

  it("hover の「…」から子を追加で mindmap にブランチが増える", () => {
    const { previewEl, setCode } = setup("type: mindmap\nroot: R\n- b0");
    const pop = openStructuralPopover(previewEl, "root");
    buttonByText(pop, "+ anytimeGraphAddChild").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    const next = parseGraphDsl(setCode.mock.calls[0][0]);
    expect(next.type === "mindmap" && next.branches.length).toBe(2);
  });

  it("fishbone の causes はポップオーバーから追加できる", () => {
    const { previewEl, setCode } = setup("type: fishbone\nproblem: P\n- 人: a");
    const pop = openStructuralPopover(previewEl, "categories.0");
    buttonByText(pop, "+ anytimeGraphAddItem").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    const next = parseGraphDsl(setCode.mock.calls[0][0]);
    expect(next.type === "fishbone" && next.categories[0].causes?.length).toBe(2);
  });

  it("double-diamond は構造操作を持たないため「…」を出さない", () => {
    const { previewEl } = setup("type: double-diamond\ndiscover: x");
    hoverNode(previewEl, "discover");
    expect(document.querySelector(".am-atm-more")).toBeNull();
  });

  it("Escape でポップオーバーが閉じる", () => {
    const { previewEl } = setup("type: fishbone\nproblem: P\n- 人: a\n- 機械: b");
    openStructuralPopover(previewEl, "categories.0");
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(document.querySelector(".am-atm-pop")).toBeNull();
  });
});

describe("attachAnytimeGraphInteractions: ライフサイクル", () => {
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

  it("detach でクラス・インライン編集欄・ポップオーバーが除去される", () => {
    const { previewEl, detach } = setup("type: fishbone\nproblem: P\n- 人: a");
    clickNode(previewEl, "problem");
    expect(document.querySelector(".am-atm-inline")).not.toBeNull();
    detach();
    expect(document.querySelector(".am-atm-inline")).toBeNull();
    expect(document.querySelector(".am-atm-pop")).toBeNull();
    expect(previewEl.classList.contains("am-atm-interactive")).toBe(false);
  });
});

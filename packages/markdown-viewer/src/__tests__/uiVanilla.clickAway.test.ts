/**
 * createClickAway（ui-vanilla/clickAway）の jsdom ユニットテスト。
 *
 * 検証観点: リスナ登録 / 外側・内側判定 / click・touchend イベント発火 / capture phase /
 * ownerDocument 上書き / destroy のクリーンアップ（listener 解除・冪等）。
 *
 * 振る舞いユーティリティのため要素生成・CSS 変数は扱わない（生成系の検証は対象外）。
 */

import { createClickAway } from "@anytime-markdown/graph-core/ui-vanilla/clickAway";

describe("createClickAway", () => {
  let node: HTMLDivElement;
  let inner: HTMLButtonElement;
  let outside: HTMLDivElement;

  beforeEach(() => {
    node = document.createElement("div");
    inner = document.createElement("button");
    node.appendChild(inner);
    outside = document.createElement("div");
    document.body.appendChild(node);
    document.body.appendChild(outside);
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("destroy 関数を返す", () => {
    const api = createClickAway({ node, onClickAway: () => {} });
    expect(typeof api.destroy).toBe("function");
    api.destroy();
  });

  it("基準ノードの外側を click すると onClickAway を呼ぶ", () => {
    const onClickAway = jest.fn();
    const { destroy } = createClickAway({ node, onClickAway });
    outside.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(onClickAway).toHaveBeenCalledTimes(1);
    destroy();
  });

  it("基準ノード自身を click しても onClickAway を呼ばない", () => {
    const onClickAway = jest.fn();
    const { destroy } = createClickAway({ node, onClickAway });
    node.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(onClickAway).not.toHaveBeenCalled();
    destroy();
  });

  it("基準ノードの子孫を click しても onClickAway を呼ばない", () => {
    const onClickAway = jest.fn();
    const { destroy } = createClickAway({ node, onClickAway });
    inner.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(onClickAway).not.toHaveBeenCalled();
    destroy();
  });

  it("外側の touchend でも onClickAway を呼ぶ", () => {
    const onClickAway = jest.fn();
    const { destroy } = createClickAway({ node, onClickAway });
    outside.dispatchEvent(new Event("touchend", { bubbles: true }));
    expect(onClickAway).toHaveBeenCalledTimes(1);
    destroy();
  });

  it("内側の touchend では onClickAway を呼ばない", () => {
    const onClickAway = jest.fn();
    const { destroy } = createClickAway({ node, onClickAway });
    inner.dispatchEvent(new Event("touchend", { bubbles: true }));
    expect(onClickAway).not.toHaveBeenCalled();
    destroy();
  });

  it("発火したイベントを引数として渡す", () => {
    const onClickAway = jest.fn();
    const { destroy } = createClickAway({ node, onClickAway });
    const evt = new MouseEvent("click", { bubbles: true });
    outside.dispatchEvent(evt);
    expect(onClickAway).toHaveBeenCalledWith(evt);
    destroy();
  });

  it("内側要素が stopPropagation しても capture phase で外側判定が機能する", () => {
    const onClickAway = jest.fn();
    // 内側の click は伝播停止するが、document capture では先に handler が走る。
    inner.addEventListener("click", (e) => e.stopPropagation());
    const { destroy } = createClickAway({ node, onClickAway });
    inner.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    // 内側なので呼ばれない（外側クリックを stopPropagation で取りこぼさないことも別途確認）。
    expect(onClickAway).not.toHaveBeenCalled();
    destroy();
  });

  it("外側要素が stopPropagation してても capture phase で onClickAway を呼ぶ", () => {
    const onClickAway = jest.fn();
    outside.addEventListener("click", (e) => e.stopPropagation());
    const { destroy } = createClickAway({ node, onClickAway });
    outside.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(onClickAway).toHaveBeenCalledTimes(1);
    destroy();
  });

  it("ownerDocument を上書きすると、その document にリスナを登録する", () => {
    const onClickAway = jest.fn();
    const ownerDocument = document;
    const addSpy = jest.spyOn(ownerDocument, "addEventListener");
    const { destroy } = createClickAway({ node, onClickAway, ownerDocument });
    const events = addSpy.mock.calls.map((c) => c[0]);
    expect(events).toContain("click");
    expect(events).toContain("touchend");
    addSpy.mockRestore();
    destroy();
  });

  it("destroy 後は外側 click で onClickAway を呼ばない", () => {
    const onClickAway = jest.fn();
    const { destroy } = createClickAway({ node, onClickAway });
    destroy();
    outside.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(onClickAway).not.toHaveBeenCalled();
  });

  it("destroy 後は外側 touchend でも onClickAway を呼ばない", () => {
    const onClickAway = jest.fn();
    const { destroy } = createClickAway({ node, onClickAway });
    destroy();
    outside.dispatchEvent(new Event("touchend", { bubbles: true }));
    expect(onClickAway).not.toHaveBeenCalled();
  });

  it("destroy は冪等（複数回呼んでも removeEventListener を二重実行しない）", () => {
    const onClickAway = jest.fn();
    const removeSpy = jest.spyOn(document, "removeEventListener");
    const { destroy } = createClickAway({ node, onClickAway });
    destroy();
    const afterFirst = removeSpy.mock.calls.length;
    destroy();
    expect(removeSpy.mock.calls.length).toBe(afterFirst);
    removeSpy.mockRestore();
  });

  it("click と touchend の 2 種類のリスナを登録する", () => {
    const onClickAway = jest.fn();
    const addSpy = jest.spyOn(document, "addEventListener");
    const { destroy } = createClickAway({ node, onClickAway });
    const events = addSpy.mock.calls.map((c) => c[0]);
    expect(events).toContain("click");
    expect(events).toContain("touchend");
    addSpy.mockRestore();
    destroy();
  });
});

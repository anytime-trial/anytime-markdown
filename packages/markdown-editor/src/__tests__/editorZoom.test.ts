/**
 * installEditorZoom の単体テスト。
 *
 * ズームは installChrome のクロージャに埋まっていて単体では呼べなかった。切り出しに
 * よって境界値・抑止条件を直接検証できるようになったため、その分をここで押さえる。
 *
 * 実 `Editor` を使わないのは、このモジュールが editor の状態（transaction / plugin）に
 * 触れず `editor.view.dom.style` だけを見る DOM イベント処理だからである
 * （`vanilla-ui-conventions` §5 が実 Editor を求めるのは状態・イベントルーティングに
 * 依存するロジック）。
 */

import type { Editor } from "@anytime-markdown/markdown-core";

import { installEditorZoom } from "../host/chrome/editorZoom";

interface Harness {
  root: HTMLElement;
  contentEl: HTMLElement;
  editorDom: HTMLElement;
  setZoom: jest.Mock<void, [number]>;
  mergeOpen: { value: boolean };
  dispose: () => void;
}

function setup(): Harness {
  const root = document.createElement("div");
  const contentEl = document.createElement("div");
  const editorDom = document.createElement("div");
  root.append(contentEl);
  document.body.append(root);

  const setZoom = jest.fn<void, [number]>();
  const mergeOpen = { value: false };
  const editor = { view: { dom: editorDom } } as unknown as Editor;

  const dispose = installEditorZoom({
    root,
    contentEl,
    editor,
    sourceZoomTarget: () => ({ setZoom }),
    isMergeOpen: () => mergeOpen.value,
  });

  return { root, contentEl, editorDom, setZoom, mergeOpen, dispose };
}

function wheel(contentEl: HTMLElement, deltaY: number, init: WheelEventInit = {}): WheelEvent {
  const event = new WheelEvent("wheel", { deltaY, cancelable: true, ...init });
  contentEl.dispatchEvent(event);
  return event;
}

describe("installEditorZoom", () => {
  let h: Harness;

  beforeEach(() => { h = setup(); });
  afterEach(() => { h.dispose(); h.root.remove(); });

  it("applies the initial factor to the root dataset without touching the editor style", () => {
    expect(h.root.dataset.amZoom).toBe("1");
    expect(h.editorDom.style.zoom).toBe("");
    expect(h.setZoom).toHaveBeenCalledWith(1);
  });

  it("zooms in on ctrl + wheel up and reflects the factor everywhere", () => {
    const event = wheel(h.contentEl, -1, { ctrlKey: true });

    expect(event.defaultPrevented).toBe(true);
    expect(h.root.dataset.amZoom).toBe("1.1");
    expect(h.editorDom.style.zoom).toBe("1.1");
    expect(h.setZoom).toHaveBeenLastCalledWith(1.1);
  });

  it("ignores a wheel without ctrl/meta so normal scrolling still works", () => {
    const event = wheel(h.contentEl, -1);

    expect(event.defaultPrevented).toBe(false);
    expect(h.root.dataset.amZoom).toBe("1");
  });

  it("ignores a horizontal wheel (deltaY === 0) instead of zooming out", () => {
    wheel(h.contentEl, 0, { ctrlKey: true });

    expect(h.root.dataset.amZoom).toBe("1");
  });

  it("does not zoom while the merge view is open", () => {
    h.mergeOpen.value = true;
    const event = wheel(h.contentEl, -1, { ctrlKey: true });

    expect(event.defaultPrevented).toBe(false);
    expect(h.root.dataset.amZoom).toBe("1");
  });

  it("clamps to the bounds and avoids floating point drift", () => {
    for (let i = 0; i < 40; i++) wheel(h.contentEl, -1, { ctrlKey: true });
    expect(h.root.dataset.amZoom).toBe("3");

    for (let i = 0; i < 60; i++) wheel(h.contentEl, 1, { ctrlKey: true });
    expect(h.root.dataset.amZoom).toBe("0.5");
  });

  it("resets the editor style to empty when returning to 1x", () => {
    wheel(h.contentEl, -1, { ctrlKey: true });
    wheel(h.contentEl, 1, { ctrlKey: true });

    expect(h.root.dataset.amZoom).toBe("1");
    expect(h.editorDom.style.zoom).toBe("");
  });

  it("stops responding after dispose", () => {
    h.dispose();
    wheel(h.contentEl, -1, { ctrlKey: true });

    expect(h.root.dataset.amZoom).toBe("1");
  });
});

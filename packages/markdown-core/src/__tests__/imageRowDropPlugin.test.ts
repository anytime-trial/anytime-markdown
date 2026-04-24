import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { EditorView } from "@tiptap/pm/view";

import { applyDropAction, computeDropTarget } from "../plugins/imageRowDropPlugin";
import { createTestEditor } from "../testUtils/createTestEditor";
import { applyMarkdownToEditor } from "../utils/editorContentLoader";

function makeMockView(
  imageBlock: { left: number; width: number; top: number; height: number } | null,
  coords: { pos: number } | null,
): EditorView {
  const el = imageBlock
    ? (() => {
        const div = document.createElement("div");
        div.setAttribute("data-image-block", "");
        Object.defineProperty(div, "getBoundingClientRect", {
          value: () => ({
            left: imageBlock.left,
            width: imageBlock.width,
            right: imageBlock.left + imageBlock.width,
            top: imageBlock.top,
            height: imageBlock.height,
            bottom: imageBlock.top + imageBlock.height,
            x: imageBlock.left,
            y: imageBlock.top,
            toJSON: () => ({}),
          }),
        });
        return div;
      })()
    : null;
  return {
    posAtCoords: () => coords,
    domAtPos: () => ({ node: el as unknown as Node, offset: 0 }),
  } as unknown as EditorView;
}

describe("computeDropTarget", () => {
  test("drop on left 15% of image block returns wrap-left", () => {
    const view = makeMockView({ left: 100, width: 200, top: 0, height: 100 }, { pos: 10 });
    const decision = computeDropTarget({ view, clientX: 130, clientY: 50 }); // 15% in
    expect(decision.action).toBe("wrap-left");
  });

  test("drop on right 85% of image block returns wrap-right", () => {
    const view = makeMockView({ left: 100, width: 200, top: 0, height: 100 }, { pos: 10 });
    const decision = computeDropTarget({ view, clientX: 270, clientY: 50 }); // 85% in
    expect(decision.action).toBe("wrap-right");
  });

  test("drop on center 50% returns default", () => {
    const view = makeMockView({ left: 100, width: 200, top: 0, height: 100 }, { pos: 10 });
    const decision = computeDropTarget({ view, clientX: 200, clientY: 50 }); // 50% in
    expect(decision.action).toBe("default");
  });

  test("drop off any image block returns default", () => {
    const view = makeMockView(null, { pos: 10 });
    const decision = computeDropTarget({ view, clientX: 10, clientY: 10 });
    expect(decision.action).toBe("default");
  });

  test("drop with no coords returns default", () => {
    const view = makeMockView({ left: 100, width: 200, top: 0, height: 100 }, null);
    const decision = computeDropTarget({ view, clientX: 130, clientY: 50 });
    expect(decision.action).toBe("default");
  });
});

function findImagePos(doc: ProseMirrorNode, src: string): { node: ProseMirrorNode; pos: number } | null {
  let found: { node: ProseMirrorNode; pos: number } | null = null;
  doc.descendants((node, pos) => {
    if (found) return false;
    if (node.type.name === "image" && node.attrs.src === src) {
      found = { node, pos };
    }
  });
  return found;
}

describe("applyDropAction wrap/insert transactions", () => {
  test("wrap-left: creates imageRow[source, target] from 2 standalone images", () => {
    const editor = createTestEditor({ withMarkdown: true });
    applyMarkdownToEditor(editor, "![a](a.png)\n\n![b](b.png)\n");
    const a = findImagePos(editor.state.doc, "a.png")!;
    const b = findImagePos(editor.state.doc, "b.png")!;
    applyDropAction(editor.view, a, {
      action: "wrap-left",
      targetPos: b.pos,
      targetElement: document.createElement("div"),
    });
    const json = editor.getJSON();
    const jsonStr = JSON.stringify(json);
    expect(jsonStr).toContain('"type":"imageRow"');
    // Find the imageRow and check children order
    const findRow = (node: Record<string, unknown>): Record<string, unknown> | null => {
      if (node.type === "imageRow") return node;
      const content = (node.content ?? []) as Record<string, unknown>[];
      for (const child of content) {
        const result = findRow(child);
        if (result) return result;
      }
      return null;
    };
    const row = findRow(json as Record<string, unknown>);
    expect(row).not.toBeNull();
    const children = (row?.content ?? []) as Array<{ attrs: { src: string } }>;
    expect(children.map((c) => c.attrs.src)).toEqual(["a.png", "b.png"]);
  });

  test("wrap-right: creates imageRow[target, source]", () => {
    const editor = createTestEditor({ withMarkdown: true });
    applyMarkdownToEditor(editor, "![a](a.png)\n\n![b](b.png)\n");
    const a = findImagePos(editor.state.doc, "a.png")!;
    const b = findImagePos(editor.state.doc, "b.png")!;
    applyDropAction(editor.view, a, {
      action: "wrap-right",
      targetPos: b.pos,
      targetElement: document.createElement("div"),
    });
    const json = editor.getJSON();
    const findRow = (node: Record<string, unknown>): Record<string, unknown> | null => {
      if (node.type === "imageRow") return node;
      const content = (node.content ?? []) as Record<string, unknown>[];
      for (const child of content) {
        const result = findRow(child);
        if (result) return result;
      }
      return null;
    };
    const row = findRow(json as Record<string, unknown>);
    expect(row).not.toBeNull();
    const children = (row?.content ?? []) as Array<{ attrs: { src: string } }>;
    expect(children.map((c) => c.attrs.src)).toEqual(["b.png", "a.png"]);
  });

  test("default action: no changes", () => {
    const editor = createTestEditor({ withMarkdown: true });
    applyMarkdownToEditor(editor, "![a](a.png)\n\n![b](b.png)\n");
    const a = findImagePos(editor.state.doc, "a.png")!;
    const result = applyDropAction(editor.view, a, { action: "default" });
    expect(result).toBe(false);
    const json = JSON.stringify(editor.getJSON());
    expect(json).not.toContain('"type":"imageRow"');
  });
});

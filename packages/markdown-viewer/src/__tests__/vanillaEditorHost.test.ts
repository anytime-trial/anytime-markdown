/**
 * vanillaEditorHost.ts — G（vanilla host）seam のテスト。
 * React なしで editor を要素へ mount し、chrome を装着・破棄できることを検証する。
 */
import { Editor } from "@anytime-markdown/markdown-core";
import StarterKit from "@anytime-markdown/markdown-starter-kit";

import { createVanillaEditorHost } from "../host/vanillaEditorHost";

describe("createVanillaEditorHost", () => {
  it("要素へ editor を mount し、content を描画する（React 非依存）", () => {
    const element = document.createElement("div");
    document.body.appendChild(element);
    const host = createVanillaEditorHost({
      element,
      extensions: [StarterKit],
      content: "<p>hello</p>",
    });

    expect(host.editor).toBeInstanceOf(Editor);
    // ProseMirror が element 内へ描画する。
    expect(element.querySelector(".ProseMirror")).toBeTruthy();
    expect(element.textContent).toContain("hello");

    host.destroy();
    expect(host.editor.isDestroyed).toBe(true);
    element.remove();
  });

  it("installChrome を editor 付きで呼び、destroy で破棄関数を実行する", () => {
    const element = document.createElement("div");
    const disposed: string[] = [];
    let receivedEditor: Editor | null = null;
    const host = createVanillaEditorHost({
      element,
      extensions: [StarterKit],
      installChrome: (editor) => {
        receivedEditor = editor;
        return [() => disposed.push("a"), () => disposed.push("b")];
      },
    });

    expect(receivedEditor).toBe(host.editor);
    expect(disposed).toEqual([]);

    host.destroy();
    expect(disposed).toEqual(["a", "b"]);
    expect(host.editor.isDestroyed).toBe(true);
  });

  it("chrome 破棄が throw しても editor は破棄される", () => {
    const element = document.createElement("div");
    const errSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    const host = createVanillaEditorHost({
      element,
      extensions: [StarterKit],
      installChrome: () => [
        () => { throw new Error("boom"); },
      ],
    });

    expect(() => host.destroy()).not.toThrow();
    expect(host.editor.isDestroyed).toBe(true);
    errSpy.mockRestore();
  });
});

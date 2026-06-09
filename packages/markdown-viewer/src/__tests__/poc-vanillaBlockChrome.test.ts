/**
 * framework-decoupling Phase 3 PoC（D）テスト。
 *
 * (1) `new Editor()`（core Editor）が React なしで生成・操作できること、
 * (2) chrome seam（選択追従 tracker / 配置 anchor / chrome shell）が
 *     `editor.on('transaction')` 購読のみで React なしに機能すること
 * を real editor で実証する。
 */
import { Editor } from "@anytime-markdown/markdown-core";
import StarterKit from "@anytime-markdown/markdown-starter-kit";

import {
  createBlockChromeAnchor,
  createSelectedBlockTracker,
  createVanillaBlockChrome,
  type SelectedBlockSnapshot,
  selectedBlockPos,
} from "../poc/vanillaBlockChrome";

function makeEditor(): Editor {
  return new Editor({
    extensions: [StarterKit],
    content: "<p>hi</p><pre><code>abc</code></pre>",
  });
}

function findCodeBlockPos(editor: Editor): number {
  let found = -1;
  editor.state.doc.descendants((node, pos) => {
    if (found < 0 && node.type.name === "codeBlock") found = pos;
  });
  return found;
}

describe("PoC: vanilla editor 生成（React 非依存）", () => {
  it("new Editor() で生成・操作できコードブロックを含む", () => {
    const editor = makeEditor();
    expect(editor).toBeInstanceOf(Editor);
    expect(findCodeBlockPos(editor)).toBeGreaterThanOrEqual(0);
    editor.destroy();
  });
});

describe("selectedBlockPos", () => {
  it("選択が codeBlock 内なら pos、外なら -1", () => {
    const editor = makeEditor();
    const cbPos = findCodeBlockPos(editor);
    editor.commands.setTextSelection(cbPos + 1);
    expect(selectedBlockPos(editor, "codeBlock")).toBe(cbPos);
    editor.commands.setTextSelection(1); // paragraph 内
    expect(selectedBlockPos(editor, "codeBlock")).toBe(-1);
    editor.destroy();
  });
});

describe("createSelectedBlockTracker", () => {
  it("選択変化で snapshot を通知し、解除後は通知しない", () => {
    const editor = makeEditor();
    const cbPos = findCodeBlockPos(editor);
    const snaps: SelectedBlockSnapshot[] = [];
    const stop = createSelectedBlockTracker(editor, "codeBlock", (s) => snaps.push(s));

    editor.commands.setTextSelection(cbPos + 1); // codeBlock へ
    editor.commands.setTextSelection(1); // 外へ
    const countBeforeStop = snaps.length;
    expect(snaps.some((s) => s.pos === cbPos)).toBe(true);
    expect(snaps.at(-1)?.pos).toBe(-1);

    stop();
    editor.commands.setTextSelection(cbPos + 1);
    expect(snaps.length).toBe(countBeforeStop); // 解除後は増えない
    editor.destroy();
  });
});

describe("createBlockChromeAnchor", () => {
  it("rect 追従・null で非表示・destroy で除去", () => {
    const anchor = createBlockChromeAnchor();
    expect(document.body.contains(anchor.el)).toBe(true);
    anchor.setRect({ top: 10, left: 20 } as DOMRect);
    expect(anchor.el.style.display).toBe("");
    expect(anchor.el.style.top).toBe("10px");
    expect(anchor.el.style.left).toBe("20px");
    anchor.setRect(null);
    expect(anchor.el.style.display).toBe("none");
    anchor.destroy();
    expect(document.body.contains(anchor.el)).toBe(false);
  });
});

describe("createVanillaBlockChrome", () => {
  it("選択中ブロックの edit/delete を pos 付きで発火する（React なし）", () => {
    const editor = makeEditor();
    const cbPos = findCodeBlockPos(editor);
    const edits: number[] = [];
    const deletes: number[] = [];
    const destroy = createVanillaBlockChrome(editor, "codeBlock", {
      label: "Code",
      onEdit: (p) => edits.push(p),
      onDelete: (p) => deletes.push(p),
    });

    editor.commands.setTextSelection(cbPos + 1);
    const toolbar = document.querySelector("[data-vanilla-toolbar]") as HTMLElement;
    const [editBtn, delBtn] = Array.from(toolbar.querySelectorAll("button")) as HTMLButtonElement[];
    editBtn.click();
    delBtn.click();
    expect(edits).toEqual([cbPos]);
    expect(deletes).toEqual([cbPos]);

    destroy();
    expect(document.querySelector("[data-vanilla-toolbar]")).toBeNull();
    editor.destroy();
  });
});

import { Editor, Extension } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { Fragment } from "@tiptap/pm/model";
import { TextSelection } from "@tiptap/pm/state";

/** ショートカットロジックのみを含むテスト用拡張 */
const ShortcutExtension = Extension.create({
  name: "testShortcuts",
  addKeyboardShortcuts() {
    return {
      "Tab": ({ editor }) => {
        const { $from } = editor.state.selection;
        const node = $from.parent;
        if (node.type.name !== "heading") return false;
        const level = node.attrs.level as number;
        if (level >= 5) return true;
        return editor.chain().focus().setHeading({ level: (level + 1) as 1|2|3|4|5 }).run();
      },
      "Shift-Tab": ({ editor }) => {
        const { $from } = editor.state.selection;
        const node = $from.parent;
        if (node.type.name !== "heading") return false;
        const level = node.attrs.level as number;
        if (level <= 1) return true;
        return editor.chain().focus().setHeading({ level: (level - 1) as 1|2|3|4|5 }).run();
      },
    };
  },
});

function createEditor(content: string): Editor {
  return new Editor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3, 4, 5] } }),
      ShortcutExtension,
    ],
    content,
  });
}

function findTextPos(editor: Editor, text: string): number {
  let pos = -1;
  editor.state.doc.descendants((node, p) => {
    if (pos !== -1) return false;
    if (node.isText && node.text?.includes(text)) { pos = p; return false; }
  });
  return pos;
}

function getBlockTexts(editor: Editor): string[] {
  const texts: string[] = [];
  editor.state.doc.forEach((node) => texts.push(node.textContent));
  return texts;
}

describe("見出しレベル変更", () => {
  test("H2 → H3（Tab でレベルを下げる）", () => {
    const editor = createEditor("<h2>見出し</h2>");
    const pos = findTextPos(editor, "見出し");
    editor.chain().setTextSelection(pos + 1).run();
    expect(editor.state.selection.$from.parent.attrs.level).toBe(2);
    editor.chain().setHeading({ level: 3 }).run();
    expect(editor.state.selection.$from.parent.attrs.level).toBe(3);
    editor.destroy();
  });

  test("H5 では Tab でレベルを下げられない", () => {
    const editor = createEditor("<h5>見出し</h5>");
    const pos = findTextPos(editor, "見出し");
    editor.chain().setTextSelection(pos + 1).run();
    expect(editor.state.selection.$from.parent.attrs.level).toBe(5);
    editor.destroy();
  });

  test("H3 → H2（Shift+Tab でレベルを上げる）", () => {
    const editor = createEditor("<h3>見出し</h3>");
    const pos = findTextPos(editor, "見出し");
    editor.chain().setTextSelection(pos + 1).run();
    editor.chain().setHeading({ level: 2 }).run();
    expect(editor.state.selection.$from.parent.attrs.level).toBe(2);
    editor.destroy();
  });

  test("H1 では Shift+Tab でレベルを上げられない", () => {
    const editor = createEditor("<h1>見出し</h1>");
    const pos = findTextPos(editor, "見出し");
    editor.chain().setTextSelection(pos + 1).run();
    expect(editor.state.selection.$from.parent.attrs.level).toBe(1);
    editor.destroy();
  });
});

describe("ブロック移動", () => {
  test("Alt+Down: ブロックを下に移動", () => {
    const editor = createEditor("<p>first</p><p>second</p><p>third</p>");
    const pos = findTextPos(editor, "second");
    editor.chain().setTextSelection(pos + 1).run();

    const { $from } = editor.state.selection;
    const curStart = $from.before(1);
    const curNode = $from.node(1);
    const curEnd = curStart + curNode.nodeSize;
    const $next = editor.state.doc.resolve(curEnd + 1);
    const nextNode = $next.node(1);
    const nextEnd = curEnd + nextNode.nodeSize;
    const { tr } = editor.state;
    tr.replaceWith(curStart, nextEnd, Fragment.from([nextNode, curNode]));
    editor.view.dispatch(tr);

    expect(getBlockTexts(editor)).toEqual(["first", "third", "second"]);
    editor.destroy();
  });

  test("Alt+Up: ブロックを上に移動", () => {
    const editor = createEditor("<p>first</p><p>second</p><p>third</p>");
    const pos = findTextPos(editor, "second");
    editor.chain().setTextSelection(pos + 1).run();

    const { $from } = editor.state.selection;
    const curStart = $from.before(1);
    const curNode = $from.node(1);
    const $prev = editor.state.doc.resolve(curStart - 1);
    const prevStart = $prev.before(1);
    const prevNode = $prev.node(1);
    const { tr } = editor.state;
    tr.replaceWith(prevStart, curStart + curNode.nodeSize, Fragment.from([curNode, prevNode]));
    editor.view.dispatch(tr);

    expect(getBlockTexts(editor)).toEqual(["second", "first", "third"]);
    editor.destroy();
  });
});

describe("ブロック複製", () => {
  test("Shift+Alt+Down: ブロックを下に複製", () => {
    const editor = createEditor("<p>first</p><p>second</p>");
    const pos = findTextPos(editor, "first");
    editor.chain().setTextSelection(pos + 1).run();

    const { $from } = editor.state.selection;
    const nodePos = $from.before(1);
    const node = $from.node(1);
    const afterPos = nodePos + node.nodeSize;
    const { tr } = editor.state;
    tr.insert(afterPos, node.copy(node.content));
    editor.view.dispatch(tr);

    expect(getBlockTexts(editor)).toEqual(["first", "first", "second"]);
    editor.destroy();
  });

  test("Shift+Alt+Up: ブロックを上に複製", () => {
    const editor = createEditor("<p>first</p><p>second</p>");
    const pos = findTextPos(editor, "second");
    editor.chain().setTextSelection(pos + 1).run();

    const { $from } = editor.state.selection;
    const nodePos = $from.before(1);
    const node = $from.node(1);
    const { tr } = editor.state;
    tr.insert(nodePos, node.copy(node.content));
    editor.view.dispatch(tr);

    expect(getBlockTexts(editor)).toEqual(["first", "second", "second"]);
    editor.destroy();
  });
});

describe("空行挿入", () => {
  test("Mod+Enter: 下に空行を挿入", () => {
    const editor = createEditor("<p>hello</p><p>world</p>");
    const pos = findTextPos(editor, "hello");
    editor.chain().setTextSelection(pos + 1).run();

    const { $from } = editor.state.selection;
    const endOfBlock = $from.end(1);
    const { tr } = editor.state;
    tr.insert(endOfBlock + 1, editor.state.schema.nodes.paragraph.create());
    editor.view.dispatch(tr);

    expect(getBlockTexts(editor)).toEqual(["hello", "", "world"]);
    editor.destroy();
  });

  test("Mod+Shift+Enter: 上に空行を挿入", () => {
    const editor = createEditor("<p>hello</p><p>world</p>");
    const pos = findTextPos(editor, "world");
    editor.chain().setTextSelection(pos + 1).run();

    const { $from } = editor.state.selection;
    const startOfBlock = $from.before(1);
    const { tr } = editor.state;
    tr.insert(startOfBlock, editor.state.schema.nodes.paragraph.create());
    editor.view.dispatch(tr);

    expect(getBlockTexts(editor)).toEqual(["hello", "", "world"]);
    editor.destroy();
  });
});

describe("行選択（Mod+L）", () => {
  test("カーソル位置のブロック全体を選択", () => {
    const editor = createEditor("<p>first</p><p>second</p>");
    const pos = findTextPos(editor, "second");
    editor.chain().setTextSelection(pos + 1).run();

    const { $from } = editor.state.selection;
    const start = $from.before(1);
    const node = $from.node(1);
    const end = start + node.nodeSize;
    const { tr } = editor.state;
    tr.setSelection(TextSelection.create(tr.doc, start, end));
    editor.view.dispatch(tr);

    const { from, to } = editor.state.selection;
    expect(editor.state.doc.textBetween(from, to, "\n")).toBe("second");
    editor.destroy();
  });
});

describe("単語選択（Mod+D）", () => {
  test("カーソル位置の英単語を選択", () => {
    const editor = createEditor("<p>hello world test</p>");
    const pos = findTextPos(editor, "hello world test");
    // "world" の中（offset=7: "hello w|orld"）
    editor.chain().setTextSelection(pos + 7).run();

    const { $from } = editor.state.selection;
    const text = $from.parent.textContent;
    const offset = $from.parentOffset;
    const wordRe = /[\w]+/g;
    let match: RegExpExecArray | null;
    let found = "";
    while ((match = wordRe.exec(text)) !== null) {
      if (match.index <= offset && match.index + match[0].length >= offset) {
        found = match[0];
        break;
      }
    }
    expect(found).toBe("world");
    editor.destroy();
  });

  test("日本語の単語を選択", () => {
    const editor = createEditor("<p>テスト文字列です</p>");
    const pos = findTextPos(editor, "テスト文字列です");
    editor.chain().setTextSelection(pos + 3).run();

    const { $from } = editor.state.selection;
    const text = $from.parent.textContent;
    const offset = $from.parentOffset;
    const wordRe = /[\w\u3000-\u9FFF\uF900-\uFAFF]+/g;
    let match: RegExpExecArray | null;
    let found = "";
    while ((match = wordRe.exec(text)) !== null) {
      if (match.index <= offset && match.index + match[0].length >= offset) {
        found = match[0];
        break;
      }
    }
    expect(found).toBe("テスト文字列です");
    editor.destroy();
  });
});

describe("行削除（Mod+Shift+K）", () => {
  test("カーソル位置のブロックを削除", () => {
    const editor = createEditor("<p>first</p><p>second</p><p>third</p>");
    const pos = findTextPos(editor, "second");
    editor.chain().setTextSelection(pos + 1).run();

    const { $from } = editor.state.selection;
    const start = $from.before(1);
    const node = $from.node(1);
    const end = start + node.nodeSize;
    const { tr } = editor.state;
    tr.delete(start, end);
    editor.view.dispatch(tr);

    expect(getBlockTexts(editor)).toEqual(["first", "third"]);
    editor.destroy();
  });
});

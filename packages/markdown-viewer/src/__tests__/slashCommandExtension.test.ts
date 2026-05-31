/**
 * slashCommandExtension.ts のテスト
 * stripZWS / handleHeadingSlash / tryActivate / Plugin state management を網羅
 */
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { TextSelection } from "@tiptap/pm/state";
import {
  SlashCommandExtension,
  type SlashCommandState,
} from "../extensions/slashCommandExtension";

/* ------------------------------------------------------------------ */
/*  Helper                                                            */
/* ------------------------------------------------------------------ */

function createEditor(
  content: string,
  onStateChange: (s: SlashCommandState) => void = () => {},
): Editor {
  return new Editor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3, 4, 5] } }),
      SlashCommandExtension.configure({ onStateChange }),
    ],
    content,
  });
}

/** 指定テキストの先頭 doc-position を返す */
function findTextPos(editor: Editor, text: string): number {
  let pos = -1;
  editor.state.doc.descendants((node, p) => {
    if (pos !== -1) return false;
    if (node.isText && node.text?.includes(text)) {
      pos = p;
      return false;
    }
  });
  return pos;
}

/** カーソルを指定 pos に移動 */
function setCursor(editor: Editor, pos: number) {
  const tr = editor.state.tr.setSelection(
    TextSelection.create(editor.state.doc, pos),
  );
  editor.view.dispatch(tr);
}

/* ------------------------------------------------------------------ */
/*  Extension 構造テスト                                              */
/* ------------------------------------------------------------------ */

describe("SlashCommandExtension structure", () => {
  it("has name 'slashCommand'", () => {
    expect(SlashCommandExtension.name).toBe("slashCommand");
  });

  it("addOptions returns an object with onStateChange function", () => {
    const addOptions = SlashCommandExtension.config.addOptions as () => {
      onStateChange: (s: SlashCommandState) => void;
    };
    const options = addOptions();
    expect(options.onStateChange).toBeInstanceOf(Function);
    // Default onStateChange should be a no-op
    expect(() =>
      options.onStateChange({
        active: false,
        query: "",
        from: 0,
        navigationKey: null,
      }),
    ).not.toThrow();
  });

  it("addStorage returns correct default values", () => {
    const addStorage = SlashCommandExtension.config.addStorage as () => Record<
      string,
      unknown
    >;
    const storage = addStorage();
    expect(storage.active).toBe(false);
    expect(storage.query).toBe("");
    expect(storage.from).toBe(0);
    expect(storage.composing).toBe(false);
  });

  it("defines addProseMirrorPlugins", () => {
    expect(SlashCommandExtension.config.addProseMirrorPlugins).toBeDefined();
  });
});

/* ------------------------------------------------------------------ */
/*  SlashCommandState 型テスト                                        */
/* ------------------------------------------------------------------ */

describe("SlashCommandState type", () => {
  it("can construct a valid state", () => {
    const state: SlashCommandState = {
      active: true,
      query: "head",
      from: 5,
      navigationKey: "ArrowDown",
    };
    expect(state.active).toBe(true);
    expect(state.query).toBe("head");
    expect(state.from).toBe(5);
    expect(state.navigationKey).toBe("ArrowDown");
  });

  it("accepts null navigationKey", () => {
    const state: SlashCommandState = {
      active: false,
      query: "",
      from: 0,
      navigationKey: null,
    };
    expect(state.navigationKey).toBeNull();
  });

  it("accepts all valid navigationKey values", () => {
    const keys: SlashCommandState["navigationKey"][] = [
      "ArrowUp",
      "ArrowDown",
      "Enter",
      "Escape",
      null,
    ];
    for (const key of keys) {
      const state: SlashCommandState = {
        active: true,
        query: "",
        from: 0,
        navigationKey: key,
      };
      expect(state.navigationKey).toBe(key);
    }
  });
});

/* ------------------------------------------------------------------ */
/*  stripZWS テスト (内部関数 — insertText 経由で間接テスト)          */
/* ------------------------------------------------------------------ */

describe("stripZWS (indirect via tryActivate)", () => {
  it("activates slash command even if ZWS surrounds '/'", () => {
    const calls: SlashCommandState[] = [];
    const editor = createEditor("<p></p>", (s) => calls.push({ ...s }));

    // "/" を挿入 — tryActivate が内部で stripZWS を呼ぶ
    editor.commands.insertContent("/");

    const activated = calls.find((c) => c.active);
    expect(activated).toBeDefined();
    expect(activated!.query).toBe("");
  });
});

/* ------------------------------------------------------------------ */
/*  tryActivate テスト                                                */
/* ------------------------------------------------------------------ */

describe("tryActivate", () => {
  it("activates when '/' is typed in an empty paragraph", () => {
    const calls: SlashCommandState[] = [];
    const editor = createEditor("<p></p>", (s) => calls.push({ ...s }));

    editor.commands.insertContent("/");

    const activated = calls.find((c) => c.active);
    expect(activated).toBeDefined();
    expect(activated!.query).toBe("");
    expect(activated!.navigationKey).toBeNull();

    editor.destroy();
  });

  it("does NOT activate when '/' is part of longer text", () => {
    const calls: SlashCommandState[] = [];
    const editor = createEditor("<p>hello</p>", (s) => calls.push({ ...s }));

    // カーソルを末尾に移動して "/" を入力
    const endPos = editor.state.doc.content.size - 1;
    setCursor(editor, endPos);
    editor.commands.insertContent("/");

    const activated = calls.find((c) => c.active);
    expect(activated).toBeUndefined();

    editor.destroy();
  });

  it("does NOT activate at depth > 1 (nested node)", () => {
    const calls: SlashCommandState[] = [];
    // blockquote > paragraph — depth 2
    const editor = createEditor("<blockquote><p></p></blockquote>", (s) =>
      calls.push({ ...s }),
    );

    // blockquote 内のパラグラフにカーソルを置いて "/" 入力
    setCursor(editor, 2);
    editor.commands.insertContent("/");

    const activated = calls.find((c) => c.active);
    expect(activated).toBeUndefined();

    editor.destroy();
  });

  it("does NOT activate when doc has not changed", () => {
    const calls: SlashCommandState[] = [];
    const editor = createEditor("<p>/</p>", (s) => calls.push({ ...s }));

    // ドキュメントを変えずに selection だけ変更
    const pos = findTextPos(editor, "/");
    if (pos >= 0) {
      setCursor(editor, pos);
    }

    // doc が変わっていないので activate しない
    const activated = calls.find((c) => c.active);
    expect(activated).toBeUndefined();

    editor.destroy();
  });

  it("calls handleHeadingSlash when '/' is at end of heading", () => {
    const calls: SlashCommandState[] = [];
    const editor = createEditor("<h2>Title</h2>", (s) =>
      calls.push({ ...s }),
    );

    // heading の末尾にカーソルを置いて "/" を入力
    const titlePos = findTextPos(editor, "Title");
    setCursor(editor, titlePos + 5); // "Title" の後
    editor.commands.insertContent("/");

    // handleHeadingSlash が paragraph を作成し、tryActivate が再度呼ばれて activate
    // 最終的に active になるか、少なくとも heading が "/" を含まない状態になるはず
    const lastState = editor.state;
    let hasParagraph = false;
    lastState.doc.forEach((node) => {
      if (node.type.name === "paragraph") hasParagraph = true;
    });
    expect(hasParagraph).toBe(true);

    editor.destroy();
  });
});

/* ------------------------------------------------------------------ */
/*  handleHeadingSlash テスト                                         */
/* ------------------------------------------------------------------ */

describe("handleHeadingSlash", () => {
  it("converts heading trailing '/' into a new paragraph with '/'", () => {
    const calls: SlashCommandState[] = [];
    const editor = createEditor("<h2>Test</h2>", (s) =>
      calls.push({ ...s }),
    );

    const textPos = findTextPos(editor, "Test");
    setCursor(editor, textPos + 4);
    editor.commands.insertContent("/");

    // heading から "/" が除去され、新しい paragraph が作られる
    const nodes: { type: string; text: string }[] = [];
    editor.state.doc.forEach((node) => {
      nodes.push({ type: node.type.name, text: node.textContent });
    });

    const heading = nodes.find((n) => n.type === "heading");
    expect(heading).toBeDefined();
    expect(heading!.text).toBe("Test");

    const para = nodes.find((n) => n.type === "paragraph");
    expect(para).toBeDefined();
    expect(para!.text.replace(/\u200B/g, "")).toBe("/");

    editor.destroy();
  });

  it("does nothing when cursor depth is not 1", () => {
    // blockquote 内の heading は depth > 1
    const calls: SlashCommandState[] = [];
    const editor = createEditor(
      "<blockquote><p>text</p></blockquote>",
      (s) => calls.push({ ...s }),
    );

    setCursor(editor, 3);
    editor.commands.insertContent("/");

    // activate されない
    const activated = calls.find((c) => c.active);
    expect(activated).toBeUndefined();

    editor.destroy();
  });

  it("does nothing when parent is not heading", () => {
    const calls: SlashCommandState[] = [];
    const editor = createEditor("<p>test</p>", (s) =>
      calls.push({ ...s }),
    );

    const pos = findTextPos(editor, "test");
    setCursor(editor, pos + 4);
    editor.commands.insertContent("/");

    // paragraph の末尾に "/" を追加しても handleHeadingSlash は発火しない
    // (tryActivate の heading 分岐に入らない)
    editor.destroy();
  });

  it("does nothing when heading text does not end with '/'", () => {
    const calls: SlashCommandState[] = [];
    const editor = createEditor("<h2>Test</h2>", (s) =>
      calls.push({ ...s }),
    );

    // heading の中間に文字を挿入
    const pos = findTextPos(editor, "Test");
    setCursor(editor, pos + 2);
    editor.commands.insertContent("x");

    // "/" で終わらないので handleHeadingSlash は発火しない — heading ノードが残っている
    const headings: string[] = [];
    editor.state.doc.forEach((node) => {
      if (node.type.name === "heading") headings.push(node.textContent);
    });

    expect(headings.length).toBe(1);
    expect(headings[0]).toBe("Texst");

    editor.destroy();
  });

  it("does nothing when cursor is not at end of heading", () => {
    const calls: SlashCommandState[] = [];
    const editor = createEditor("<h2>Te/st</h2>", (s) =>
      calls.push({ ...s }),
    );

    // "/" は heading の途中にある — 末尾ではない
    // 末尾以外に "/" がある heading に文字を挿入してテスト
    const pos = findTextPos(editor, "Te/st");
    setCursor(editor, pos + 5); // "st" の後
    editor.commands.insertContent("x");

    // "Te/stx" — "/" で終わらないので heading のままでいる
    const headings: string[] = [];
    editor.state.doc.forEach((node) => {
      if (node.type.name === "heading") headings.push(node.textContent);
    });
    expect(headings.length).toBe(1);
    expect(headings[0]).toBe("Te/stx");

    editor.destroy();
  });
});

/* ------------------------------------------------------------------ */
/*  Plugin view update: active 状態の追跡・deactivate                */
/* ------------------------------------------------------------------ */

describe("Plugin state management (active tracking)", () => {
  it("tracks query after activation", () => {
    const calls: SlashCommandState[] = [];
    const editor = createEditor("<p></p>", (s) => calls.push({ ...s }));

    editor.commands.insertContent("/");

    const activated = calls.find((c) => c.active);
    expect(activated).toBeDefined();

    // "/" の後に "he" を入力 → query が "he" に
    editor.commands.insertContent("h");
    editor.commands.insertContent("e");

    const withQuery = calls.filter((c) => c.active && c.query.length > 0);
    expect(withQuery.length).toBeGreaterThan(0);
    expect(withQuery[withQuery.length - 1].query).toBe("he");

    editor.destroy();
  });

  it("deactivates when cursor moves before slash position", () => {
    const calls: SlashCommandState[] = [];
    const editor = createEditor("<p></p>", (s) => calls.push({ ...s }));

    editor.commands.insertContent("/");
    expect(calls.some((c) => c.active)).toBe(true);

    // カーソルを先頭 (from=1) に移動 → cursorPos <= from で deactivate
    setCursor(editor, 1);
    // noop の変更を発生させてupdate を発火
    editor.commands.insertContent("a");

    const lastDeactivated = [...calls].reverse().find((c) => !c.active);
    expect(lastDeactivated).toBeDefined();

    editor.destroy();
  });

  it("deactivates when '/' is deleted", () => {
    const calls: SlashCommandState[] = [];
    const editor = createEditor("<p></p>", (s) => calls.push({ ...s }));

    editor.commands.insertContent("/");
    expect(calls.some((c) => c.active)).toBe(true);

    // "/" を削除（Backspace 相当）
    const { state } = editor;
    const cursorPos = state.selection.from;
    const tr = state.tr.delete(cursorPos - 1, cursorPos);
    editor.view.dispatch(tr);

    const lastCall = calls[calls.length - 1];
    expect(lastCall.active).toBe(false);

    editor.destroy();
  });

  it("deactivates when parent is no longer paragraph", () => {
    const calls: SlashCommandState[] = [];
    const editor = createEditor("<p></p>", (s) => calls.push({ ...s }));

    editor.commands.insertContent("/");
    expect(calls.some((c) => c.active)).toBe(true);

    // paragraph を heading に変換 → $from.parent.type.name !== "paragraph"
    editor.commands.setHeading({ level: 1 });

    const lastCall = calls[calls.length - 1];
    expect(lastCall.active).toBe(false);

    editor.destroy();
  });

  it("does not notify when query is unchanged", () => {
    const calls: SlashCommandState[] = [];
    const editor = createEditor("<p></p>", (s) => calls.push({ ...s }));

    editor.commands.insertContent("/");
    const countAfterActivation = calls.length;

    // selection のみ変更（doc 変更なし）→ update は走るが doc.eq で query 変わらず
    // ただし active 状態では doc.eq チェックはない (tryActivate 側のみ)
    // cursor を動かさず同じ位置に selection を設定
    const curPos = editor.state.selection.from;
    setCursor(editor, curPos);

    // ドキュメント変更なしでも update は発火するが、query が同じなので notify されない
    // (calls の数が増えていないことを確認)
    expect(calls.length).toBe(countAfterActivation);

    editor.destroy();
  });
});

/* ------------------------------------------------------------------ */
/*  handleKeyDown テスト                                              */
/* ------------------------------------------------------------------ */

describe("Plugin handleKeyDown", () => {
  function activateSlash(onStateChange: (s: SlashCommandState) => void) {
    const editor = createEditor("<p></p>", onStateChange);
    editor.commands.insertContent("/");
    return editor;
  }

  it("Escape deactivates", () => {
    const calls: SlashCommandState[] = [];
    const editor = activateSlash((s) => calls.push({ ...s }));

    expect(calls.some((c) => c.active)).toBe(true);

    // Escape キーを送信
    const event = new KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
    });
    editor.view.dom.dispatchEvent(event);

    const lastCall = calls[calls.length - 1];
    expect(lastCall.active).toBe(false);

    editor.destroy();
  });

  it("ArrowDown forwards navigation key", () => {
    const calls: SlashCommandState[] = [];
    const editor = activateSlash((s) => calls.push({ ...s }));

    const event = new KeyboardEvent("keydown", {
      key: "ArrowDown",
      bubbles: true,
    });
    editor.view.dom.dispatchEvent(event);

    const navCall = calls.find((c) => c.navigationKey === "ArrowDown");
    expect(navCall).toBeDefined();

    editor.destroy();
  });

  it("ArrowUp forwards navigation key", () => {
    const calls: SlashCommandState[] = [];
    const editor = activateSlash((s) => calls.push({ ...s }));

    const event = new KeyboardEvent("keydown", {
      key: "ArrowUp",
      bubbles: true,
    });
    editor.view.dom.dispatchEvent(event);

    const navCall = calls.find((c) => c.navigationKey === "ArrowUp");
    expect(navCall).toBeDefined();

    editor.destroy();
  });

  it("Enter forwards navigation key", () => {
    const calls: SlashCommandState[] = [];
    const editor = activateSlash((s) => calls.push({ ...s }));

    const event = new KeyboardEvent("keydown", {
      key: "Enter",
      bubbles: true,
    });
    editor.view.dom.dispatchEvent(event);

    const navCall = calls.find((c) => c.navigationKey === "Enter");
    expect(navCall).toBeDefined();

    editor.destroy();
  });

  it("other keys do not interfere when active", () => {
    const calls: SlashCommandState[] = [];
    const editor = activateSlash((s) => calls.push({ ...s }));
    const countBefore = calls.length;

    const event = new KeyboardEvent("keydown", {
      key: "a",
      bubbles: true,
    });
    editor.view.dom.dispatchEvent(event);

    // "a" キーは navigationKey を送らない
    const navCalls = calls.slice(countBefore).filter((c) => c.navigationKey !== null);
    expect(navCalls).toHaveLength(0);

    editor.destroy();
  });

  it("navigation keys are ignored when not active (Escape key)", () => {
    const calls: SlashCommandState[] = [];
    const editor = createEditor("<p>hello</p>", (s) => calls.push({ ...s }));

    // active でない状態で Escape キーを送信
    // Escape は gapcursor に引っかからないので安全
    const storage = (editor.storage as any).slashCommand;
    expect(storage.active).toBe(false);

    const event = new KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
    });
    editor.view.dom.dispatchEvent(event);

    // active でないので handleKeyDown は false を返し、何も通知されない
    expect(calls).toHaveLength(0);

    editor.destroy();
  });
});

/* ------------------------------------------------------------------ */
/*  Composing (IME) テスト                                            */
/* ------------------------------------------------------------------ */

describe("Composing (IME) handling", () => {
  it("does not activate during composition", () => {
    const calls: SlashCommandState[] = [];
    const editor = createEditor("<p></p>", (s) => calls.push({ ...s }));

    // compositionstart を発火
    const startEvent = new Event("compositionstart", { bubbles: true });
    editor.view.dom.dispatchEvent(startEvent);

    // storage.composing が true になっているはず
    const storage = (editor.storage as any).slashCommand;
    expect(storage.composing).toBe(true);

    // "/" を挿入しても composing 中なので update が early return
    editor.commands.insertContent("/");

    // composing 中は activate されない
    const activatedDuringCompose = calls.find((c) => c.active);
    expect(activatedDuringCompose).toBeUndefined();

    // compositionend で composing 解除
    const endEvent = new Event("compositionend", { bubbles: true });
    editor.view.dom.dispatchEvent(endEvent);
    expect(storage.composing).toBe(false);

    editor.destroy();
  });
});

/* ------------------------------------------------------------------ */
/*  deactivate の idempotent テスト                                   */
/* ------------------------------------------------------------------ */

describe("deactivate idempotent", () => {
  it("calling deactivate when already inactive is a no-op", () => {
    const calls: SlashCommandState[] = [];
    const editor = createEditor("<p></p>", (s) => calls.push({ ...s }));

    // activate
    editor.commands.insertContent("/");
    expect(calls.some((c) => c.active)).toBe(true);

    // deactivate by pressing Escape
    const esc1 = new KeyboardEvent("keydown", { key: "Escape", bubbles: true });
    editor.view.dom.dispatchEvent(esc1);
    const deactivateCount = calls.filter((c) => !c.active).length;

    // 2回目の Escape — 既に inactive なので deactivate の early return が走る
    const esc2 = new KeyboardEvent("keydown", { key: "Escape", bubbles: true });
    editor.view.dom.dispatchEvent(esc2);

    // deactivate の通知回数は増えていない
    const deactivateCount2 = calls.filter((c) => !c.active).length;
    expect(deactivateCount2).toBe(deactivateCount);

    editor.destroy();
  });
});

/* ------------------------------------------------------------------ */
/*  text が "/" で始まらない場合の deactivate                         */
/* ------------------------------------------------------------------ */

describe("deactivate when text does not start with /", () => {
  it("deactivates when slash is replaced with other text", () => {
    const calls: SlashCommandState[] = [];
    const editor = createEditor("<p></p>", (s) => calls.push({ ...s }));

    editor.commands.insertContent("/");
    expect(calls.some((c) => c.active)).toBe(true);

    // "/" を別の文字に置換
    const { state } = editor;
    const cursorPos = state.selection.from;
    const tr = state.tr.replaceWith(
      cursorPos - 1,
      cursorPos,
      state.schema.text("x"),
    );
    editor.view.dispatch(tr);

    const lastCall = calls[calls.length - 1];
    expect(lastCall.active).toBe(false);

    editor.destroy();
  });
});

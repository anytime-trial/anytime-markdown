/**
 * Admonition / Callout Extension テスト
 *
 * GitHub 互換 `> [!NOTE]` 記法のラウンドトリップ（Markdown → Editor → Markdown）を検証する。
 */
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "tiptap-markdown";
import { AdmonitionBlockquote } from "../extensions/admonitionExtension";
import { preprocessAdmonition } from "../utils/admonitionHelpers";
import { getMarkdownFromEditor, getMarkdownStorage } from "../types";
import { applyMarkdownToEditor } from "../utils/editorContentLoader";

function createAdmonitionEditor(md = ""): Editor {
  // commands.setContent() 経由で読み込むことで appendTransaction が発火する。
  // new Editor({ content: ... }) では appendTransaction が発火しないため、
  // 実際の applyMarkdownToEditor と同じ経路（commands.setContent）を使う。
  const editor = new Editor({
    extensions: [
      StarterKit.configure({ blockquote: false }),
      AdmonitionBlockquote,
      Markdown.configure({ html: true }),
    ],
  });
  editor.commands.setContent(md);
  return editor;
}

function createSaveLoadEditor(md = ""): Editor {
  // applyMarkdownToEditor 経由でロードし、保存時の preserveBlankLines / restoreBlankLines を含む
  // 実際の save / load サイクルを検証するためのヘルパー
  const editor = new Editor({
    extensions: [
      StarterKit.configure({ blockquote: false }),
      AdmonitionBlockquote,
      Markdown.configure({ html: true }),
    ],
  });
  applyMarkdownToEditor(editor, md);
  return editor;
}

function getMarkdown(editor: Editor): string {
  return getMarkdownStorage(editor).getMarkdown();
}

describe("preprocessAdmonition", () => {
  test("[!NOTE] を data-admonition-type 属性に変換する", () => {
    const input = "> [!NOTE]\n> Important info.";
    const result = preprocessAdmonition(input);
    expect(result).not.toContain("[!NOTE]");
    expect(result).toContain("data-admonition-type");
    expect(result).toContain("Important info.");
  });

  test.each(["NOTE", "TIP", "IMPORTANT", "WARNING", "CAUTION"])(
    "[!%s] を変換する",
    (type) => {
      const input = `> [!${type}]\n> Content.`;
      const result = preprocessAdmonition(input);
      expect(result).toContain(`data-admonition-type="${type.toLowerCase()}"`);
    },
  );

  test("通常の blockquote は変換しない", () => {
    const input = "> Just a normal quote.";
    const result = preprocessAdmonition(input);
    expect(result).toBe(input);
  });

  test("コードブロック内の [!NOTE] はスキップする", () => {
    const input = "```\n> [!NOTE]\n> content\n```";
    const result = preprocessAdmonition(input);
    expect(result).toBe(input);
  });

  test("大文字小文字を問わない", () => {
    const input = "> [!Note]\n> Mixed case.";
    const result = preprocessAdmonition(input);
    expect(result).toContain('data-admonition-type="note"');
  });

  test("複数の admonition を変換する", () => {
    const input = "> [!NOTE]\n> First.\n\n> [!WARNING]\n> Second.";
    const result = preprocessAdmonition(input);
    expect(result).toContain('data-admonition-type="note"');
    expect(result).toContain('data-admonition-type="warning"');
  });
});

describe("AdmonitionBlockquote", () => {
  describe("parseHTML: data-admonition-type 検出", () => {
    const types = ["note", "tip", "important", "warning", "caution"] as const;

    test.each(types)("[!%s] を検出し admonitionType 属性を設定する", (type) => {
      const md = `> [!${type.toUpperCase()}]\n> This is a ${type} callout.`;
      const editor = createAdmonitionEditor(md);

      let found = false;
      editor.state.doc.descendants((node) => {
        if (node.type.name === "blockquote" && node.attrs.admonitionType === type) {
          found = true;
          expect(node.textContent).toContain(`This is a ${type} callout.`);
        }
      });
      expect(found).toBe(true);
      editor.destroy();
    });

    test("通常の blockquote は admonitionType なし", () => {
      const md = "> Just a normal quote.";
      const editor = createAdmonitionEditor(md);

      let found = false;
      editor.state.doc.descendants((node) => {
        if (node.type.name === "blockquote") {
          found = true;
          expect(node.attrs.admonitionType).toBeNull();
        }
      });
      expect(found).toBe(true);
      editor.destroy();
    });
  });

  describe("serialize: Editor → Markdown", () => {
    test("admonitionType ありの blockquote は > [!TYPE] を出力する", () => {
      const md = "> [!WARNING]\n> Be careful!";
      const editor = createAdmonitionEditor(md);
      const output = getMarkdown(editor);

      expect(output).toContain("[!WARNING]");
      expect(output).toContain("Be careful!");
      const lines = output.trim().split("\n");
      expect(lines.some((l) => l.includes("> [!WARNING]"))).toBe(true);
      expect(lines.some((l) => /^>\s*Be careful!/.test(l))).toBe(true);
      editor.destroy();
    });

    test("通常の blockquote は [!TYPE] なしで出力する", () => {
      const md = "> Normal quote content.";
      const editor = createAdmonitionEditor(md);
      const output = getMarkdown(editor);

      expect(output).not.toContain("[!");
      expect(output).toContain("Normal quote content.");
      editor.destroy();
    });

    test("admonitionType 未設定でも firstChild の [!TYPE] からフォールバック serialize する", () => {
      // regression: new Editor({ content }) は appendTransaction を発火させないため
      // admonitionType が null のまま serialize される。else 分岐に落ちると
      // ブラケットがエスケープされて > \[!IMPORTANT\] body のように壊れる
      const editor = new Editor({
        extensions: [
          StarterKit.configure({ blockquote: false }),
          AdmonitionBlockquote,
          Markdown.configure({ html: true }),
        ],
        content: "> [!IMPORTANT]\n> body",
      });
      const output = getMarkdown(editor);

      expect(output).not.toContain("\\[");
      const lines = output.trim().split("\n");
      expect(lines.some((l) => l.includes("> [!IMPORTANT]"))).toBe(true);
      expect(lines.some((l) => /^>\s*body/.test(l))).toBe(true);
      // [!IMPORTANT] が重複出力されないこと
      expect(output.match(/\[!IMPORTANT\]/g)?.length).toBe(1);
      editor.destroy();
    });
  });

  describe("ラウンドトリップ", () => {
    test("NOTE admonition のラウンドトリップ", () => {
      const input = "> [!NOTE]\n> Important information here.";
      const editor = createAdmonitionEditor(input);
      const output = getMarkdown(editor);

      const editor2 = createAdmonitionEditor(output);

      let type1: string | null = null;
      let text1 = "";
      editor.state.doc.descendants((node) => {
        if (node.type.name === "blockquote") {
          type1 = node.attrs.admonitionType as string;
          text1 = node.textContent;
        }
      });

      let type2: string | null = null;
      let text2 = "";
      editor2.state.doc.descendants((node) => {
        if (node.type.name === "blockquote") {
          type2 = node.attrs.admonitionType as string;
          text2 = node.textContent;
        }
      });

      expect(type1).toBe("note");
      expect(type2).toBe("note");
      expect(text1).toBe(text2);
      editor.destroy();
      editor2.destroy();
    });

    test("admonition 内のコードスパンでバックスラッシュが増幅しない", () => {
      // regression: preprocessAdmonition が HTML blockquote に変換すると
      // バッククォートが毎ラウンド escapeされて指数的に増幅するバグ
      const input = "> [!NOTE]\n> Use `moduleResolution: \"node\"` for this.";
      const editor = createAdmonitionEditor(input);
      const output = getMarkdown(editor);

      const editor2 = createAdmonitionEditor(output);
      const output2 = getMarkdown(editor2);

      // 連続ラウンドトリップで出力が安定すること
      expect(output2).toBe(output);
      // バッククォートが保持されること（エスケープされていないこと）
      expect(output).toContain("`moduleResolution: \"node\"`");
      editor.destroy();
      editor2.destroy();
    });

    test("保存を繰り返しても admonition 末尾に空行が増殖しない", () => {
      const input = [
        "> [!NOTE]",
        "> 本書は時間軸に関する要件を集約するメタ要件書であり、個別機能の実装責務は既存の機体・管制塔要件書に委ねる。\\",
        "> 本書の役割は「時間軸の概念定義」と「既存要件の時間軸的整合性確認」に限定する。",
      ].join("\n");
      const editor = createAdmonitionEditor(input);

      const once = getMarkdownFromEditor(editor);
      const twice = getMarkdownFromEditor(editor);
      const threeTimes = getMarkdownFromEditor(editor);

      expect(twice).toBe(once);
      expect(threeTimes).toBe(once);
      editor.destroy();
    });

    test("parse→serialize を繰り返しても admonition と次ブロック間の空行が増殖しない (save/load サイクル)", () => {
      // regression: 保存（apply → serialize → file write → reload → apply → serialize）を
      // 繰り返すと admonition の閉じ `>` 行と後続ブロックの間に空行が累積する不具合。
      // applyMarkdownToEditor + getMarkdownFromEditor を経由することで
      // preserveBlankLines / restoreBlankLines を含む実際の save / load サイクルを再現する。
      const input = [
        "> [!IMPORTANT]",
        "> 本スキルは Trail DB に対して読み取り専用で動作する。",
        "",
        "## 次の見出し",
        "",
        "本文。",
        "",
      ].join("\n");

      const editor1 = createSaveLoadEditor(input);
      const out1 = getMarkdownFromEditor(editor1);
      editor1.destroy();

      const editor2 = createSaveLoadEditor(out1);
      const out2 = getMarkdownFromEditor(editor2);
      editor2.destroy();

      const editor3 = createSaveLoadEditor(out2);
      const out3 = getMarkdownFromEditor(editor3);
      editor3.destroy();

      // ラウンドトリップで出力が安定すること
      expect(out2).toBe(out1);
      expect(out3).toBe(out1);
      // admonition と heading の間に空行が累積していないこと
      const blankLines = /\n{4,}## /.exec(out1);
      expect(blankLines).toBeNull();
    });
  });

  describe("初期ロード regression (new Editor + content prop)", () => {
    // 本番の useEditorConfig は `content: initialContent` を渡して useEditor 経由でエディタを作成する。
    // 内部の new Editor({ content }) 経路は appendTransaction を発火させないため、
    // admonition の初期ロード検出は拡張側の onCreate で完結している必要がある。
    test("new Editor({ content }) 経路で admonitionType が即時設定される", () => {
      const editor = new Editor({
        extensions: [
          StarterKit.configure({ blockquote: false }),
          AdmonitionBlockquote,
          Markdown.configure({ html: true }),
        ],
        content: "> [!IMPORTANT]\n> 初期ロードでも検出される本文。",
      });

      let bqType: string | null | undefined = undefined;
      let bqText = "";
      editor.state.doc.descendants((node) => {
        if (node.type.name === "blockquote") {
          bqType = node.attrs.admonitionType as string | null;
          bqText = node.textContent;
        }
      });

      expect(bqType).toBe("important");
      expect(bqText).not.toContain("[!IMPORTANT]");
      expect(bqText).toContain("初期ロードでも検出される本文。");
      editor.destroy();
    });

    test.each(["NOTE", "TIP", "IMPORTANT", "WARNING", "CAUTION"])(
      "new Editor({ content }) 経路で [!%s] が検出される",
      (type) => {
        const editor = new Editor({
          extensions: [
            StarterKit.configure({ blockquote: false }),
            AdmonitionBlockquote,
            Markdown.configure({ html: true }),
          ],
          content: `> [!${type}]\n> body`,
        });

        let bqType: string | null | undefined;
        editor.state.doc.descendants((node) => {
          if (node.type.name === "blockquote") {
            bqType = node.attrs.admonitionType as string | null;
          }
        });
        expect(bqType).toBe(type.toLowerCase());
        editor.destroy();
      },
    );

    test("初期ロードの DOM に data-admonition-type 属性が付与される", () => {
      // 表示レベルのリグレッション。React-less 環境ではあるが、ProseMirror が
      // renderHTML を介して DOM 属性を出力するため、初期ロード直後でも
      // data-admonition-type が要素に付くことを保証する。
      const editor = new Editor({
        extensions: [
          StarterKit.configure({ blockquote: false }),
          AdmonitionBlockquote,
          Markdown.configure({ html: true }),
        ],
        content: "> [!CAUTION]\n> dom test",
      });

      const dom = editor.view.dom.querySelector("[data-admonition-type='caution']");
      expect(dom).not.toBeNull();
      editor.destroy();
    });

    test("初期ロード経路と commands.setContent 経路で doc が一致する", () => {
      // どちらの経路でも admonitionType と textContent が同じ状態に到達すること。
      // 過去は前者のみ admonitionType=null・前者のみ textContent に [!NOTE] 残存していた。
      const md = "> [!NOTE]\n> 初期表示テスト";
      const editorInit = new Editor({
        extensions: [
          StarterKit.configure({ blockquote: false }),
          AdmonitionBlockquote,
          Markdown.configure({ html: true }),
        ],
        content: md,
      });
      const editorSet = createAdmonitionEditor(md);

      const collect = (e: Editor) => {
        let type: string | null = null;
        let text = "";
        e.state.doc.descendants((n) => {
          if (n.type.name === "blockquote") {
            type = n.attrs.admonitionType as string | null;
            text = n.textContent;
          }
        });
        return { type, text };
      };

      expect(collect(editorInit)).toEqual(collect(editorSet));
      editorInit.destroy();
      editorSet.destroy();
    });
  });
});

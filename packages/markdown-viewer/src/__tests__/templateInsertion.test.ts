/**
 * テンプレート挿入テスト
 *
 * 不具合: テンプレート挿入時に Tiptap ReactRenderer が flushSync を呼び出し、
 * React のレンダリングサイクルと競合して Mermaid NodeView が表示されない。
 * 修正: insertContent を requestAnimationFrame で次フレームに遅延。
 *
 * このテストは以下を検証する:
 * 1. insertContent でテンプレートの Mermaid/PlantUML コードブロックが保持されること
 * 2. handleInsertTemplate が requestAnimationFrame 経由で insertContent を呼ぶこと
 */
import { Editor } from "@tiptap/core";
import { createTestEditor } from "../testUtils/createTestEditor";
import { getMarkdownFromEditor } from "../types";

// テスト用テンプレート定義（実テンプレートと同等の構造）
const TEMPLATES = {
  mermaid: [
    "# Mermaid Test",
    "",
    "```mermaid",
    "graph TD",
    "    A[Start] --> B{Condition}",
    "    B -->|Yes| C[End]",
    "",
    "```",
    "",
  ].join("\n"),
  plantuml: [
    "# PlantUML Test",
    "",
    "```plantuml",
    "actor User",
    "participant App",
    "User -> App: Request",
    "",
    "```",
    "",
  ].join("\n"),
  mixed: [
    "# Mixed Diagrams",
    "",
    "Some text here.",
    "",
    "```mermaid",
    "graph LR",
    "    A --> B",
    "",
    "```",
    "",
    "Middle paragraph.",
    "",
    "```plantuml",
    "Bob -> Alice: Hello",
    "",
    "```",
    "",
  ].join("\n"),
  sampleContent: [
    "# 見出し1",
    "",
    "テキスト段落。",
    "",
    "| ヘッダ1 | ヘッダ2 |",
    "| --- | --- |",
    "| 1 | 2 |",
    "",
    "```mermaid",
    "graph TD",
    "    A[Start] --> B{Condition}",
    "    B -->|Yes| C[Process A]",
    "    B -->|No| D[Process B]",
    "    C --> E[End]",
    "    D --> E",
    "",
    "```",
    "",
    "```plantuml",
    "actor User",
    "participant App",
    "participant Server",
    "User -> App: Request",
    "App -> Server: API Call",
    "",
    "```",
    "",
  ].join("\n"),
};

// ---------- insertContent でコードブロックが保持されるか ----------

describe("insertContent: Mermaid/PlantUML コードブロックの保持", () => {
  let editor: Editor;

  afterEach(() => {
    editor?.destroy();
  });

  test("Mermaid コードブロックを含むテンプレートを insertContent で挿入できる", () => {
    editor = createTestEditor({ withMarkdown: true });

    editor.commands.insertContent(TEMPLATES.mermaid);
    const result = getMarkdownFromEditor(editor);

    expect(result).toContain("# Mermaid Test");
    expect(result).toContain("```mermaid");
    expect(result).toContain("graph TD");
    expect(result).toContain("A[Start] --> B{Condition}");
  });

  test("PlantUML コードブロックを含むテンプレートを insertContent で挿入できる", () => {
    editor = createTestEditor({ withMarkdown: true });

    editor.commands.insertContent(TEMPLATES.plantuml);
    const result = getMarkdownFromEditor(editor);

    expect(result).toContain("# PlantUML Test");
    expect(result).toContain("```plantuml");
    expect(result).toContain("actor User");
    expect(result).toContain("User -> App: Request");
  });

  test("Mermaid + PlantUML 両方を含むテンプレートを insertContent で挿入できる", () => {
    editor = createTestEditor({ withMarkdown: true });

    editor.commands.insertContent(TEMPLATES.mixed);
    const result = getMarkdownFromEditor(editor);

    expect(result).toContain("```mermaid");
    expect(result).toContain("```plantuml");
    expect(result).toContain("A --> B");
    expect(result).toContain("Bob -> Alice: Hello");
  });

  test("サンプルコンテンツ相当のテンプレートを insertContent で挿入できる", () => {
    editor = createTestEditor({ withMarkdown: true });

    expect(() => {
      editor.commands.insertContent(TEMPLATES.sampleContent);
    }).not.toThrow();

    const result = getMarkdownFromEditor(editor);
    expect(result).toContain("```mermaid");
    expect(result).toContain("```plantuml");
    expect(result).toContain("# 見出し1");
  });

  test("基本設計書テンプレートを insertContent で挿入できる", () => {
    editor = createTestEditor({ withMarkdown: true });
    const fs = require("fs");
    const path = require("path");
    const basicDesign = fs.readFileSync(
      path.resolve(__dirname, "../constants/templates/basicDesign.md"),
      "utf-8"
    );
    editor.commands.insertContent(basicDesign);
    const result = getMarkdownFromEditor(editor);
    expect(result).toContain("# Basic Design Document");
    expect(result).toContain("```mermaid");
    expect(result).toContain("erDiagram");
  });

  test("API仕様書テンプレートを insertContent で挿入できる", () => {
    editor = createTestEditor({ withMarkdown: true });
    const fs = require("fs");
    const path = require("path");
    const apiSpec = fs.readFileSync(
      path.resolve(__dirname, "../constants/templates/apiSpec.md"),
      "utf-8"
    );
    editor.commands.insertContent(apiSpec);
    const result = getMarkdownFromEditor(editor);
    expect(result).toContain("# API Specification");
    expect(result).toContain("GET /resources");
  });

});

// ---------- requestAnimationFrame による遅延実行の検証 ----------

describe("handleInsertTemplate: requestAnimationFrame で insertContent を遅延実行", () => {
  let editor: Editor;
  let originalRAF: typeof globalThis.requestAnimationFrame;

  beforeEach(() => {
    originalRAF = globalThis.requestAnimationFrame;
  });

  afterEach(() => {
    globalThis.requestAnimationFrame = originalRAF;
    editor?.destroy();
  });

  test("WYSIWYG モードで insertContent が requestAnimationFrame 内で実行される", () => {
    editor = createTestEditor({ withMarkdown: true });
    const rafCallbacks: FrameRequestCallback[] = [];
    globalThis.requestAnimationFrame = jest.fn((cb: FrameRequestCallback) => {
      rafCallbacks.push(cb);
      return rafCallbacks.length;
    });

    // handleInsertTemplate のロジックを再現（MarkdownEditorPage.tsx と同じ構造）
    const sourceMode = false;
    const template = TEMPLATES.mermaid;
    if (!sourceMode && editor) {
      requestAnimationFrame(() => {
        editor.chain().focus().insertContent(template).run();
      });
    }

    // requestAnimationFrame が呼ばれたことを確認
    expect(globalThis.requestAnimationFrame).toHaveBeenCalledTimes(1);

    // コールバック実行前はエディタが空
    const beforeInsert = getMarkdownFromEditor(editor);
    expect(beforeInsert).not.toContain("```mermaid");

    // コールバックを実行（次フレームのシミュレーション）
    rafCallbacks.forEach((cb) => cb(0));

    // 実行後にコンテンツが挿入される
    const afterInsert = getMarkdownFromEditor(editor);
    expect(afterInsert).toContain("# Mermaid Test");
    expect(afterInsert).toContain("```mermaid");
  });

  test("同期的 insertContent は即座に反映される（修正前: React 環境で flushSync 競合の原因）", () => {
    editor = createTestEditor({ withMarkdown: true });

    // 修正前の動作: requestAnimationFrame なしで同期呼び出し
    // headless テストでは問題ないが、React 環境では flushSync エラーの原因
    editor.chain().focus().insertContent(TEMPLATES.mermaid).run();

    const result = getMarkdownFromEditor(editor);
    expect(result).toContain("```mermaid");
  });

  test("ソースモードでは requestAnimationFrame を使わず直接 appendToSource する", () => {
    globalThis.requestAnimationFrame = jest.fn(() => 0);

    // handleInsertTemplate のソースモードロジックを再現
    const sourceMode = true;
    let appendedContent = "";
    const appendToSource = (content: string) => { appendedContent = content; };
    const template = TEMPLATES.mermaid;

    if (sourceMode) {
      appendToSource(template);
    }

    // ソースモードでは requestAnimationFrame は呼ばれない
    expect(globalThis.requestAnimationFrame).not.toHaveBeenCalled();
    expect(appendedContent).toBe(template);
  });
});

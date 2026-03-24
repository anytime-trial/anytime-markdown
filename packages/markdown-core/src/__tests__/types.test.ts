import { createTestEditor } from "../testUtils/createTestEditor";
import { extractHeadings } from "../types";

describe("extractHeadings", () => {
  test("見出しをレベル付きで抽出する", () => {
    const editor = createTestEditor({
      content: "<h1>Title</h1><p>text</p><h2>Sub</h2><p>more</p>",
    });

    const items = extractHeadings(editor);

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      level: 1,
      text: "Title",
      kind: "heading",
      headingIndex: 0,
    });
    expect(items[1]).toMatchObject({
      level: 2,
      text: "Sub",
      kind: "heading",
      headingIndex: 1,
    });

    editor.destroy();
  });

  test("コードブロックを抽出する", () => {
    const editor = createTestEditor({
      content: '<pre><code class="language-javascript">const x = 1;</code></pre>',
    });

    const items = extractHeadings(editor);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      level: 6,
      text: "javascript",
      kind: "codeBlock",
    });

    editor.destroy();
  });

  test("Mermaidブロックを専用kindで抽出する", () => {
    const editor = createTestEditor({
      content: '<pre><code class="language-mermaid">graph TD</code></pre>',
    });

    const items = extractHeadings(editor);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      level: 6,
      text: "Mermaid",
      kind: "mermaid",
    });

    editor.destroy();
  });

  test("PlantUMLブロックを専用kindで抽出する", () => {
    const editor = createTestEditor({
      content: '<pre><code class="language-plantuml">@startuml\nA -> B\n@enduml</code></pre>',
    });

    const items = extractHeadings(editor);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      level: 6,
      text: "PlantUML",
      kind: "plantuml",
    });

    editor.destroy();
  });

  test("テーブルを抽出する", () => {
    const editor = createTestEditor({
      content: "<table><tr><th>A</th></tr><tr><td>1</td></tr></table>",
      withTable: true,
    });

    const items = extractHeadings(editor);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      level: 6,
      text: "Table",
      kind: "table",
    });

    editor.destroy();
  });

  test("headingIndexは見出しにのみ付与される", () => {
    const editor = createTestEditor({
      content:
        '<h1>A</h1><pre><code class="language-mermaid">graph</code></pre><h2>B</h2>',
    });

    const items = extractHeadings(editor);

    expect(items).toHaveLength(3);
    expect(items[0].headingIndex).toBe(0);
    expect(items[1].headingIndex).toBeUndefined();
    expect(items[2].headingIndex).toBe(1);

    editor.destroy();
  });

  test("空のドキュメントでは空配列を返す", () => {
    const editor = createTestEditor({ content: "" });

    const items = extractHeadings(editor);

    expect(items).toEqual([]);

    editor.destroy();
  });

  test("言語なしコードブロックは 'Code' テキストになる", () => {
    const editor = createTestEditor({
      content: "<pre><code>plain code</code></pre>",
    });

    const items = extractHeadings(editor);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      level: 6,
      text: "Code",
      kind: "codeBlock",
    });

    editor.destroy();
  });
});

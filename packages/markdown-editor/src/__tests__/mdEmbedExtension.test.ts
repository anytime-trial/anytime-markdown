import { MdEmbed } from "../extensions/mdEmbedExtension";
import { createTestEditor } from "../testUtils/createTestEditor";
import { getMarkdownFromEditor } from "../types";

function createMdEmbedEditor() {
  return createTestEditor({ withMarkdown: true, extraExtensions: [MdEmbed] });
}

function setMarkdownAndGetResult(markdown: string) {
  const editor = createMdEmbedEditor();
  editor.commands.setContent(markdown);

  const mdEmbeds: { attrs: Record<string, unknown> }[] = [];
  editor.state.doc.descendants((node) => {
    if (node.type.name === "mdEmbed") {
      mdEmbeds.push({ attrs: node.attrs });
    }
  });

  return {
    editor,
    mdEmbeds,
    markdown: getMarkdownFromEditor(editor),
  };
}

describe("MdEmbed", () => {
  it("parses a single markdown link paragraph as mdEmbed and round-trips it", () => {
    const { editor, mdEmbeds, markdown } = setMarkdownAndGetResult("[a](x.md)");

    expect(mdEmbeds).toHaveLength(1);
    expect(mdEmbeds[0].attrs).toMatchObject({
      href: "x.md",
      text: "a",
      title: null,
      anchor: null,
      raw: "[a](x.md)",
    });
    expect(markdown.trim()).toBe("[a](x.md)");

    editor.destroy();
  });

  it("preserves internal whitespace in link text", () => {
    const { editor, mdEmbeds, markdown } = setMarkdownAndGetResult("[hello world](x.md)");

    expect(mdEmbeds).toHaveLength(1);
    expect(mdEmbeds[0].attrs.text).toBe("hello world");
    expect(markdown.trim()).toBe("[hello world](x.md)");

    editor.destroy();
  });

  it("preserves link titles", () => {
    const { editor, mdEmbeds, markdown } = setMarkdownAndGetResult("[a](x.md \"T\")");

    expect(mdEmbeds).toHaveLength(1);
    expect(mdEmbeds[0].attrs.title).toBe("T");
    expect(markdown.trim()).toBe("[a](x.md \"T\")");

    editor.destroy();
  });

  it("splits and preserves anchors", () => {
    const { editor, mdEmbeds, markdown } = setMarkdownAndGetResult("[a](x.md#sec)");

    expect(mdEmbeds).toHaveLength(1);
    expect(mdEmbeds[0].attrs).toMatchObject({
      href: "x.md",
      anchor: "sec",
      raw: "[a](x.md#sec)",
    });
    expect(markdown.trim()).toBe("[a](x.md#sec)");

    editor.destroy();
  });

  it("leaves mixed inline markdown links as normal paragraphs", () => {
    const { editor, mdEmbeds, markdown } = setMarkdownAndGetResult("前 [a](x.md) 後");

    expect(mdEmbeds).toHaveLength(0);
    expect(markdown.trim()).toBe("前 [a](x.md) 後");

    editor.destroy();
  });

  it("leaves decorated link text as a normal paragraph", () => {
    const { editor, mdEmbeds, markdown } = setMarkdownAndGetResult("[**bold**](x.md)");

    expect(mdEmbeds).toHaveLength(0);
    expect(markdown.trim()).toBe("[**bold**](x.md)");

    editor.destroy();
  });

  it("leaves escaped special characters in link text to the standard serializer", () => {
    const { editor, mdEmbeds, markdown } = setMarkdownAndGetResult("[a\\]b](x.md)");

    expect(mdEmbeds).toHaveLength(0);
    expect(markdown.trim()).toBe("[a\\]b](x.md)");

    editor.destroy();
  });

  it("leaves external markdown-looking links as normal paragraphs", () => {
    const { editor, mdEmbeds, markdown } = setMarkdownAndGetResult("[a](https://e.com/x.md)");

    expect(mdEmbeds).toHaveLength(0);
    expect(markdown.trim()).toBe("[a](https://e.com/x.md)");

    editor.destroy();
  });

  it("parses consecutive single markdown link paragraphs as separate mdEmbed nodes", () => {
    const { editor, mdEmbeds, markdown } = setMarkdownAndGetResult("[a](x.md)\n\n[b](y.md)");

    expect(mdEmbeds).toHaveLength(2);
    expect(mdEmbeds[0].attrs.raw).toBe("[a](x.md)");
    expect(mdEmbeds[1].attrs.raw).toBe("[b](y.md)");
    expect(markdown.trim()).toBe("[a](x.md)\n\n[b](y.md)");

    editor.destroy();
  });
});

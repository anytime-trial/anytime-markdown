import type { Node as PMNode } from "@anytime-markdown/markdown-pm/model";

import { detectMdLinkParagraph } from "../utils/detectMdLinkParagraph";

interface TestMark {
  type: { name: string };
  attrs: Record<string, unknown>;
}

interface TestInlineNode {
  type: { name: string };
  text?: string;
  marks?: TestMark[];
}

interface TestBlockNode {
  type: { name: string };
  forEach(callback: (node: TestInlineNode) => void): void;
}

function linkMark(href: string, title: string | null = null): TestMark {
  return { type: { name: "link" }, attrs: { href, title } };
}

function textNode(text: string, marks: TestMark[] = []): TestInlineNode {
  return { type: { name: "text" }, text, marks };
}

function hardBreak(): TestInlineNode {
  return { type: { name: "hardBreak" } };
}

function imageNode(): TestInlineNode {
  return { type: { name: "image" } };
}

function paragraph(children: TestInlineNode[]): PMNode {
  const node: TestBlockNode = {
    type: { name: "paragraph" },
    forEach(callback) {
      children.forEach(callback);
    },
  };
  return node as unknown as PMNode;
}

function heading(children: TestInlineNode[]): PMNode {
  const node: TestBlockNode = {
    type: { name: "heading" },
    forEach(callback) {
      children.forEach(callback);
    },
  };
  return node as unknown as PMNode;
}

describe("detectMdLinkParagraph", () => {
  it("detects a single markdown link paragraph", () => {
    expect(detectMdLinkParagraph(paragraph([textNode("a", [linkMark("x.md")])]))).toEqual({
      href: "x.md",
      text: "a",
      title: null,
      anchor: null,
      raw: "[a](x.md)",
    });
  });

  it("preserves spaces inside link text", () => {
    expect(detectMdLinkParagraph(paragraph([textNode("hello world", [linkMark("x.md")])]))).toEqual({
      href: "x.md",
      text: "hello world",
      title: null,
      anchor: null,
      raw: "[hello world](x.md)",
    });
  });

  it("detects .markdown and uppercase .MD hrefs", () => {
    expect(detectMdLinkParagraph(paragraph([textNode("a", [linkMark("x.markdown")])]))?.href).toBe("x.markdown");
    expect(detectMdLinkParagraph(paragraph([textNode("a", [linkMark("X.MD")])]))?.href).toBe("X.MD");
  });

  it("rejects paragraphs with non-link text around the link", () => {
    expect(detectMdLinkParagraph(paragraph([
      textNode("前 "),
      textNode("a", [linkMark("x.md")]),
      textNode(" 後"),
    ]))).toBeNull();
  });

  it("rejects external markdown-looking hrefs", () => {
    expect(detectMdLinkParagraph(paragraph([textNode("a", [linkMark("https://e.com/x.md")])]))).toBeNull();
  });

  it("splits anchors out of the returned href", () => {
    expect(detectMdLinkParagraph(paragraph([textNode("a", [linkMark("x.md#sec")])]))).toEqual({
      href: "x.md",
      text: "a",
      title: null,
      anchor: "sec",
      raw: "[a](x.md#sec)",
    });
  });

  it("preserves link title in the returned info and raw markdown", () => {
    expect(detectMdLinkParagraph(paragraph([textNode("a", [linkMark("x.md", "T")])]))).toEqual({
      href: "x.md",
      text: "a",
      title: "T",
      anchor: null,
      raw: "[a](x.md \"T\")",
    });
  });

  it("allows hardBreaks and surrounding whitespace when the only real content is one link", () => {
    expect(detectMdLinkParagraph(paragraph([
      textNode(" \n\t"),
      hardBreak(),
      textNode("a", [linkMark("x.md")]),
      hardBreak(),
      textNode("  "),
    ]))).toEqual({
      href: "x.md",
      text: "a",
      title: null,
      anchor: null,
      raw: "[a](x.md)",
    });
  });

  it("rejects image-only and non-paragraph nodes", () => {
    expect(detectMdLinkParagraph(paragraph([imageNode()]))).toBeNull();
    expect(detectMdLinkParagraph(heading([textNode("a", [linkMark("x.md")])]))).toBeNull();
  });
});

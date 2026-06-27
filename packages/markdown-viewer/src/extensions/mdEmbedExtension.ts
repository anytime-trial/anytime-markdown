import { mergeAttributes, Node as TiptapNode } from "@anytime-markdown/markdown-core";
import type { Node as PMNode } from "@anytime-markdown/markdown-pm/model";

import { createMdEmbedNodeView } from "../components-vanilla/MdEmbedNodeView";
import type { MdSerializerState } from "../types";
import { isMarkdownHref } from "../utils/isMarkdownHref";

interface MdEmbedAttrs {
  href: string | null;
  text: string | null;
  title: string | null;
  anchor: string | null;
  raw: string | null;
}

export const MdEmbed = TiptapNode.create({
  name: "mdEmbed",
  group: "block",
  atom: true,
  selectable: true,
  draggable: false,

  addStorage() {
    return {
      markdown: {
        serialize(state: MdSerializerState, node: PMNode) {
          const attrs = readMdEmbedAttrs(node.attrs);
          state.write(attrs.raw ?? buildRawMarkdown(attrs));
          state.closeBlock(node);
        },
        parse: {},
      },
    };
  },

  addAttributes() {
    return {
      href: { default: null },
      text: { default: null },
      title: { default: null },
      anchor: { default: null },
      raw: { default: null },
    };
  },

  parseHTML() {
    return [
      {
        tag: "p",
        priority: 60,
        getAttrs: (element: HTMLElement) => {
          const anchor = getSingleAnchorElement(element);
          if (!anchor) return false;

          const hrefWithAnchor = anchor.getAttribute("href");
          if (!hrefWithAnchor || !isMarkdownHref(hrefWithAnchor)) return false;

          const hrefParts = splitAnchor(hrefWithAnchor);
          const text = anchor.textContent ?? "";
          const titleAttr = anchor.getAttribute("title");
          const title = titleAttr && titleAttr.length > 0 ? titleAttr : null;

          return {
            href: hrefParts.href,
            text,
            title,
            anchor: hrefParts.anchor,
            raw: title
              ? `[${text}](${hrefWithAnchor} "${escapeTitle(title)}")`
              : `[${text}](${hrefWithAnchor})`,
          };
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const attrs = readMdEmbedAttrs(HTMLAttributes);
    const hrefWithAnchor = addAnchor(attrs.href, attrs.anchor);

    return [
      "div",
      mergeAttributes(
        {
          "data-am-md-embed": "",
          "data-href": attrs.href ?? "",
          "data-anchor": attrs.anchor ?? "",
          "data-title": attrs.title ?? "",
          "data-raw": attrs.raw ?? "",
        },
        HTMLAttributes,
      ),
      ["a", { href: hrefWithAnchor, title: attrs.title ?? undefined }, attrs.text ?? hrefWithAnchor],
    ];
  },

  addNodeView() {
    return (props) => createMdEmbedNodeView(props);
  },
});

function getSingleAnchorElement(parent: HTMLElement): HTMLAnchorElement | null {
  let anchor: HTMLAnchorElement | null = null;

  for (const child of Array.from(parent.childNodes)) {
    if (child.nodeType === globalThis.Node.TEXT_NODE) {
      if (child.textContent?.trim()) return null;
      continue;
    }

    if (child.nodeType !== globalThis.Node.ELEMENT_NODE) return null;
    if (!(child instanceof HTMLAnchorElement)) return null;
    if (anchor !== null) return null;

    anchor = child;
  }

  return anchor;
}

function readMdEmbedAttrs(attrs: Record<string, unknown>): MdEmbedAttrs {
  return {
    href: stringOrNull(attrs.href),
    text: stringOrNull(attrs.text),
    title: stringOrNull(attrs.title),
    anchor: stringOrNull(attrs.anchor),
    raw: stringOrNull(attrs.raw),
  };
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function splitAnchor(href: string): { href: string; anchor: string | null } {
  const anchorIndex = href.indexOf("#");
  if (anchorIndex === -1) return { href, anchor: null };

  return {
    href: href.slice(0, anchorIndex),
    anchor: href.slice(anchorIndex + 1) || null,
  };
}

function addAnchor(href: string | null, anchor: string | null): string {
  if (!href) return "";
  return anchor ? `${href}#${anchor}` : href;
}

function buildRawMarkdown(attrs: MdEmbedAttrs): string {
  const hrefWithAnchor = addAnchor(attrs.href, attrs.anchor);
  const text = attrs.text ?? hrefWithAnchor;

  return attrs.title
    ? `[${text}](${hrefWithAnchor} "${escapeTitle(attrs.title)}")`
    : `[${text}](${hrefWithAnchor})`;
}

function escapeTitle(title: string): string {
  return title.replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
}

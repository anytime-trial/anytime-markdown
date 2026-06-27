import type { Mark, Node as PMNode } from "@anytime-markdown/markdown-pm/model";

import { isMarkdownHref } from "./isMarkdownHref";

export interface MdLinkInfo {
  href: string;
  text: string;
  title: string | null;
  anchor: string | null;
  raw: string;
}

interface LinkAttrs {
  href: string;
  title: string | null;
}

export function detectMdLinkParagraph(node: PMNode): MdLinkInfo | null {
  if (node.type.name !== "paragraph") return null;

  let targetHref: string | null = null;
  let targetTitle: string | null = null;
  let linkText = "";
  let invalid = false;

  node.forEach((child) => {
    if (invalid) return;

    if (child.type.name === "hardBreak") return;
    if (child.type.name !== "text") {
      invalid = true;
      return;
    }

    const text = child.text ?? "";
    if (!text.trim()) return;

    const linkAttrs = getLinkAttrs(child.marks);
    if (!linkAttrs) {
      invalid = true;
      return;
    }

    if (targetHref === null) {
      targetHref = linkAttrs.href;
      targetTitle = linkAttrs.title;
    } else if (targetHref !== linkAttrs.href) {
      invalid = true;
      return;
    }

    linkText += text;
  });

  linkText = linkText.trim();

  if (invalid || targetHref === null || !linkText) return null;
  if (!isMarkdownHref(targetHref)) return null;

  const hrefParts = splitAnchor(targetHref);
  const rawHref = hrefParts.anchor === null ? hrefParts.href : `${hrefParts.href}#${hrefParts.anchor}`;
  const raw = targetTitle ? `[${linkText}](${rawHref} "${escapeTitle(targetTitle)}")` : `[${linkText}](${rawHref})`;

  return {
    href: hrefParts.href,
    text: linkText,
    title: targetTitle,
    anchor: hrefParts.anchor,
    raw,
  };
}

function getLinkAttrs(marks: readonly Mark[]): LinkAttrs | null {
  const linkMark = marks.find((mark) => mark.type.name === "link");
  if (!linkMark) return null;

  const href = linkMark.attrs.href;
  if (typeof href !== "string" || !href.trim()) return null;

  const title = linkMark.attrs.title;
  return {
    href,
    title: typeof title === "string" && title.length > 0 ? title : null,
  };
}

function splitAnchor(href: string): { href: string; anchor: string | null } {
  const anchorIndex = href.indexOf("#");
  if (anchorIndex === -1) return { href, anchor: null };

  return {
    href: href.slice(0, anchorIndex),
    anchor: href.slice(anchorIndex + 1) || null,
  };
}

function escapeTitle(title: string): string {
  return title.replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
}

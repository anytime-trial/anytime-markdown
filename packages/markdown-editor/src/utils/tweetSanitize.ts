import DOMPurify from "dompurify";

export function sanitizeTweetHtml(html: string): string {
    return DOMPurify.sanitize(html, {
        ALLOWED_TAGS: ["blockquote", "p", "a", "br"],
        ALLOWED_ATTR: ["class", "lang", "dir", "href", "data-dnt", "data-theme", "target", "rel"],
        FORBID_TAGS: ["script", "iframe", "object", "embed", "style"],
    });
}

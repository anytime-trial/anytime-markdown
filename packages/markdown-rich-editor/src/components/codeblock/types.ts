/** DOMPurify config for HTML preview blocks */
export const HTML_SANITIZE_CONFIG = {
  ALLOWED_TAGS: [
    "div", "span", "p", "br", "hr",
    "h1", "h2", "h3", "h4", "h5", "h6",
    "ul", "ol", "li",
    "table", "thead", "tbody", "tfoot", "tr", "th", "td", "caption", "colgroup", "col",
    "strong", "em", "b", "i", "u", "s", "code", "pre", "sub", "sup", "mark", "small",
    "a", "img",
    "form", "input", "select", "option", "textarea", "button", "label", "fieldset", "legend",
    "details", "summary", "blockquote", "figure", "figcaption",
    "nav", "header", "footer", "main", "section", "article", "aside",
    "dl", "dt", "dd",
  ],
  ALLOWED_ATTR: [
    "class", "style", "id",
    "href", "src", "alt", "title", "target", "rel",
    "type", "name", "value", "placeholder", "for",
    "colspan", "rowspan", "width", "height",
    "rows", "open",
  ],
  ALLOW_DATA_ATTR: false,
};

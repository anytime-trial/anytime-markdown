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
    // HTML5 の埋め込みコンテンツ。`iframe` / `object` / `embed` / `script` は外部文書と
    // スクリプトを持ち込むため入れない（media 要素は再生するだけで実行経路を持たない）。
    "video", "audio", "source", "track", "picture",
  ],
  ALLOWED_ATTR: [
    "class", "style", "id",
    "href", "src", "alt", "title", "target", "rel",
    "type", "name", "value", "placeholder", "for",
    "colspan", "rowspan", "width", "height",
    "rows", "open",
    // media 要素の再生制御・ソース指定。`on*` は allowlist 方式なので自動的に落ちる。
    "controls", "muted", "loop", "autoplay", "playsinline", "preload", "poster",
    "srcset", "sizes", "media", "kind", "srclang", "label", "default",
    // 別オリジンの字幕トラックは crossorigin が無いと読み込まれない。track だけ許可して
    // これを落とすと、要素は出るのに字幕が出ない「半分だけ動く」状態になる。
    "crossorigin",
  ],
  ALLOW_DATA_ATTR: false,
};

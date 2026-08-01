/**
 * embedViews.ts — embed 各種ビュー（YouTube / Spotify / Figma / Drawio / Twitter / OGP カード）の
 * バニラ DOM ファクトリ。
 *
 * React 実装（markdown-react-islands/src/components/embed/）の素 DOM 版。
 * テーマは --am-color-* CSS 変数で追従し、isDark は iframe パラメータが必要な箇所のみ使用する。
 * React / JSX を import しない。
 */

import { ensureStyle, svgIcon } from "@anytime-markdown/ui-core/dom";
import { createSkeleton } from "@anytime-markdown/ui-core/Skeleton";
import { createIconButton } from "@anytime-markdown/ui-core/IconButton";
import { createTooltip } from "@anytime-markdown/ui-core/Tooltip";
import type { EmbedProviders } from "../../types/embedProvider";
import { getDivider, getBgPaper, getTextPrimary, getTextSecondary, getWarningMain } from "../../constants/colors";
import { DEFAULT_EMBED_BASELINE, type EmbedBaseline } from "../../utils/embedInfoString";
import { markEmbedSeen } from "../../utils/embedSeenStore";
import { sanitizeTweetHtml } from "../../utils/tweetSanitize";
import {
  createEmbedFetchController,
  createUpdateCheckController,
  type FetchState,
  type UpdateCheckState,
} from "./embedData";
import type { OgpData, OembedData } from "../../types/embedProvider";

/** t 未指定時のフォールバック（キーをそのまま返す）。CodeBlockBlockContent と同パターン。 */
const identityT = (key: string): string => key;

// ===== 共有スタイル注入 =====

const EMBED_STYLE_ID = "am-embed-views-styles";

function ensureEmbedStyles(): void {
  ensureStyle(
    EMBED_STYLE_ID,
    // EmbedUpdateBadge.module.css の素 CSS 版
    `.am-embed-badge{` +
      `position:absolute;top:4px;right:4px;` +
      `color:var(--am-color-primary-main);` +
      `background-color:var(--am-color-bg-paper);}` +
      `.am-embed-badge:hover:not(:disabled){background-color:var(--am-color-action-hover);}` +
      // compact バー共通
      `.am-embed-bar{` +
      `display:flex;align-items:center;gap:8px;` +
      `border-radius:4px;max-width:720px;height:40px;` +
      `padding:0 12px;overflow:hidden;` +
      `text-decoration:none;color:inherit;}` +
      // 省略テキスト
      `.am-embed-ellipsis{` +
      `white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1;min-width:0;}`,
  );
}

// ===== SVG パス定数（ui/icons 相当） =====

/** PlayArrowIcon */
const PATH_PLAY = "M8 5v14l11-7z";
/** MusicNoteIcon */
const PATH_MUSIC = "M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z";
/** HexagonOutlinedIcon */
const PATH_HEXAGON =
  "M17.2 2H6.8L1 12l5.8 10h10.4L23 12 17.2 2zm-1.15 18H7.95L4.08 12l3.87-8h8.1l3.87 8-3.87 8z";
/** LinkIcon */
const PATH_LINK =
  "M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z";
/** FiberManualRecordIcon（更新バッジ用の点）*/
const PATH_DOT = "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z";
/** LinkOffIcon（プレースホルダ用） */
const PATH_LINK_OFF =
  "m13.41 10.83 1.42 1.42c.39.39 1.02.39 1.41 0l3.54-3.54c1.56-1.56 1.56-4.09 0-5.66-1.56-1.56-4.09-1.56-5.66 0l-3.54 3.54c-.38.38-.38 1.03 0 1.41l1.42 1.42c.38.39 1.03.39 1.41 0l3.54-3.54c.78-.78 2.05-.78 2.83 0 .78.78.78 2.05 0 2.83L16 10.59l-.59-.59 1.41-1.41-2.83-2.83-1.41 1.41.58.58-1.76 1.76-.59-.6zM4.83 13.17l-1.42-1.42a.9959.9959 0 0 0-1.41 0c-1.56 1.56-1.56 4.09 0 5.66 1.56 1.56 4.09 1.56 5.66 0l3.54-3.54c.39-.38.39-1.03 0-1.41L9.78 11.04c-.38-.38-1.03-.38-1.41 0L4.83 14.58c-.78.78-2.05.78-2.83 0-.78-.78-.78-2.05 0-2.83l.58-.58-1.41-1.41-.59.59zM7 17H5v-2H3v-2h2v-2h2v2h2v2H7v2zm12-4h-2v2h-2v2h2v2h2v-2h2v-2h-2v-2z";

// ===== ヘルパー =====

function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function extractTextExcerpt(html: string): string {
  let text = "";
  let inTag = false;
  let prevSpace = true;
  for (const ch of html) {
    if (ch === "<") { inTag = true; continue; }
    if (ch === ">") { inTag = false; if (!prevSpace) { text += " "; prevSpace = true; } continue; }
    if (inTag) continue;
    const isSpace = ch === " " || ch === "\n" || ch === "\r" || ch === "\t" || ch === "\f";
    if (isSpace) { if (!prevSpace) { text += " "; prevSpace = true; } continue; }
    text += ch; prevSpace = false;
  }
  return text.trim().slice(0, 50);
}

function iframeHeightForSpotify(type: string): number {
  if (type === "track") return 80;
  if (type === "artist") return 380;
  return 152;
}

function extractFileName(urlOrPath: string): string {
  try {
    const u = new URL(urlOrPath);
    const last = u.pathname.split("/").filter(Boolean).at(-1);
    return last ?? u.hostname;
  } catch {
    const segments = urlOrPath.split("/").filter(Boolean);
    return segments.at(-1) ?? "Figma";
  }
}

function makeIframe(
  src: string,
  opts: {
    title: string;
    allow?: string;
    allowFullscreen?: boolean;
    referrerPolicy?: string;
    loading?: string;
    style?: Partial<CSSStyleDeclaration>;
  },
): HTMLIFrameElement {
  const iframe = document.createElement("iframe");
  iframe.src = src;
  iframe.title = opts.title;
  if (opts.allow) iframe.allow = opts.allow;
  if (opts.allowFullscreen) iframe.allowFullscreen = true;
  if (opts.referrerPolicy) iframe.referrerPolicy = opts.referrerPolicy as ReferrerPolicy;
  iframe.loading = (opts.loading ?? "lazy") as "eager" | "lazy";
  iframe.style.border = "0";
  if (opts.style) {
    for (const [k, v] of Object.entries(opts.style)) {
      if (v == null) continue;
      (iframe.style as unknown as Record<string, string>)[k] = String(v);
    }
  }
  return iframe;
}

function makeCompactBar(
  href: string,
  iconPath: string | readonly string[],
  iconColor: string,
  labelText: string,
  isDark: boolean,
): HTMLAnchorElement {
  const bar = document.createElement("a");
  bar.href = href;
  bar.target = "_blank";
  bar.rel = "noopener noreferrer";
  bar.className = "am-embed-bar";
  bar.style.border = `1px solid ${getDivider(isDark)}`;
  bar.style.backgroundColor = getBgPaper(isDark);

  const icon = svgIcon(iconPath, 16);
  icon.style.color = iconColor;
  icon.style.flexShrink = "0";
  bar.appendChild(icon);

  const label = document.createElement("span");
  label.className = "am-embed-ellipsis";
  label.style.color = getTextPrimary(isDark);
  label.style.fontSize = "14px";
  label.textContent = labelText;
  bar.appendChild(label);

  return bar;
}

// ===== YouTube ビュー =====

interface YouTubeViewResult {
  el: HTMLElement;
  destroy(): void;
}

export function createYouTubeView(
  videoId: string,
  variant: "card" | "compact",
  widthOverride: string | undefined,
  isDark: boolean,
): YouTubeViewResult {
  ensureEmbedStyles();
  const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;

  if (variant === "compact") {
    const el = makeCompactBar(watchUrl, PATH_PLAY, "#FF0000", `YouTube: ${videoId}`, isDark);
    return { el, destroy() { /* nothing */ } };
  }

  const el = document.createElement("div");
  el.style.position = "relative";
  el.style.width = widthOverride ?? "100%";
  el.style.maxWidth = widthOverride ?? "720px";
  el.style.paddingTop = "56.25%";
  el.style.borderRadius = "4px";
  el.style.overflow = "hidden";
  el.style.backgroundColor = "var(--am-color-bg-paper)";

  const iframe = makeIframe(
    `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}`,
    {
      title: `YouTube: ${videoId}`,
      allow: "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture",
      allowFullscreen: true,
      referrerPolicy: "strict-origin-when-cross-origin",
      style: { position: "absolute", inset: "0", width: "100%", height: "100%" },
    },
  );
  el.appendChild(iframe);

  return { el, destroy() { /* nothing */ } };
}

// ===== Spotify ビュー =====

interface SpotifyViewResult {
  el: HTMLElement;
  destroy(): void;
}

export function createSpotifyView(
  spotifyType: string,
  spotifyId: string,
  variant: "card" | "compact",
  widthOverride: string | undefined,
  isDark: boolean,
): SpotifyViewResult {
  ensureEmbedStyles();
  const pageUrl = `https://open.spotify.com/${spotifyType}/${spotifyId}`;

  if (variant === "compact") {
    const el = makeCompactBar(pageUrl, PATH_MUSIC, "#1DB954", `Spotify: ${spotifyId}`, isDark);
    el.style.border = `1px solid ${getDivider(isDark)}`;
    el.style.backgroundColor = getBgPaper(isDark);
    return { el, destroy() { /* nothing */ } };
  }

  const height = iframeHeightForSpotify(spotifyType);
  const embedSrc = `https://open.spotify.com/embed/${encodeURIComponent(spotifyType)}/${encodeURIComponent(spotifyId)}`;

  const el = document.createElement("div");
  el.style.width = widthOverride ?? "100%";
  el.style.maxWidth = widthOverride ?? "720px";
  el.style.borderRadius = "4px";
  el.style.overflow = "hidden";

  const iframe = makeIframe(embedSrc, {
    title: `Spotify ${spotifyType}: ${spotifyId}`,
    allow: "autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture",
    referrerPolicy: "strict-origin-when-cross-origin",
    style: { width: "100%", height: `${height}px` },
  });
  el.appendChild(iframe);

  return { el, destroy() { /* nothing */ } };
}

// ===== Figma ビュー =====

interface FigmaViewResult {
  el: HTMLElement;
  destroy(): void;
}

export function createFigmaView(
  path: string,
  variant: "card" | "compact",
  widthOverride: string | undefined,
  isDark: boolean,
): FigmaViewResult {
  ensureEmbedStyles();
  const canonical = `https://www.figma.com${path}`;
  const fileName = extractFileName(canonical);

  if (variant === "compact") {
    const el = makeCompactBar(canonical, PATH_HEXAGON, getTextSecondary(isDark), fileName, isDark);
    return { el, destroy() { /* nothing */ } };
  }

  const embedSrc = `https://www.figma.com/embed?embed_host=anytime-markdown&url=${encodeURIComponent(canonical)}`;

  const el = document.createElement("div");
  el.style.position = "relative";
  el.style.width = widthOverride ?? "100%";
  el.style.maxWidth = widthOverride ?? "720px";
  el.style.paddingTop = "75%";
  el.style.borderRadius = "4px";
  el.style.overflow = "hidden";
  el.style.border = `1px solid ${getDivider(isDark)}`;

  const iframe = makeIframe(embedSrc, {
    title: `Figma: ${fileName}`,
    allowFullscreen: true,
    referrerPolicy: "strict-origin-when-cross-origin",
    style: { position: "absolute", inset: "0", width: "100%", height: "100%" },
  });
  el.appendChild(iframe);

  return { el, destroy() { /* nothing */ } };
}

// ===== Draw.io ビュー =====

interface DrawioViewResult {
  el: HTMLElement;
  destroy(): void;
}

export function createDrawioView(
  url: string,
  variant: "card" | "compact",
  widthOverride: string | undefined,
  isDark: boolean,
): DrawioViewResult {
  ensureEmbedStyles();
  const fileName = extractFileName(url);

  if (variant === "compact") {
    const el = makeCompactBar(url, PATH_HEXAGON, getTextSecondary(isDark), fileName, isDark);
    return { el, destroy() { /* nothing */ } };
  }

  const embedSrc = `https://viewer.diagrams.net/?embed=1&ui=min&lightbox=0#U${encodeURIComponent(url)}`;

  const el = document.createElement("div");
  el.style.position = "relative";
  el.style.width = widthOverride ?? "100%";
  el.style.maxWidth = widthOverride ?? "720px";
  el.style.paddingTop = "75%";
  el.style.borderRadius = "4px";
  el.style.overflow = "hidden";
  el.style.border = `1px solid ${getDivider(isDark)}`;

  const iframe = makeIframe(embedSrc, {
    title: `Draw.io: ${fileName}`,
    referrerPolicy: "strict-origin-when-cross-origin",
    style: { position: "absolute", inset: "0", width: "100%", height: "100%" },
  });
  el.appendChild(iframe);

  return { el, destroy() { /* nothing */ } };
}

// ===== Twitter ビュー =====
//
// widgets.js 等のリモートスクリプトの読み込みは consumer が注入する
// `providers.loadTweetWidgets` フックに委譲する。共有モジュールはリモート
// エンドポイントを一切持たない（Chrome MV3 のリモートホストコード禁止対策）。

interface TwitterViewResult {
  el: HTMLElement;
  destroy(): void;
}

export function createTwitterView(
  url: string,
  variant: "card" | "compact",
  widthOverride: string | undefined,
  providers: EmbedProviders,
  isDark: boolean,
): TwitterViewResult {
  ensureEmbedStyles();

  // ローディングスケルトン
  const { el: skeletonEl } = createSkeleton({
    variant: "rectangular",
    height: variant === "compact" ? 40 : 180,
    style: { maxWidth: "720px", display: "block" },
  });

  const container = document.createElement("div");
  container.appendChild(skeletonEl);

  const oembed = createEmbedFetchController<OembedData>();
  let destroyed = false;

  oembed.subscribe((state: FetchState<OembedData>) => {
    if (destroyed) return;

    // skeleton を除去
    container.innerHTML = "";

    if (state.loading) {
      const { el: sk } = createSkeleton({
        variant: "rectangular",
        height: variant === "compact" ? 40 : 180,
        style: { maxWidth: "720px", display: "block" },
      });
      container.appendChild(sk);
      return;
    }

    if (state.error || !state.data) {
      const a = document.createElement("a");
      a.href = url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.style.color = getWarningMain(isDark);
      a.textContent = `⚠ ${url}`;
      container.appendChild(a);
      return;
    }

    const data = state.data;
    if (variant === "compact") {
      const author = data.authorName ?? "";
      const excerpt = extractTextExcerpt(data.html);

      const a = document.createElement("a");
      a.href = url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.style.textDecoration = "none";
      a.style.color = "inherit";
      a.style.display = "block";

      const bar = document.createElement("div");
      bar.className = "am-embed-bar";
      bar.style.border = `1px solid ${getDivider(isDark)}`;
      bar.style.backgroundColor = getBgPaper(isDark);

      const authorSpan = document.createElement("span");
      authorSpan.style.fontSize = "14px";
      authorSpan.style.color = getTextPrimary(isDark);
      authorSpan.style.fontWeight = "600";
      authorSpan.textContent = `@${author}`;
      bar.appendChild(authorSpan);

      const excerptSpan = document.createElement("span");
      excerptSpan.className = "am-embed-ellipsis";
      excerptSpan.style.fontSize = "13px";
      excerptSpan.style.color = getTextSecondary(isDark);
      excerptSpan.textContent = `· ${excerpt}`;
      bar.appendChild(excerptSpan);

      a.appendChild(bar);
      container.appendChild(a);
      return;
    }

    // card variant: サニタイズ済み HTML を埋め込む
    const tweetContainer = document.createElement("div");
    tweetContainer.style.width = widthOverride ?? "100%";
    tweetContainer.style.maxWidth = widthOverride ?? "720px";
    tweetContainer.innerHTML = sanitizeTweetHtml(data.html);
    container.appendChild(tweetContainer);

    // ウィジェット昇格（widgets.js の読み込み等）は consumer に委譲する。
    // 未提供時は静的な blockquote のまま表示する。
    providers.loadTweetWidgets?.(tweetContainer);
  });

  oembed.fetch(url, "oembed", providers.fetchOembed);

  return {
    el: container,
    destroy() {
      destroyed = true;
      oembed.cancel();
    },
  };
}

// ===== OGP カードビュー =====

interface OgpCardViewResult {
  el: HTMLElement;
  destroy(): void;
}

export function createOgpCardView(
  url: string,
  variant: "card" | "compact",
  widthOverride: string | undefined,
  providers: EmbedProviders,
  baseline: EmbedBaseline | undefined,
  onBaselineWrite: ((b: EmbedBaseline) => void) | undefined,
  isDark: boolean,
  t?: ((key: string) => string) | null,
): OgpCardViewResult {
  ensureEmbedStyles();
  const resolvedT = t ?? identityT;

  const effectiveBaseline = baseline ?? DEFAULT_EMBED_BASELINE;
  const noopWrite = (_b: EmbedBaseline): void => undefined;
  const writeBaseline = onBaselineWrite ?? noopWrite;

  const container = document.createElement("div");

  // ローディングスケルトン
  const cardWidthStyle: Partial<CSSStyleDeclaration> =
    widthOverride
      ? { width: widthOverride }
      : { width: "100%", maxWidth: "720px" };
  const { el: initSkel } = createSkeleton({
    variant: "rectangular",
    height: variant === "compact" ? 40 : 140,
    style: { display: "block", ...cardWidthStyle },
  });
  container.appendChild(initSkel);

  const ogp = createEmbedFetchController<OgpData>();
  const updateCheck = createUpdateCheckController();
  let destroyed = false;
  let badgeEl: HTMLElement | null = null;
  let tooltipDestroy: (() => void) | null = null;

  function removeBadge(): void {
    if (badgeEl) {
      tooltipDestroy?.();
      tooltipDestroy = null;
      badgeEl.remove();
      badgeEl = null;
    }
  }

  function renderBadge(cardEl: HTMLElement, fingerprint: string, newTitle: string | null): void {
    removeBadge();
    const title = newTitle
      ? `${resolvedT("mdEmbedUpdateAvailable")}: ${newTitle}`
      : resolvedT("mdEmbedUpdateAvailableGeneric");
    const { el: btn } = createIconButton({
      size: "small",
      ariaLabel: resolvedT("mdEmbedUpdateBadgeAriaLabel"),
      className: "am-embed-badge",
    });

    const icon = svgIcon(PATH_DOT, 16);
    btn.appendChild(icon);

    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      markEmbedSeen(url, fingerprint);
      removeBadge();
    });

    const { destroy: ttDestroy } = createTooltip({ reference: btn, title });
    tooltipDestroy = ttDestroy;
    badgeEl = btn;
    cardEl.appendChild(btn);
  }

  function onUpdateCheckState(state: UpdateCheckState, cardEl: HTMLElement, fp: string | null): void {
    if (destroyed) return;
    if (variant === "card" && state.status === "unseen" && fp) {
      renderBadge(cardEl, fp, state.newTitle);
    }
  }

  ogp.subscribe((state: FetchState<OgpData>) => {
    if (destroyed) return;

    container.innerHTML = "";
    removeBadge();

    if (state.loading) {
      const { el: sk } = createSkeleton({
        variant: "rectangular",
        height: variant === "compact" ? 40 : 140,
        style: { display: "block", ...cardWidthStyle },
      });
      container.appendChild(sk);
      return;
    }

    const domain = getDomain(state.data?.url ?? url);
    const title = state.data?.title ?? url;
    const description = state.data?.description ?? "";
    const image = state.data?.image;
    const favicon = state.data?.favicon;

    if (variant === "compact") {
      const a = document.createElement("a");
      a.href = url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.style.textDecoration = "none";
      a.style.color = "inherit";
      a.style.display = "block";

      const bar = document.createElement("div");
      bar.className = "am-embed-bar";
      bar.style.border = `1px solid ${getDivider(isDark)}`;
      bar.style.backgroundColor = getBgPaper(isDark);

      if (favicon) {
        const img = document.createElement("img");
        img.src = favicon;
        img.alt = "";
        img.loading = "lazy";
        img.style.width = "16px";
        img.style.height = "16px";
        img.style.flexShrink = "0";
        bar.appendChild(img);
      } else {
        const icon = svgIcon(PATH_LINK, 16);
        icon.style.color = getTextSecondary(isDark);
        icon.style.flexShrink = "0";
        bar.appendChild(icon);
      }

      const titleSpan = document.createElement("span");
      titleSpan.className = "am-embed-ellipsis";
      titleSpan.style.color = getTextPrimary(isDark);
      titleSpan.style.fontSize = "14px";
      titleSpan.textContent = title;
      bar.appendChild(titleSpan);

      const domainSpan = document.createElement("span");
      domainSpan.style.color = getTextSecondary(isDark);
      domainSpan.style.fontSize = "12px";
      domainSpan.style.flexShrink = "0";
      domainSpan.textContent = domain;
      bar.appendChild(domainSpan);

      a.appendChild(bar);
      container.appendChild(a);
      return;
    }

    // card variant
    const a = document.createElement("a");
    a.href = url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.style.textDecoration = "none";
    a.style.color = "inherit";
    a.style.display = "block";

    const card = document.createElement("div");
    card.style.border = `1px solid ${getDivider(isDark)}`;
    card.style.borderRadius = "4px";
    card.style.backgroundColor = getBgPaper(isDark);
    card.style.width = widthOverride ?? "100%";
    card.style.maxWidth = widthOverride ?? "720px";
    card.style.height = "140px";
    card.style.display = "flex";
    card.style.overflow = "hidden";
    card.style.position = "relative";

    // テキストエリア
    const textArea = document.createElement("div");
    textArea.style.flex = "1";
    textArea.style.minWidth = "0";
    textArea.style.padding = "12px";
    textArea.style.display = "flex";
    textArea.style.flexDirection = "column";
    textArea.style.justifyContent = "space-between";

    const topDiv = document.createElement("div");
    topDiv.style.minHeight = "0";
    topDiv.style.overflow = "hidden";

    const titleEl = document.createElement("span");
    titleEl.style.color = getTextPrimary(isDark);
    titleEl.style.fontSize = "15px";
    titleEl.style.fontWeight = "600";
    titleEl.style.display = "-webkit-box";
    titleEl.style.setProperty("-webkit-line-clamp", "2");
    titleEl.style.setProperty("-webkit-box-orient", "vertical");
    titleEl.style.overflow = "hidden";
    titleEl.textContent = title;
    topDiv.appendChild(titleEl);

    if (description) {
      const descEl = document.createElement("span");
      descEl.style.color = getTextSecondary(isDark);
      descEl.style.fontSize = "13px";
      descEl.style.marginTop = "4px";
      descEl.style.display = "-webkit-box";
      descEl.style.setProperty("-webkit-line-clamp", "2");
      descEl.style.setProperty("-webkit-box-orient", "vertical");
      descEl.style.overflow = "hidden";
      descEl.textContent = description;
      topDiv.appendChild(descEl);
    }
    textArea.appendChild(topDiv);

    // ボトム: favicon + domain
    const bottomRow = document.createElement("div");
    bottomRow.style.display = "flex";
    bottomRow.style.alignItems = "center";
    bottomRow.style.gap = "4px";

    if (favicon) {
      const img = document.createElement("img");
      img.src = favicon;
      img.alt = "";
      img.loading = "lazy";
      img.style.width = "14px";
      img.style.height = "14px";
      bottomRow.appendChild(img);
    } else {
      const icon = svgIcon(PATH_LINK, 14);
      icon.style.color = getTextSecondary(isDark);
      bottomRow.appendChild(icon);
    }

    const domainEl = document.createElement("span");
    domainEl.style.color = getTextSecondary(isDark);
    domainEl.style.fontSize = "12px";
    domainEl.textContent = domain;
    bottomRow.appendChild(domainEl);

    if (state.error) {
      const errEl = document.createElement("span");
      errEl.style.color = getWarningMain(isDark);
      errEl.style.fontSize = "12px";
      errEl.textContent = `⚠ ${state.error}`;
      bottomRow.appendChild(errEl);
    }
    textArea.appendChild(bottomRow);
    card.appendChild(textArea);

    if (image) {
      const img = document.createElement("img");
      img.src = image;
      img.alt = "";
      img.loading = "lazy";
      img.style.width = "180px";
      img.style.height = "100%";
      img.style.objectFit = "cover";
      img.style.flexShrink = "0";
      card.appendChild(img);
    }

    a.appendChild(card);
    container.appendChild(a);

    // RSS 更新チェック（card variant のみ）
    if (state.data) {
      updateCheck.subscribe((uc: UpdateCheckState) => {
        onUpdateCheckState(uc, card, uc.fingerprint);
      });
      updateCheck.check(url, state.data, providers, effectiveBaseline, writeBaseline);
    }
  });

  ogp.fetch(url, "ogp", providers.fetchOgp);

  return {
    el: container,
    destroy() {
      destroyed = true;
      ogp.cancel();
      updateCheck.cancel();
      removeBadge();
    },
  };
}

// ===== プレースホルダ =====

export function createPlaceholderBox(message: string): HTMLElement {
  ensureEmbedStyles();
  const el = document.createElement("div");
  el.style.display = "flex";
  el.style.flexDirection = "row";
  el.style.alignItems = "center";
  el.style.gap = "8px";
  el.style.border = "1px dashed var(--am-color-divider)";
  el.style.borderRadius = "4px";
  el.style.backgroundColor = "var(--am-color-action-hover)";
  el.style.maxWidth = "720px";
  el.style.padding = "8px 12px";

  const icon = svgIcon(PATH_LINK_OFF, 16);
  icon.style.color = "var(--am-color-text-secondary)";
  el.appendChild(icon);

  const text = document.createElement("span");
  text.style.color = "var(--am-color-text-secondary)";
  text.style.fontSize = "13px";
  text.textContent = message;
  el.appendChild(text);

  return el;
}

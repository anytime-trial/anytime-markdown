/**
 * createEmbedPreview.ts — EmbedMountHandle の vanilla DOM 実装。
 *
 * React 実装（markdown-react-islands/src/rich/embedPreviewMount.ts）の置換。
 * 既存の `EmbedMountHandle` 契約（previewContracts.ts）に完全準拠する。
 *
 * embed 種別ごとに embedViews.ts の各 createXxxView を呼び出し、
 * embedProviders.ts から EmbedProviders を取得する（未設定時はプレースホルダ表示）。
 *
 * React / JSX を import しない。
 */

import {
  type EmbedBaseline,
  parseBaseline,
  parseEmbedInfoString,
} from "../../utils/embedInfoString";
import { classifyEmbedUrl } from "../../utils/embedClassifier";
import { getEmbedProviders } from "../../embedProviders";
import {
  createYouTubeView,
  createSpotifyView,
  createFigmaView,
  createDrawioView,
  createTwitterView,
  createOgpCardView,
  createPlaceholderBox,
} from "./embedViews";

// ===== 型定義 =====

/**
 * embed プレビューのマウントハンドル型（正規ホーム）。
 * rich の `previewContracts` はここから再 export して消費する（viewer は rich に依存しないため
 * 実装側＝viewer に置く）。
 */
export interface EmbedMountHandle {
  /** language(info string) / body / 幅 を反映して再描画する。 */
  render(
    language: string,
    body: string,
    widthOverride: string | undefined,
    onBaselineWrite: (b: EmbedBaseline) => void,
  ): void;
  destroy(): void;
}

// ===== ヘルパー =====

function extractUrl(body: string): string | null {
  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line) return line;
  }
  return null;
}

/**
 * container の computed style から dark テーマかを判定する。
 * host（vanillaMarkdownEditor の applyCodeCssVars）が editor root へ書く `--am-editor-dark`
 * （"1"/"0"）をカスタムプロパティ継承で読む（CodeBlockBlockContent.isEditorDark と同一機構）。
 */
function detectIsDark(el: Element): boolean {
  if (typeof document === "undefined") return false;
  return getComputedStyle(el).getPropertyValue("--am-editor-dark").trim() === "1";
}

/** t 未指定時のフォールバック（キーをそのまま返す）。CodeBlockBlockContent と同パターン。 */
const identityT = (key: string): string => key;

/** 各ビューの再描画キーに共通する接尾辞（variant / 幅 / テーマ） */
function viewKeySuffix(
  variant: "card" | "compact",
  effectiveWidth: string | undefined,
  isDark: boolean,
): string {
  return `${variant}:${effectiveWidth ?? ""}:${String(isDark)}`;
}

// ===== 内部状態型 =====

interface CurrentView {
  /** マウントしたビューの destroy 関数 */
  destroy(): void;
  /** 引数キー（同じなら再描画をスキップ） */
  key: string;
}

// ===== ファクトリ =====

/**
 * embed プレビューの vanilla DOM マウントハンドルを生成する。
 *
 * @param container - コンテンツを mount する親 HTMLElement。
 * @param t - i18n。未指定時（未 configure）はキーをそのまま表示する identityT へフォールバックする。
 * @returns EmbedMountHandle — render() / destroy() の契約を満たす。
 */
export function createEmbedPreview(
  container: HTMLElement,
  t?: ((key: string) => string) | null,
): EmbedMountHandle {
  const resolvedT = t ?? identityT;
  let currentView: CurrentView | null = null;

  function clearView(): void {
    if (currentView) {
      currentView.destroy();
      currentView = null;
    }
    container.innerHTML = "";
  }

  function mount(el: HTMLElement, key: string, destroy: () => void): void {
    clearView();
    container.appendChild(el);
    currentView = { destroy, key };
  }

  /** 引数キーが現在の描画と同一なら再描画をスキップし、異なるときだけ create() をマウントする */
  function renderKeyed(
    key: string,
    create: () => { el: HTMLElement; destroy: () => void },
  ): void {
    if (currentView?.key === key) return;
    const { el, destroy } = create();
    mount(el, key, destroy);
  }

  /** プレースホルダを描画する（静的 DOM のため destroy は何もしない） */
  function renderPlaceholder(key: string, messageKey: string): void {
    renderKeyed(key, () => ({
      el: createPlaceholderBox(resolvedT(messageKey)),
      destroy: () => { /* static placeholder */ },
    }));
  }

  const handle: EmbedMountHandle = {
    render(
      language: string,
      body: string,
      widthOverride: string | undefined,
      onBaselineWrite: (b: EmbedBaseline) => void,
    ): void {
      const variantInfo = parseEmbedInfoString(language) ?? { variant: "card" as const, width: null };
      const variant = variantInfo.variant as "card" | "compact";
      const effectiveWidth = variant === "card" ? widthOverride : undefined;

      const url = extractUrl(body);
      if (!url) {
        renderPlaceholder(`placeholder:no-url`, "mdEmbedInvalidUrl");
        return;
      }

      const classified = classifyEmbedUrl(url);
      if (!classified) {
        renderPlaceholder(`placeholder:unclassified:${url}`, "mdEmbedUnclassifiedUrl");
        return;
      }

      const isDark = detectIsDark(container);
      const keySuffix = viewKeySuffix(variant, effectiveWidth, isDark);

      if (classified.kind === "youtube") {
        const videoId = classified.videoId;
        renderKeyed(`youtube:${videoId}:${keySuffix}`, () =>
          createYouTubeView(videoId, variant, effectiveWidth, isDark));
        return;
      }

      if (classified.kind === "figma") {
        const path = classified.path;
        renderKeyed(`figma:${path}:${keySuffix}`, () =>
          createFigmaView(path, variant, effectiveWidth, isDark));
        return;
      }

      if (classified.kind === "spotify") {
        const { type, id } = classified;
        renderKeyed(`spotify:${type}:${id}:${keySuffix}`, () =>
          createSpotifyView(type, id, variant, effectiveWidth, isDark));
        return;
      }

      if (classified.kind === "drawio") {
        const drawioUrl = classified.url;
        renderKeyed(`drawio:${drawioUrl}:${keySuffix}`, () =>
          createDrawioView(drawioUrl, variant, effectiveWidth, isDark));
        return;
      }

      // Twitter / OGP はプロバイダが必要
      const providers = getEmbedProviders();

      if (!providers) {
        renderPlaceholder(`placeholder:no-providers:${url}`, "mdEmbedProvidersMissing");
        return;
      }

      if (classified.kind === "twitter") {
        const tweetUrl = classified.url;
        renderKeyed(`twitter:${tweetUrl}:${keySuffix}`, () =>
          createTwitterView(tweetUrl, variant, effectiveWidth, providers, isDark));
        return;
      }

      // OGP カード（kind === "ogp"）
      const baseline = parseBaseline(language);
      const ogpUrl = classified.url;
      renderKeyed(`ogp:${ogpUrl}:${keySuffix}`, () =>
        createOgpCardView(
          ogpUrl,
          variant,
          effectiveWidth,
          providers,
          baseline,
          onBaselineWrite,
          isDark,
          resolvedT,
        ));
    },

    destroy(): void {
      clearView();
    },
  };

  return handle;
}

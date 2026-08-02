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
        const key = `placeholder:no-url`;
        if (currentView?.key === key) return;
        const el = createPlaceholderBox(resolvedT("mdEmbedInvalidUrl"));
        mount(el, key, () => { /* static placeholder */ });
        return;
      }

      const classified = classifyEmbedUrl(url);
      if (!classified) {
        const key = `placeholder:unclassified:${url}`;
        if (currentView?.key === key) return;
        const el = createPlaceholderBox(resolvedT("mdEmbedUnclassifiedUrl"));
        mount(el, key, () => { /* static placeholder */ });
        return;
      }

      const isDark = detectIsDark(container);

      if (classified.kind === "youtube") {
        const key = `youtube:${classified.videoId}:${variant}:${effectiveWidth ?? ""}:${String(isDark)}`;
        if (currentView?.key === key) return;
        const { el, destroy } = createYouTubeView(classified.videoId, variant, effectiveWidth, isDark);
        mount(el, key, destroy);
        return;
      }

      if (classified.kind === "figma") {
        const key = `figma:${classified.path}:${variant}:${effectiveWidth ?? ""}:${String(isDark)}`;
        if (currentView?.key === key) return;
        const { el, destroy } = createFigmaView(classified.path, variant, effectiveWidth, isDark);
        mount(el, key, destroy);
        return;
      }

      if (classified.kind === "spotify") {
        const key = `spotify:${classified.type}:${classified.id}:${variant}:${effectiveWidth ?? ""}:${String(isDark)}`;
        if (currentView?.key === key) return;
        const { el, destroy } = createSpotifyView(classified.type, classified.id, variant, effectiveWidth, isDark);
        mount(el, key, destroy);
        return;
      }

      if (classified.kind === "drawio") {
        const key = `drawio:${classified.url}:${variant}:${effectiveWidth ?? ""}:${String(isDark)}`;
        if (currentView?.key === key) return;
        const { el, destroy } = createDrawioView(classified.url, variant, effectiveWidth, isDark);
        mount(el, key, destroy);
        return;
      }

      // Twitter / OGP はプロバイダが必要
      const providers = getEmbedProviders();

      if (!providers) {
        const key = `placeholder:no-providers:${url}`;
        if (currentView?.key === key) return;
        const el = createPlaceholderBox(resolvedT("mdEmbedProvidersMissing"));
        mount(el, key, () => { /* static placeholder */ });
        return;
      }

      if (classified.kind === "twitter") {
        const key = `twitter:${classified.url}:${variant}:${effectiveWidth ?? ""}:${String(isDark)}`;
        if (currentView?.key === key) return;
        const { el, destroy } = createTwitterView(classified.url, variant, effectiveWidth, providers, isDark);
        mount(el, key, destroy);
        return;
      }

      // OGP カード（kind === "ogp"）
      const baseline = parseBaseline(language);
      const key = `ogp:${classified.url}:${variant}:${effectiveWidth ?? ""}:${String(isDark)}`;
      if (currentView?.key === key) return;
      const { el, destroy } = createOgpCardView(
        classified.url,
        variant,
        effectiveWidth,
        providers,
        baseline,
        onBaselineWrite,
        isDark,
        resolvedT,
      );
      mount(el, key, destroy);
    },

    destroy(): void {
      clearView();
    },
  };

  return handle;
}

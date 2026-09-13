'use client';

// barrel ではなく用途別の公開 subpath を使う（barrel は appLowlight 等まで再エクスポートするため、
// 設定 1 つのためにエディタ全体のモジュールグラフを起動してしまう）。
import { DEFAULT_SETTINGS } from '@anytime-markdown/markdown-editor/settings';
import { createMarkdownT } from '@anytime-markdown/markdown-editor/i18n/translator';
import type { MeasurePreset } from '@anytime-markdown/markdown-editor/utils/measure-preset';
import { Alert, Box, Button, CircularProgress } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { useLocaleSwitch } from '../LocaleProvider';
import { usePreset, useThemeMode } from '../providers';
import { EmbedProvidersBoundary } from '../providers/EmbedProvidersBoundary';
import StaticMarkdownHtml from './StaticMarkdownHtml';

/**
 * サーバ生成の本文 HTML を、対話ビューアが立ち上がるまでの表示として配る。
 *
 * context を経由するのは、`next/dynamic` の `loading` がモジュールスコープで固定され、
 * 呼び出し側から props を渡せないため。ここを spinner のままにすると、チャンク取得の間だけ
 * 一度描画した本文がスピナーへ差し替わる（内容が消えて見える）。
 */
const StaticBodyContext = createContext<string | null>(null);

/**
 * サーバ生成の本文があればそれを、無ければスピナーを出す。
 * 「読み込み中」の表示が 2 系統（本文 fetch 中とチャンク取得中）あるため、両方でこれを使う。
 */
const ViewerLoading = () => {
  const staticHtml = useContext(StaticBodyContext);
  if (staticHtml) return <StaticMarkdownHtml html={staticHtml} />;
  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
      <CircularProgress aria-label="Loading viewer" />
    </Box>
  );
};

// 脱React G4: vanilla orchestrator（rich codeblock 注入版）へ一本化
const VanillaRichMarkdownEditor = dynamic(() => import('./VanillaRichMarkdownEditor'), {
  ssr: false,
  loading: ViewerLoading,
});

// read-only・最小（chromeless）表示用の Web Component ラッパ（minimal 指定時に使用）。
const VanillaMarkdownView = dynamic(() => import('./VanillaMarkdownView'), {
  ssr: false,
  loading: ViewerLoading,
});

interface MarkdownViewerProps {
  /** S3 ドキュメントキー（デコード済み、例: "docs/markdownAll/markdownAll.ja.md"） */
  docKey: string;
  /** ロケール別の docKey マップ（例: { en: "docs/markdownAll/markdownAll.en.md" }）。未指定ロケールは docKey を使用 */
  docKeyByLocale?: Partial<Record<string, string>>;
  /** コンテナの最小高さ */
  minHeight?: string;
  /** エディタの高さ（px） */
  editorHeight?: number;
  /** スクロールなしで全体表示 */
  noScroll?: boolean;
  /** コンテンツ取得APIのパス（デフォルト: '/api/docs/content'） */
  contentApiPath?: string;
  /** フロントマターブロックの表示（デフォルト: false） */
  showFrontmatter?: boolean;
  /** エディタ下部の追加オフセット（px） */
  bottomOffset?: number;
  /** ロケール別キーが見つからない場合のフォールバックキー（言語サフィックスなしファイル等） */
  fallbackDocKey?: string;
  /** read-only・最小（ツールバー/ステータスバー非表示）の Web Component 表示にする（report 記事等）。 */
  minimal?: boolean;
  /** 本文カラム幅（measure）プリセット。未指定時は既定（standard）。report 記事は "wide" 等を指定。 */
  measure?: MeasurePreset;
  /**
   * サーバ側で生成済みの本文 HTML。対話ビューアは `ssr: false` でサーバ側に何も出さないため、
   * これを渡した呼び出し元だけが「クローラと初回表示に本文が届く」状態になる。
   */
  staticHtml?: string;
}

export default function MarkdownViewer({ docKey, docKeyByLocale, minHeight = '60vh', editorHeight, noScroll, contentApiPath = '/api/docs/content', showFrontmatter, bottomOffset: _bottomOffset, fallbackDocKey, minimal, measure, staticHtml }: Readonly<MarkdownViewerProps>) {
  const t = useTranslations('Landing');
  const { themeMode, setThemeMode } = useThemeMode();
  const { presetName, setPresetName } = usePreset();
  const { locale, setLocale } = useLocaleSwitch();
  const muiTheme = useTheme();
  const isBelowMd = useMediaQuery(muiTheme.breakpoints.down('md'));
  const vanillaT = useMemo(() => createMarkdownT('MarkdownEditor', locale), [locale]);
  // measure（本文カラム幅）指定時のみ settings を上書きする。安定参照のため memo 化し
  // mount の不要な再適用を防ぐ（未指定時は undefined＝既定 standard）。
  const editorSettings = useMemo(
    () => (measure ? { ...DEFAULT_SETTINGS, measure } : undefined),
    [measure],
  );

  // ロケールに応じた docKey を決定
  const resolvedDocKey = docKeyByLocale?.[locale] ?? docKey;

  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const editorKeyRef = useRef(0);

  const fetchContent = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${contentApiPath}?key=${encodeURIComponent(resolvedDocKey)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      setContent(text);
      editorKeyRef.current += 1;
    } catch {
      // ロケール別キーで失敗した場合、フォールバックキー（言語サフィックスなしファイル）を試行
      if (fallbackDocKey) {
        try {
          const res = await fetch(`${contentApiPath}?key=${encodeURIComponent(fallbackDocKey)}`);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const text = await res.text();
          setContent(text);
          editorKeyRef.current += 1;
          return;
        } catch { /* フォールバックも失敗 */ }
      }
      setError(t('docsViewLoadError'));
    } finally {
      setLoading(false);
    }
  }, [resolvedDocKey, fallbackDocKey, contentApiPath, t]);

  useEffect(() => {
    fetchContent();
  }, [fetchContent]);

  // サーバ生成の本文がある間はスピナーを出さない。ここがサーバの返す HTML そのものなので、
  // スピナーに差し替えるとクローラの見る本文が消える（この画面が空ページ化していた原因）。
  if (loading) {
    if (staticHtml) return <StaticMarkdownHtml html={staticHtml} />;
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight }} role="status">
        <CircularProgress aria-label="Loading" />
      </Box>
    );
  }

  if (error || content === null) {
    // 本文が既にサーバ側で描画されている場合、取得失敗は「対話ビューアへ昇格できない」
    // 縮退でしかない。本文を消してエラーだけ出すと読める記事が読めなくなるため、
    // 本文は残したまま失敗を告知する（黙って握り潰さない）。
    const severity = staticHtml ? 'warning' : 'error';
    return (
      <>
        <Box sx={{ px: 3, py: 4 }}>
          <Alert
            severity={severity}
            action={
              <Button color="inherit" size="small" onClick={fetchContent}>
                {t('docsViewRetry')}
              </Button>
            }
          >
            {error ?? t('docsViewLoadError')}
          </Alert>
        </Box>
        {staticHtml && <StaticMarkdownHtml html={staticHtml} />}
      </>
    );
  }

  // minimal 時は read-only・chromeless の `<anytime-markdown-view>` 経由（report 記事等）。
  const EditorComponent = minimal ? VanillaMarkdownView : VanillaRichMarkdownEditor;

  return (
    <StaticBodyContext.Provider value={staticHtml ?? null}>
    <Box sx={{ minHeight, overflow: 'hidden' }}>
      <EmbedProvidersBoundary>
      {/* 脱React G4: bottomOffset は vanilla 未対応（fixedEditorHeight で代替）。 */}
      <EditorComponent
        key={editorKeyRef.current}
        t={vanillaT}
        locale={locale}
        initialContent={content}
        readOnly
        hideStatusBar
        noScroll={noScroll}
        settings={editorSettings}
        fixedEditorHeight={editorHeight}
        initialFontSize={isBelowMd ? 14 : undefined}
        defaultBlockAlign="left"
        themeMode={themeMode}
        onThemeModeChange={setThemeMode}
        presetName={presetName}
        onPresetChange={setPresetName}
        onLocaleChange={setLocale}
        showFrontmatter={showFrontmatter}
      />
      </EmbedProvidersBoundary>
    </Box>
    </StaticBodyContext.Provider>
  );
}

'use client';

import { Alert, Box, Button, CircularProgress } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';

import { useLocaleSwitch } from '../LocaleProvider';
import { usePreset, useThemeMode } from '../providers';
import { EmbedProvidersBoundary } from '../providers/EmbedProvidersBoundary';

const MarkdownEditorPage = dynamic(
  () => import('@anytime-markdown/markdown-core/src/MarkdownEditorPage'),
  {
    ssr: false,
    loading: () => (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <CircularProgress aria-label="Loading viewer" />
      </Box>
    ),
  }
);

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
}

export default function MarkdownViewer({ docKey, docKeyByLocale, minHeight = '60vh', editorHeight, noScroll, contentApiPath = '/api/docs/content', showFrontmatter, bottomOffset, fallbackDocKey }: Readonly<MarkdownViewerProps>) {
  const t = useTranslations('Landing');
  const { themeMode, setThemeMode } = useThemeMode();
  const { presetName, setPresetName } = usePreset();
  const { locale, setLocale } = useLocaleSwitch();
  const muiTheme = useTheme();
  const isBelowMd = useMediaQuery(muiTheme.breakpoints.down('md'));

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

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight }} role="status">
        <CircularProgress aria-label="Loading" />
      </Box>
    );
  }

  if (error || content === null) {
    return (
      <Box sx={{ px: 3, py: 4 }}>
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={fetchContent}>
              {t('docsViewRetry')}
            </Button>
          }
        >
          {error ?? t('docsViewLoadError')}
        </Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ minHeight, overflow: 'hidden' }}>
      <EmbedProvidersBoundary>
      <MarkdownEditorPage
        key={editorKeyRef.current}
        externalContent={content}
        readOnly
        hideStatusBar
        noScroll={noScroll}
        fixedEditorHeight={editorHeight}
        initialFontSize={isBelowMd ? 14 : undefined}
        defaultBlockAlign="left"
        themeMode={themeMode}
        onThemeModeChange={setThemeMode}
        presetName={presetName}
        onPresetChange={setPresetName}
        onLocaleChange={setLocale}
        showFrontmatter={showFrontmatter}
        bottomOffset={bottomOffset}
      />
      </EmbedProvidersBoundary>
    </Box>
  );
}

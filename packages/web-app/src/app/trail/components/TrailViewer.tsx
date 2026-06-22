'use client';

import type { DocLink } from '@anytime-markdown/trail-core/c4';
import { TrailViewerApp, applyTrailThemeVars } from '@anytime-markdown/trail-viewer';
import CloseIcon from '@mui/icons-material/Close';
import { Box, Dialog, DialogContent, DialogTitle, IconButton } from '@mui/material';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import { useLocaleSwitch } from '../../LocaleProvider';
import { useThemeMode } from '../../providers';
import { TrailErrorBoundary } from './TrailErrorBoundary';

const MarkdownViewer = dynamic(() => import('../../components/MarkdownViewer'), { ssr: false });

/**
 * web アプリの Trail Viewer ラッパー。
 *
 * 共通の TrailViewerApp に同居 Next.js API ルート（serverUrl=''）を渡すだけのシェル。
 * editable は true（グループ機能などの編集操作を有効化）。doc link はポップアップで表示。
 */
export function TrailViewer({
  containerHeight = 'calc(100vh - 64px)',
  initialTab: initialTabProp,
  initialC4Level: initialC4LevelProp,
}: Readonly<{ containerHeight?: string; initialTab?: number; initialC4Level?: number }> = {}) {
  const { themeMode } = useThemeMode();
  const isDark = themeMode === 'dark';
  // vanilla UI（ui-core）の --am-color-* テーマ変数をホスト側で注入する
  // （素 DOM コンポーネントは擬似クラス等のスタイルを自己注入するため injectTrailUiStyles は不要）。
  useEffect(() => {
    applyTrailThemeVars(isDark);
  }, [isDark]);
  const { locale } = useLocaleSwitch();
  const searchParams = useSearchParams();
  const [docPopupDoc, setDocPopupDoc] = useState<DocLink | null>(null);

  const tabParam = searchParams.get('tab');
  const initialTab = initialTabProp ?? (tabParam === null ? undefined : Number(tabParam));

  const c4LevelParam = searchParams.get('c4level');
  const initialC4Level = initialC4LevelProp ?? (c4LevelParam === null ? undefined : Number(c4LevelParam));

  const handleDocLinkClick = useCallback((doc: DocLink) => {
    setDocPopupDoc(doc);
  }, []);

  const handleCloseDocPopup = useCallback(() => {
    setDocPopupDoc(null);
  }, []);

  return (
    <TrailErrorBoundary>
      <TrailViewerApp
        serverUrl=""
        editable
        isDark={isDark}
        locale={locale}
        containerHeight={containerHeight}
        onDocLinkClick={handleDocLinkClick}
        initialTab={initialTab}
        initialC4Level={initialC4Level}
        disableWebSocket
      />
      {docPopupDoc && (
        <Dialog
          open
          onClose={handleCloseDocPopup}
          maxWidth="lg"
          fullWidth
          slotProps={{
            paper: {
              sx: {
                height: '80vh',
                display: 'flex',
                flexDirection: 'column',
                bgcolor: isDark ? 'rgba(18,18,18,0.96)' : 'rgba(251,249,243,0.98)',
                backgroundImage: 'none',
              },
            },
          }}
        >
          <DialogTitle
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              py: 1,
              px: 2,
              borderBottom: 1,
              borderColor: 'divider',
              flexShrink: 0,
            }}
          >
            <Box sx={{ fontSize: '0.9rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {docPopupDoc.title}
            </Box>
            <IconButton size="small" onClick={handleCloseDocPopup} aria-label="Close document">
              <CloseIcon fontSize="small" />
            </IconButton>
          </DialogTitle>
          <DialogContent sx={{ p: 0, flex: 1, overflow: 'hidden' }}>
            <MarkdownViewer
              docKey={docPopupDoc.path}
              contentApiPath="/api/docs/github-content"
              minHeight="calc(80vh - 60px)"
            />
          </DialogContent>
        </Dialog>
      )}
    </TrailErrorBoundary>
  );
}

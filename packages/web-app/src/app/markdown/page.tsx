'use client';

import { COMMENT_PANEL_WIDTH } from '@anytime-markdown/markdown-core';
import { Alert, Box, CircularProgress, Snackbar } from '@mui/material';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useTranslations } from 'next-intl';

import { useLocaleSwitch } from '../LocaleProvider';
import { usePreset, useThemeMode } from '../providers';
import { useEditorPage } from './useEditorPage';

function EditorLoading() {
  const t = useTranslations('Common');
  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
      <CircularProgress aria-label={t('loadingEditor')} />
    </Box>
  );
}

const MarkdownEditorPage = dynamic(
  () => import('@anytime-markdown/markdown-core/src/MarkdownEditorPage'),
  { ssr: false, loading: () => <EditorLoading /> },
);

const ExplorerPanel = dynamic(
  () => import('../../components/ExplorerPanel').then((m) => ({ default: m.ExplorerPanel })),
  { ssr: false },
);

export default function Page() {
  const t = useTranslations('Common');
  const router = useRouter();
  const { themeMode, setThemeMode } = useThemeMode();
  const { presetName, setPresetName } = usePreset();
  const { setLocale } = useLocaleSwitch();
  const enableGitHub = process.env.NEXT_PUBLIC_ENABLE_GITHUB === '1';
  const showThemePreset = process.env.NEXT_PUBLIC_SHOW_THEME_PRESET === '1';
  const { data: session } = useSession();
  const isGitHubLoggedIn = enableGitHub && !!session;

  const {
    explorerOpen, externalContent, externalFileName, externalFilePath,
    externalCompareContent, editorKey, isDirty, newCommit,
    saveSnackbar, ssoSnackbar,
    handleToggleExplorer, handleExplorerSelectFile, handleExternalSave,
    handleCompareModeChange, handleExplorerSelectCommit, handleSelectCurrent,
    handleContentChange, setSsoSnackbar, setSaveSnackbar, fileSystemProvider,
  } = useEditorPage({ isGitHubLoggedIn, session, t });

  const explorerSlotNode = enableGitHub ? (
    <ExplorerPanel
      open={explorerOpen}
      width={COMMENT_PANEL_WIDTH}
      onSelectFile={handleExplorerSelectFile}
      onSelectCommit={handleExplorerSelectCommit}
      onSelectCurrent={handleSelectCurrent}
      isDirty={isDirty}
      newCommit={newCommit}
    />
  ) : undefined;

  return (
    <Box id="md-page-wrapper" sx={{ display: "flex", height: "100vh", overflow: "hidden" }}>
      <Box sx={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
        <MarkdownEditorPage
          key={editorKey}
          themeMode={themeMode}
          onThemeModeChange={setThemeMode}
          presetName={showThemePreset ? presetName : undefined}
          onPresetChange={showThemePreset ? setPresetName : undefined}
          onLocaleChange={setLocale}
          fileSystemProvider={fileSystemProvider}
          onCompareModeChange={handleCompareModeChange}
          externalCompareContent={externalCompareContent}
          explorerOpen={enableGitHub ? explorerOpen : false}
          onToggleExplorer={enableGitHub ? handleToggleExplorer : undefined}
          externalContent={externalContent}
          externalFileName={externalFileName}
          externalFilePath={externalFilePath}
          onExternalSave={isGitHubLoggedIn ? handleExternalSave : undefined}
          readOnly={externalContent !== undefined}
          showReadonlyMode={process.env.NEXT_PUBLIC_SHOW_READONLY_MODE === "1"}
          sideToolbar
          explorerSlot={explorerSlotNode}
          onHomeClick={() => router.push('/')}
          onContentChange={handleContentChange}
          gridRows={process.env.NEXT_PUBLIC_GRID_ROWS ? Number(process.env.NEXT_PUBLIC_GRID_ROWS) : undefined}
          gridCols={process.env.NEXT_PUBLIC_GRID_COLS ? Number(process.env.NEXT_PUBLIC_GRID_COLS) : undefined}
        />
      </Box>
      <Snackbar
        open={!!ssoSnackbar}
        autoHideDuration={4000}
        onClose={() => setSsoSnackbar(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setSsoSnackbar(null)}
          severity="info"
          variant="filled"
          role="status"
          sx={{ width: '100%' }}
        >
          {ssoSnackbar}
        </Alert>
      </Snackbar>
      <Snackbar
        open={!!saveSnackbar}
        autoHideDuration={4000}
        onClose={() => setSaveSnackbar(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setSaveSnackbar(null)}
          severity={saveSnackbar?.severity ?? 'info'}
          variant="filled"
          role="status"
          sx={{ width: '100%' }}
        >
          {saveSnackbar?.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}

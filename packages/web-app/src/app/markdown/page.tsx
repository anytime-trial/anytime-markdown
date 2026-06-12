'use client';

import { COMMENT_PANEL_WIDTH, createMarkdownT, getDefaultContent } from '@anytime-markdown/markdown-viewer';
import { Alert, Box, CircularProgress, Snackbar } from '@mui/material';
import dynamic from 'next/dynamic';
import { useSession } from 'next-auth/react';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useMemo, useState } from 'react';

import LandingHeader from '../components/LandingHeader';
import { useLocaleSwitch } from '../LocaleProvider';
import { usePreset, useThemeMode } from '../providers';
import { EmbedProvidersBoundary } from '../providers/EmbedProvidersBoundary';
import { useEditorPage } from './useEditorPage';

function EditorLoading() {
  const t = useTranslations('Common');
  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
      <CircularProgress aria-label={t('loadingEditor')} />
    </Box>
  );
}

const ExplorerPanel = dynamic(
  () => import('../../components/ExplorerPanel').then((m) => ({ default: m.ExplorerPanel })),
  { ssr: false },
);

// 脱React G4: vanilla orchestrator（rich codeblock 注入版）へ一本化
const VanillaRichMarkdownEditor = dynamic(
  () => import('../components/VanillaRichMarkdownEditor'),
  { ssr: false, loading: () => <EditorLoading /> },
);

export default function Page() {
  const t = useTranslations('Common');

  const { themeMode, setThemeMode } = useThemeMode();
  const { presetName, setPresetName } = usePreset();
  const { setLocale } = useLocaleSwitch();
  const enableGitHub = process.env.NEXT_PUBLIC_ENABLE_GITHUB === '1';
  const showThemePreset = process.env.NEXT_PUBLIC_SHOW_THEME_PRESET === '1';
  const { data: session } = useSession();
  const isGitHubLoggedIn = enableGitHub && !!session;

  const {
    externalContent, externalFileName,
    externalCompareContent, editorKey, isDirty, newCommit,
    saveSnackbar, ssoSnackbar,
    handleExplorerSelectFile, handleExternalSave,
    handleCompareModeChange, handleExplorerSelectCommit, handleSelectCurrent,
    handleContentChange, setSsoSnackbar, setSaveSnackbar, fileSystemProvider,
  } = useEditorPage({ isGitHubLoggedIn, session, t });

  const locale = useLocale();
  const vanillaT = useMemo(() => createMarkdownT('MarkdownEditor', locale), [locale]);
  // explorer 開閉は orchestrator の mode 状態（onModeChange）から同期する（脱React G4）。
  const [explorerOpenV, setExplorerOpenV] = useState(false);
  const handleVanillaModeChange = useCallback(
    (state: { explorerOpen?: boolean }) => setExplorerOpenV(state.explorerOpen === true),
    [],
  );

  return (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      <LandingHeader />
      <Box id="md-page-wrapper" sx={{ display: "flex", flex: 1, overflow: "hidden" }}>
      <Box sx={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
        <EmbedProvidersBoundary>
        <VanillaRichMarkdownEditor
          key={`${editorKey}-${locale}`}
          t={vanillaT}
          locale={locale}
          themeMode={themeMode}
          onThemeModeChange={setThemeMode}
          presetName={showThemePreset ? presetName : undefined}
          onPresetChange={showThemePreset ? setPresetName : undefined}
          onLocaleChange={setLocale}
          fileSystemProvider={fileSystemProvider}
          onCompareModeChange={handleCompareModeChange}
          externalCompareContent={externalCompareContent}
          initialContent={externalContent ?? getDefaultContent(locale)}
          persistDraft={externalContent === undefined}
          fileName={externalFileName}
          onExternalSave={isGitHubLoggedIn ? handleExternalSave : undefined}
          readOnly={externalContent !== undefined}
          showReadonlyMode={process.env.NEXT_PUBLIC_SHOW_READONLY_MODE === "1"}
          sideToolbar
          hide={{ explorer: !enableGitHub }}
          onModeChange={handleVanillaModeChange}
          onContentChange={handleContentChange}
          gridRows={process.env.NEXT_PUBLIC_GRID_ROWS ? Number(process.env.NEXT_PUBLIC_GRID_ROWS) : undefined}
          gridCols={process.env.NEXT_PUBLIC_GRID_COLS ? Number(process.env.NEXT_PUBLIC_GRID_COLS) : undefined}
        />
        </EmbedProvidersBoundary>
      </Box>
      {enableGitHub && (
        <ExplorerPanel
          open={explorerOpenV}
          width={COMMENT_PANEL_WIDTH}
          onSelectFile={handleExplorerSelectFile}
          onSelectCommit={handleExplorerSelectCommit}
          onSelectCurrent={handleSelectCurrent}
          isDirty={isDirty}
          newCommit={newCommit}
        />
      )}
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
    </Box>
  );
}

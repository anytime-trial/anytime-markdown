'use client';

import { COMMENT_PANEL_WIDTH, createMarkdownT, getDefaultContent } from '@anytime-markdown/markdown-viewer';
import { STORAGE_KEY_CONTENT } from '@anytime-markdown/markdown-viewer/src/constants/storageKeys';
import GitHubIcon from '@mui/icons-material/GitHub';
import {
  Alert, Box, Button, CircularProgress, Snackbar,
} from '@mui/material';
import dynamic from 'next/dynamic';
import { signIn, useSession } from 'next-auth/react';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { CommitMessageDialog } from '../../components/CommitMessageDialog';
import { CommitToGitHubDialog } from '../../components/CommitToGitHubDialog';
import { DriveConflictDialog } from '../../components/DriveConflictDialog';
import { DriveSaveAsDialog } from '../../components/DriveSaveAsDialog';
import { downloadMarkdownBlob } from '../../lib/webImportProvider';
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
    saveSnackbar, ssoSnackbar, driveConflict, hasDriveFile,
    commitMessageDialog, commitToGitHubDialog,
    handleExplorerSelectFile, handleExternalSave,
    handleCompareModeChange, handleExplorerSelectCommit, handleSelectCurrent,
    handleContentChange, setSsoSnackbar, setSaveSnackbar, fileSystemProvider,
    handleDriveOpen, handleDriveConflictOverwrite, handleDriveConflictCancel,
    driveSaveAsDialog, handleSaveToDriveClick, handleSaveToDriveConfirm, handleSaveToDriveCancel,
    handleCommitMessageConfirm, handleCommitMessageCancel,
    handleOpenCommitToGitHub, handleCloseCommitToGitHub, handleCommitToGitHubConfirm,
  } = useEditorPage({ isGitHubLoggedIn, session, t });
  // 保存を外部（GitHub/Drive）へルーティングするか。Drive は enableGitHub フラグに依存しない独立経路のため OR で判定する。
  const canExternalSave = isGitHubLoggedIn || hasDriveFile;

  const locale = useLocale();
  const vanillaT = useMemo(() => createMarkdownT('MarkdownEditor', locale), [locale]);
  // エディタが現在マウントしている本文（persistDraft 時は localStorage 下書きが実体・useEditorPage.ts 452行目相当のフォールバック）。
  // handleContentChange 経由で currentContentRef へ同期し、無編集のまま「GitHub にコミット」しても最新本文を取得できるようにする。
  const resolvedInitialContent = useMemo(() => {
    if (externalContent !== undefined) return externalContent;
    if (typeof window !== 'undefined') {
      const draft = localStorage.getItem(STORAGE_KEY_CONTENT);
      if (draft != null) return draft;
    }
    return getDefaultContent(locale);
    // editorKey は本文自体には現れないが「新しいソースがマウントされた」トリガとして必須の依存。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalContent, locale, editorKey]);
  useEffect(() => {
    handleContentChange(resolvedInitialContent);
  }, [resolvedInitialContent, handleContentChange]);

  const handleCommitToGitHubClick = useCallback(() => {
    if (!isGitHubLoggedIn) {
      void signIn('github');
      return;
    }
    handleOpenCommitToGitHub(externalFileName ?? 'document.md');
  }, [isGitHubLoggedIn, externalFileName, handleOpenCommitToGitHub]);
  // explorer 開閉は orchestrator の mode 状態（onModeChange）から同期する（脱React G4）。
  const [explorerOpenV, setExplorerOpenV] = useState(false);
  const handleVanillaModeChange = useCallback(
    (state: { explorerOpen?: boolean }) => setExplorerOpenV(state.explorerOpen === true),
    [],
  );
  const fileHandlers = useMemo(
    () => ({
      onWebImportCreate: (markdown: string, title: string) => {
        downloadMarkdownBlob(markdown, title);
      },
      // 注入するとツールバーの「開く」がメニュー化され、Drive が選択肢に並ぶ。
      onOpenFromDrive: handleDriveOpen,
      // 注入すると保存メニューに「Google Drive に保存」が並ぶ。
      onSaveToDrive: () => handleSaveToDriveClick(externalFileName ?? 'document.md'),
    }),
    [handleDriveOpen, handleSaveToDriveClick, externalFileName],
  );

  return (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      <LandingHeader />
      <Box id="md-page-wrapper" sx={{ display: "flex", flex: 1, overflow: "hidden" }}>
      <Box sx={{ flex: 1, minWidth: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        {/* Drive から開く導線はエディタツールバーの「開く」メニューへ統合済み。
            残るのは GitHub コミットのみのため、無効時は帯ごと出さない。 */}
        {enableGitHub && (
        <Box
          sx={{
            display: "flex",
            justifyContent: "flex-end",
            alignItems: "center",
            gap: 1,
            px: 2,
            py: 0.5,
            // 小数高さ（ボタンの line-height 由来）だとツールバー以下が sub-pixel でずれるため整数に固定する
            minHeight: "40px",
            boxSizing: "border-box",
            borderBottom: 1,
            borderColor: "divider",
            flexShrink: 0,
          }}
        >
          <Button
            onClick={handleCommitToGitHubClick}
            aria-label={t('githubCommitButtonAria')}
            size="small"
            startIcon={<GitHubIcon sx={{ fontSize: 18 }} />}
            sx={{
              textTransform: "none",
              fontSize: "0.8rem",
              color: "text.secondary",
              "&:hover": { color: "text.primary" },
            }}
          >
            {t('githubCommitButton')}
          </Button>
        </Box>
        )}
        <Box sx={{ flex: 1, minHeight: 0 }}>
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
          onExternalSave={canExternalSave ? handleExternalSave : undefined}
          readOnly={externalContent !== undefined}
          showReadonlyMode={process.env.NEXT_PUBLIC_SHOW_READONLY_MODE === "1"}
          sideToolbar
          hide={{ explorer: !enableGitHub }}
          fileHandlers={fileHandlers}
          onModeChange={handleVanillaModeChange}
          onContentChange={handleContentChange}
          gridRows={process.env.NEXT_PUBLIC_GRID_ROWS ? Number(process.env.NEXT_PUBLIC_GRID_ROWS) : undefined}
          gridCols={process.env.NEXT_PUBLIC_GRID_COLS ? Number(process.env.NEXT_PUBLIC_GRID_COLS) : undefined}
        />
        </EmbedProvidersBoundary>
        </Box>
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
      <DriveSaveAsDialog
        open={driveSaveAsDialog?.open ?? false}
        defaultName={driveSaveAsDialog?.defaultName ?? 'document.md'}
        onConfirm={handleSaveToDriveConfirm}
        onCancel={handleSaveToDriveCancel}
      />
      <DriveConflictDialog
        open={!!driveConflict}
        onOverwrite={handleDriveConflictOverwrite}
        onCancel={handleDriveConflictCancel}
      />
      <CommitMessageDialog
        open={!!commitMessageDialog}
        defaultMessage={commitMessageDialog?.defaultMessage ?? ''}
        onConfirm={handleCommitMessageConfirm}
        onCancel={handleCommitMessageCancel}
      />
      <CommitToGitHubDialog
        open={!!commitToGitHubDialog}
        defaultPath={commitToGitHubDialog?.defaultPath ?? 'document.md'}
        onConfirm={handleCommitToGitHubConfirm}
        onCancel={handleCloseCommitToGitHub}
      />
      </Box>
    </Box>
  );
}

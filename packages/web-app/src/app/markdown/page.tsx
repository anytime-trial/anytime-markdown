'use client';

import { COMMENT_PANEL_WIDTH, createMarkdownT, getDefaultContent } from '@anytime-markdown/markdown-viewer';
import { readDraft } from '@anytime-markdown/markdown-viewer/src/utils/draftStorage';
import {
  Alert, Box, CircularProgress, Snackbar,
} from '@mui/material';
import dynamic from 'next/dynamic';
import { signIn, useSession } from 'next-auth/react';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { CommitMessageDialog } from '../../components/CommitMessageDialog';
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

const GitHubRepoBrowser = dynamic(
  () => import('../../components/GitHubRepoBrowser').then((m) => ({ default: m.GitHubRepoBrowser })),
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
  const showThemePreset = process.env.NEXT_PUBLIC_SHOW_THEME_PRESET === '1';
  const { data: session } = useSession();
  const isGitHubLoggedIn = !!session;

  const {
    externalContent, externalFileName,
    externalCompareContent, editorKey, isDirty,
    saveSnackbar, ssoSnackbar, driveConflict, hasDriveFile, handleSaveTargetChange,
    commitMessageDialog, externalSaveKind,
    handleGitHubOpenFile, handleExternalSave,
    handleCompareModeChange,
    handleContentChange, setSsoSnackbar, setSaveSnackbar, fileSystemProvider,
    handleDriveOpen, handleDriveConflictOverwrite, handleDriveConflictCancel,
    driveSaveAsDialog, handleSaveToDriveClick, handleSaveToDriveConfirm, handleSaveToDriveCancel,
    handleCommitMessageConfirm, handleCommitMessageCancel,
  } = useEditorPage({ isGitHubLoggedIn, session, t });
  // 保存を外部（GitHub/Drive）へルーティングするか。Drive は GitHub サインインに依存しない独立経路のため OR で判定する。
  const canExternalSave = isGitHubLoggedIn || hasDriveFile;

  const locale = useLocale();
  const vanillaT = useMemo(() => createMarkdownT('MarkdownEditor', locale), [locale]);
  // エディタが現在マウントしている本文（persistDraft 時は localStorage 下書きが実体・useEditorPage.ts 452行目相当のフォールバック）。
  // handleContentChange 経由で currentContentRef へ同期し、無編集のまま Drive へ新規保存しても最新本文を取得できるようにする。
  const resolvedInitialContent = useMemo(() => {
    if (externalContent !== undefined) return externalContent;
    if (typeof window !== 'undefined') return readDraft(getDefaultContent(locale));
    return getDefaultContent(locale);
    // editorKey は本文自体には現れないが「新しいソースがマウントされた」トリガとして必須の依存。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalContent, locale, editorKey]);
  useEffect(() => {
    handleContentChange(resolvedInitialContent);
  }, [resolvedInitialContent, handleContentChange]);

  // 「GitHub から開く」ダイアログ。未サインインならサインインへ誘導する。
  const [gitHubPickerOpen, setGitHubPickerOpen] = useState(false);
  const handleOpenFromGitHub = useCallback(() => {
    if (!isGitHubLoggedIn) {
      void signIn('github');
      return;
    }
    setGitHubPickerOpen(true);
  }, [isGitHubLoggedIn]);
  const fileHandlers = useMemo(
    () => ({
      onWebImportCreate: (markdown: string, title: string) => {
        downloadMarkdownBlob(markdown, title);
      },
      // 注入するとツールバーの「開く」がメニュー化され、Drive / GitHub が選択肢に並ぶ。
      onOpenFromDrive: handleDriveOpen,
      onOpenFromGitHub: handleOpenFromGitHub,
      // 注入すると保存メニューに「Google Drive に保存」が並ぶ。
      onSaveToDrive: () => handleSaveToDriveClick(externalFileName ?? 'document.md'),
    }),
    [handleDriveOpen, handleOpenFromGitHub, handleSaveToDriveClick, externalFileName],
  );

  return (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      <LandingHeader />
      <Box id="md-page-wrapper" sx={{ display: "flex", flex: 1, overflow: "hidden" }}>
      <Box sx={{ flex: 1, minWidth: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        {/* Drive / GitHub の開く・保存はすべてエディタツールバーのメニューへ統合済み。
            GitHub から開いたファイルの上書き保存がそのままコミットになる。 */}
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
          externalSaveKind={externalSaveKind}
          onSaveTargetChange={handleSaveTargetChange}
          readOnly={externalContent !== undefined}
          showReadonlyMode={process.env.NEXT_PUBLIC_SHOW_READONLY_MODE === "1"}
          sideToolbar
          // Explorer パネルは廃止済み。トグルを出すと開く先が無いため抑止する。
          hide={{ explorer: true }}
          fileHandlers={fileHandlers}
          onContentChange={handleContentChange}
          gridRows={process.env.NEXT_PUBLIC_GRID_ROWS ? Number(process.env.NEXT_PUBLIC_GRID_ROWS) : undefined}
          gridCols={process.env.NEXT_PUBLIC_GRID_COLS ? Number(process.env.NEXT_PUBLIC_GRID_COLS) : undefined}
        />
        </EmbedProvidersBoundary>
        </Box>
      </Box>
      <GitHubRepoBrowser
        open={gitHubPickerOpen}
        onClose={() => setGitHubPickerOpen(false)}
        onSelect={(repo, filePath, branch) => void handleGitHubOpenFile(repo, filePath, branch)}
      />
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
      </Box>
    </Box>
  );
}

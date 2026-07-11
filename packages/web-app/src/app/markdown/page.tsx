'use client';

import { COMMENT_PANEL_WIDTH, createMarkdownT, getDefaultContent } from '@anytime-markdown/markdown-viewer';
import { readDraft } from '@anytime-markdown/markdown-viewer/src/utils/draftStorage';
import {
  Alert, Box, CircularProgress, Snackbar,
} from '@mui/material';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useLocale, useTranslations } from 'next-intl';
import { Suspense, useEffect, useMemo } from 'react';

import { CommitMessageDialog } from '../../components/CommitMessageDialog';
import { DiscardDraftDialog } from '../../components/DiscardDraftDialog';
import { DriveConflictDialog } from '../../components/DriveConflictDialog';
import { DriveSaveAsDialog } from '../../components/DriveSaveAsDialog';
import { resolveConnectedProviders } from '../../lib/connectedProviders';
import { downloadMarkdownBlob } from '../../lib/webImportProvider';
import LandingHeader from '../components/LandingHeader';
import { useLocaleSwitch } from '../LocaleProvider';
import { usePreset, useThemeMode } from '../providers';
import { EmbedProvidersBoundary } from '../providers/EmbedProvidersBoundary';
import { useDiscardDraftConfirm } from './useDiscardDraftConfirm';
import { useEditorPage } from './useEditorPage';
import { useGitHubPicker } from './useGitHubPicker';
import { useNoteGraphSlot } from './useNoteGraphSlot';

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

/**
 * Drive UI の「アプリで開く」は `?state=` を付けてこのページへ遷移する。
 * `useSearchParams` は Suspense 境界を要求するため、実体を内側のコンポーネントに置く。
 */
export default function Page() {
  return (
    <Suspense fallback={<EditorLoading />}>
      <EditorPage />
    </Suspense>
  );
}

function EditorPage() {
  const t = useTranslations('Common');
  const searchParams = useSearchParams();
  const driveOpenState = searchParams.get('state');
  const {
    open: discardDraftOpen,
    confirmDiscardDraft,
    onDiscard: handleDiscardDraft,
    onCancel: handleDiscardDraftCancel,
  } = useDiscardDraftConfirm();

  const { themeMode, setThemeMode } = useThemeMode();
  const { presetName, setPresetName } = usePreset();
  const { setLocale } = useLocaleSwitch();
  const showThemePreset = process.env.NEXT_PUBLIC_SHOW_THEME_PRESET === '1';
  const { data: session, status } = useSession();
  // GitHub / Google は同一 NextAuth セッションに同居する。`!!session` は「どれかにサインイン済み」
  // でしかないため、GitHub 接続はトークンの有無で判定する。
  // 読み込み中は undefined（未確定）。未接続と区別しないと、セッション解決が「今接続された」
  // 遷移と誤認され、リロードのたびに接続通知と本文リセットが走る。
  const isGitHubConnected = useMemo(
    () => (status === 'loading' ? undefined : resolveConnectedProviders(session).github),
    [session, status],
  );

  const {
    externalContent, externalFileName,
    externalCompareContent, editorKey, isDirty,
    saveSnackbar, ssoSnackbar, driveConflict, hasDriveFile, handleSaveTargetChange,
    commitMessageDialog, externalSaveKind, githubDoc,
    handleGitHubOpenFile, handleExternalSave,
    handleCompareModeChange,
    handleContentChange, setSsoSnackbar, setSaveSnackbar, fileSystemProvider,
    handleDriveOpen, handleDriveConflictOverwrite, handleDriveConflictCancel,
    driveSaveAsDialog, handleSaveToDriveClick, handleSaveToDriveConfirm, handleSaveToDriveCancel,
    handleCommitMessageConfirm, handleCommitMessageCancel,
  } = useEditorPage({ isGitHubConnected, t, driveOpenState, confirmDiscardDraft });
  // 保存を外部（GitHub/Drive）へルーティングするか。Drive は GitHub サインインに依存しない独立経路のため OR で判定する。
  const canExternalSave = isGitHubConnected || hasDriveFile;

  const locale = useLocale();
  const vanillaT = useMemo(() => createMarkdownT('MarkdownEditor', locale), [locale]);
  // GitHub から開いたときだけノート網スロットを供給する（それ以外は undefined＝ボタン非表示）。
  const noteGraphSlot = useNoteGraphSlot({
    enabled: externalSaveKind === 'github',
    repo: githubDoc?.repo,
    branch: githubDoc?.branch,
    currentPath: githubDoc?.path,
    themeMode,
    t: vanillaT,
    onOpenDoc: (path) => {
      if (githubDoc) void handleGitHubOpenFile(githubDoc.repo, path, githubDoc.branch);
    },
  });
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

  // 「GitHub から開く」ダイアログ。GitHub 未接続ならこの時点で初めて OAuth へ誘導する。
  const { gitHubPickerOpen, handleOpenFromGitHub, closeGitHubPicker } = useGitHubPicker({ isGitHubConnected });
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
          noteGraph={noteGraphSlot}
          // readOnly はホストが課す編集ロック（VS Code の Claude 編集中など）を表す。web-app に
          // ロック要件は無い。かつて `externalContent !== undefined` を渡していたが、GitHub 接続直後の
          // 空文書リセット（useEditorPage の setExternalContent("")）まで読み取り専用にしてしまい、
          // 本文が空のまま編集もモード切替もできなくなっていた。
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
        onClose={closeGitHubPicker}
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
      <DiscardDraftDialog
        open={discardDraftOpen}
        onDiscard={handleDiscardDraft}
        onCancel={handleDiscardDraftCancel}
      />
      </Box>
    </Box>
  );
}

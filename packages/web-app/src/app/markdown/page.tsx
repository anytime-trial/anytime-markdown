'use client';

import { COMMENT_PANEL_WIDTH,STORAGE_KEY_CONTENT } from '@anytime-markdown/editor-core';
import { Alert, Box, CircularProgress, Snackbar } from '@mui/material';
import dynamic from 'next/dynamic';
import { useSession } from 'next-auth/react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { FallbackFileSystemProvider } from '../../lib/FallbackFileSystemProvider';
import { WebFileSystemProvider } from '../../lib/WebFileSystemProvider';
import { useLocaleSwitch } from '../LocaleProvider';
import { usePreset, useThemeMode } from '../providers';

function EditorLoading() {
  const t = useTranslations('Common');
  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
      <CircularProgress aria-label={t('loadingEditor')} />
    </Box>
  );
}

const MarkdownEditorPage = dynamic(
  () => import('@anytime-markdown/editor-core/src/MarkdownEditorPage'),
  { ssr: false, loading: () => <EditorLoading /> },
);

const ExplorerPanel = dynamic(
  () => import('../../components/ExplorerPanel').then((m) => ({ default: m.ExplorerPanel })),
  { ssr: false },
);

import { fetchFileContent } from '../../lib/githubApi';

export default function Page() {
  const t = useTranslations('Common');
  const { themeMode, setThemeMode } = useThemeMode();
  const { presetName, setPresetName } = usePreset();
  const { setLocale } = useLocaleSwitch();
  const enableGitHub = process.env.NEXT_PUBLIC_ENABLE_GITHUB === '1';
  const showThemePreset = process.env.NEXT_PUBLIC_SHOW_THEME_PRESET === '1';
  const { data: session } = useSession();
  const isGitHubLoggedIn = enableGitHub && !!session;
  const [explorerOpen, setExplorerOpen] = useState(() => {
    if (typeof window === 'undefined') return false;
    return sessionStorage.getItem('explorerOpen') === '1';
  });
  const [externalContent, setExternalContent] = useState<string | undefined>(undefined);
  const [externalFileName, setExternalFileName] = useState<string | undefined>(undefined);
  const [externalFilePath, setExternalFilePath] = useState<string | undefined>(undefined);
  const [externalCompareContent, setExternalCompareContent] = useState<string | null>(null);
  const [compareModeOpen, setCompareModeOpen] = useState(false);
  const [editorKey, setEditorKey] = useState(0);
  const selectedFileRef = useRef<{ repo: string; filePath: string; branch: string } | null>(null);
  const selectedCommitContentRef = useRef<string | null>(null);
  const originalContentRef = useRef<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [newCommit, setNewCommit] = useState<{ sha: string; message: string; author: string; date: string } | null>(null);
  const [saveSnackbar, setSaveSnackbar] = useState<{ message: string; severity: 'success' | 'error' } | null>(null);

  // SSO ログイン状態で初回アクセス時に localStorage をクリアしパネルを開く
  useEffect(() => {
    if (!isGitHubLoggedIn) return;
    setExplorerOpen(true);
    // ファイル未選択時は defaultContent を非表示にする
    if (!selectedFileRef.current) {
      setExternalContent("");
      setEditorKey((k) => k + 1);
    }
    if (sessionStorage.getItem('ssoContentCleared') === '1') return;
    sessionStorage.setItem('ssoContentCleared', '1');
    try {
      localStorage.removeItem(STORAGE_KEY_CONTENT);
    } catch (e) {
      console.warn('Failed to clear localStorage:', e);
    }
  }, [isGitHubLoggedIn]);

  // localStorage への書き込みを監視して dirty 判定
  useEffect(() => {
    const origSetItem = localStorage.setItem.bind(localStorage);
    localStorage.setItem = (key: string, value: string) => {
      origSetItem(key, value);
      if (key === STORAGE_KEY_CONTENT && originalContentRef.current != null) {
        setIsDirty(value !== originalContentRef.current);
      }
    };
    return () => {
      localStorage.setItem = origSetItem;
    };
  }, []);

  const fileSystemProvider = useMemo(() => {
    if (typeof window === 'undefined') return null;
    const web = new WebFileSystemProvider();
    return web.supportsDirectAccess ? web : new FallbackFileSystemProvider();
  }, []);

  // SSO ログイン/ログアウト時にエディタを空の初期状態にリセット
  const prevSessionRef = useRef(session);
  const [ssoSnackbar, setSsoSnackbar] = useState<string | null>(null);
  useEffect(() => {
    if (prevSessionRef.current === session) return;
    const wasLoggedIn = !!prevSessionRef.current;
    const isNowLoggedIn = !!session;
    prevSessionRef.current = session;
    selectedFileRef.current = null;
    setExternalContent(undefined);
    setExternalFileName(undefined);
    setExternalFilePath(undefined);
    setExternalCompareContent(null);
    setEditorKey((k) => k + 1);
    if (isNowLoggedIn && !wasLoggedIn) {
      setSsoSnackbar(t('githubConnected'));
    } else if (!isNowLoggedIn && wasLoggedIn) {
      setSsoSnackbar(t('githubDisconnected'));
    }
  }, [session, t]);

  useEffect(() => {
    sessionStorage.setItem('explorerOpen', explorerOpen ? '1' : '0');
  }, [explorerOpen]);

  const handleToggleExplorer = useCallback(() => {
    setExplorerOpen((prev) => !prev);
  }, []);


  const handleExplorerSelectFile = useCallback(async (repo: string, filePath: string, branch: string) => {
    const prev = selectedFileRef.current;
    const isSameFile = prev?.repo === repo && prev?.filePath === filePath && prev?.branch === branch;
    selectedFileRef.current = { repo, filePath, branch };
    selectedCommitContentRef.current = null;
    if (isSameFile) return;
    // 別ファイル: 即座に dirty をリセット
    setIsDirty(false);
    const content = await fetchFileContent(repo, filePath, branch);
    originalContentRef.current = content;
    localStorage.setItem(STORAGE_KEY_CONTENT, content);
    setExternalContent(undefined);
    setExternalFileName(filePath.split("/").pop() ?? filePath);
    setExternalFilePath(filePath);
    setExternalCompareContent(null);
    setEditorKey((k) => k + 1);
  }, []);

  const handleExternalSave = useCallback(async (content: string) => {
    const sel = selectedFileRef.current;
    if (!sel) return;
    const res = await fetch('/api/github/content', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        repo: sel.repo,
        path: sel.filePath,
        content,
        branch: sel.branch,
      }),
    });
    if (res.ok) {
      originalContentRef.current = content;
      setIsDirty(false);
      const data = await res.json().catch(() => ({}));
      if (data.commit) {
        setNewCommit(data.commit);
      }
      setSaveSnackbar({ message: t('fileSaved'), severity: 'success' });
    } else {
      const err = await res.json().catch(() => ({}));
      console.warn('Failed to save to GitHub:', (err as { error?: string }).error);
      setSaveSnackbar({ message: t('saveError'), severity: 'error' });
    }
  }, [t]);

  const handleCompareModeChange = useCallback((active: boolean) => {
    setCompareModeOpen(active);
    if (active && selectedCommitContentRef.current != null) {
      // 比較モード切替: 左=localStorage の編集中データ、右=選択コミット
      const commit = selectedCommitContentRef.current;
      // refs をクリアして remount 時の再トリガーを防止
      selectedCommitContentRef.current = null;
      setExternalContent(undefined);
      setExternalCompareContent(commit);
      setEditorKey((k) => k + 1);
    }
  }, []);

  const handleExplorerSelectCommit = useCallback(async (repo: string, filePath: string, sha: string) => {
    const content = await fetchFileContent(repo, filePath, sha);
    if (!content && content !== '') return;
    if (compareModeOpen) {
      // 比較モード: 右パネルのみ更新（リマウントせずモードを維持）
      setExternalCompareContent(content);
    } else {
      // 通常モード: エディタに直接表示
      selectedCommitContentRef.current = content;
      setExternalContent(content);
      setExternalFileName(filePath.split("/").pop() ?? filePath);
      setExternalFilePath(filePath);
      setExternalCompareContent(null);
      setEditorKey((k) => k + 1);
    }
  }, [compareModeOpen]);

  // 編集中データに戻す
  const handleSelectCurrent = useCallback(() => {
    setExternalContent(undefined);
    // 比較モード: 右側を空欄にしてモード維持、通常モード: 比較を開かない
    setExternalCompareContent(compareModeOpen ? "" : null);
    setEditorKey((k) => k + 1);
  }, [compareModeOpen]);

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
    <Box sx={{ display: "flex", height: "100vh", overflow: "hidden" }}>
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

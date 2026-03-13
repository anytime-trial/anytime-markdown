'use client';

import { Alert, Box, CircularProgress, Snackbar } from '@mui/material';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useSession } from 'next-auth/react';

import { FallbackFileSystemProvider } from '../../lib/FallbackFileSystemProvider';
import { WebFileSystemProvider } from '../../lib/WebFileSystemProvider';
import { useLocaleSwitch } from '../LocaleProvider';
import { useThemeMode } from '../providers';

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

async function fetchFileContent(repo: string, filePath: string, branch: string): Promise<string> {
  const res = await fetch(
    `/api/github/content?repo=${encodeURIComponent(repo)}&path=${encodeURIComponent(filePath)}&ref=${encodeURIComponent(branch)}`,
  );
  if (!res.ok) return '';
  const data = await res.json();
  return data.content ?? '';
}

export default function Page() {
  const t = useTranslations('Common');
  const { themeMode, setThemeMode } = useThemeMode();
  const { setLocale } = useLocaleSwitch();
  const { data: session } = useSession();
  const isGitHubLoggedIn = !!session;
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
  const latestContentRef = useRef<string | null>(null);
  const selectedCommitContentRef = useRef<string | null>(null);

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
    selectedFileRef.current = { repo, filePath, branch };
    selectedCommitContentRef.current = null;
    const content = await fetchFileContent(repo, filePath, branch);
    latestContentRef.current = content;
    setExternalContent(content);
    setExternalFileName(filePath.split("/").pop() ?? filePath);
    setExternalFilePath(filePath);
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
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.warn('Failed to save to GitHub:', (err as { error?: string }).error);
    }
  }, []);

  const handleCompareModeChange = useCallback((active: boolean) => {
    setCompareModeOpen(active);
    if (active && selectedCommitContentRef.current != null && latestContentRef.current != null) {
      // 比較モード切替: 左=最新、右=選択コミット
      const latest = latestContentRef.current;
      const commit = selectedCommitContentRef.current;
      // refs をクリアして remount 時の再トリガーを防止
      selectedCommitContentRef.current = null;
      latestContentRef.current = null;
      setExternalContent(latest);
      setExternalCompareContent(commit);
      setEditorKey((k) => k + 1);
    }
  }, []);

  const handleExplorerSelectCommit = useCallback(async (repo: string, filePath: string, sha: string) => {
    const res = await fetch(
      `/api/github/content?repo=${encodeURIComponent(repo)}&path=${encodeURIComponent(filePath)}&ref=${encodeURIComponent(sha)}`,
    );
    if (!res.ok) return;
    const data = await res.json();
    const content = data.content ?? '';
    if (compareModeOpen) {
      // 比較モード: 右パネルにロード
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

  return (
    <Box sx={{ display: "flex", height: "100vh", overflow: "hidden" }}>
      <ExplorerPanel
        open={explorerOpen}
        onSelectFile={handleExplorerSelectFile}
        onSelectCommit={handleExplorerSelectCommit}
      />
      <Box sx={{ flex: 1, minWidth: 0, overflow: "auto" }}>
        <MarkdownEditorPage
          key={editorKey}
          themeMode={themeMode}
          onThemeModeChange={setThemeMode}
          onLocaleChange={setLocale}
          fileSystemProvider={fileSystemProvider}
          onCompareModeChange={handleCompareModeChange}
          externalCompareContent={externalCompareContent}
          explorerOpen={explorerOpen}
          onToggleExplorer={handleToggleExplorer}
          externalContent={externalContent}
          externalFileName={externalFileName}
          externalFilePath={externalFilePath}
          onExternalSave={isGitHubLoggedIn ? handleExternalSave : undefined}
          featuresUrl="/features"
          showReadonlyMode={process.env.NEXT_PUBLIC_SHOW_READONLY_MODE === "1"}
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
    </Box>
  );
}

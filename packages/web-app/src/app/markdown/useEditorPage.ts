'use client';

import { STORAGE_KEY_CONTENT } from '@anytime-markdown/markdown-core/src/constants/storageKeys';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { FallbackFileSystemProvider } from '../../lib/FallbackFileSystemProvider';
import { WebFileSystemProvider } from '../../lib/WebFileSystemProvider';
import { fetchFileContent } from '../../lib/githubApi';

export interface EditorPageState {
  explorerOpen: boolean;
  externalContent: string | undefined;
  externalFileName: string | undefined;
  externalFilePath: string | undefined;
  externalCompareContent: string | null;
  editorKey: number;
  isDirty: boolean;
  newCommit: { sha: string; message: string; author: string; date: string } | null;
  saveSnackbar: { message: string; severity: 'success' | 'error' } | null;
  ssoSnackbar: string | null;
}

export interface EditorPageActions {
  handleToggleExplorer: () => void;
  handleExplorerSelectFile: (repo: string, filePath: string, branch: string) => Promise<void>;
  handleExternalSave: (content: string) => Promise<void>;
  handleCompareModeChange: (active: boolean) => void;
  handleExplorerSelectCommit: (repo: string, filePath: string, sha: string) => Promise<void>;
  handleSelectCurrent: () => void;
  handleContentChange: (content: string) => void;
  setSsoSnackbar: (v: string | null) => void;
  setSaveSnackbar: (v: { message: string; severity: 'success' | 'error' } | null) => void;
  fileSystemProvider: WebFileSystemProvider | FallbackFileSystemProvider | null;
}

interface UseEditorPageOptions {
  isGitHubLoggedIn: boolean;
  session: unknown;
  t: (key: string) => string;
  /** Override fetchFileContent for testing */
  fetchFileFn?: typeof fetchFileContent;
  /** Override fetch for testing */
  fetchFn?: typeof fetch;
}

export function useEditorPage({
  isGitHubLoggedIn,
  session,
  t,
  fetchFileFn = fetchFileContent,
  fetchFn = typeof window !== 'undefined' ? window.fetch.bind(window) : (undefined as unknown as typeof fetch),
}: UseEditorPageOptions): EditorPageState & EditorPageActions {
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

  // エディタページでのみ body に editor-page クラスを付与し overflow: hidden を適用
  useEffect(() => {
    document.body.classList.add('editor-page');
    return () => { document.body.classList.remove('editor-page'); };
  }, []);

  // SSO ログイン状態で初回アクセス時に localStorage をクリアしパネルを開く
  useEffect(() => {
    if (!isGitHubLoggedIn) return;
    setExplorerOpen(true);
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

  const handleContentChange = useCallback((content: string) => {
    if (originalContentRef.current != null) {
      setIsDirty(content !== originalContentRef.current);
    }
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
    setIsDirty(false);
    const content = await fetchFileFn(repo, filePath, branch);
    originalContentRef.current = content;
    localStorage.setItem(STORAGE_KEY_CONTENT, content);
    setExternalContent(undefined);
    setExternalFileName(filePath.split("/").pop() ?? filePath);
    setExternalFilePath(filePath);
    setExternalCompareContent(null);
    setEditorKey((k) => k + 1);
  }, [fetchFileFn]);

  const handleExternalSave = useCallback(async (content: string) => {
    const sel = selectedFileRef.current;
    if (!sel) return;
    const res = await fetchFn('/api/github/content', {
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
  }, [t, fetchFn]);

  const handleCompareModeChange = useCallback((active: boolean) => {
    setCompareModeOpen(active);
    if (active && selectedCommitContentRef.current != null) {
      const commit = selectedCommitContentRef.current;
      selectedCommitContentRef.current = null;
      setExternalContent(undefined);
      setExternalCompareContent(commit);
      setEditorKey((k) => k + 1);
    }
  }, []);

  const handleExplorerSelectCommit = useCallback(async (repo: string, filePath: string, sha: string) => {
    const content = await fetchFileFn(repo, filePath, sha);
    if (!content && content !== '') return;
    if (compareModeOpen) {
      setExternalCompareContent(content);
    } else {
      selectedCommitContentRef.current = content;
      setExternalContent(content);
      setExternalFileName(filePath.split("/").pop() ?? filePath);
      setExternalFilePath(filePath);
      setExternalCompareContent(null);
      setEditorKey((k) => k + 1);
    }
  }, [compareModeOpen, fetchFileFn]);

  const handleSelectCurrent = useCallback(() => {
    setExternalContent(undefined);
    setExternalCompareContent(compareModeOpen ? "" : null);
    setEditorKey((k) => k + 1);
  }, [compareModeOpen]);

  return {
    explorerOpen,
    externalContent,
    externalFileName,
    externalFilePath,
    externalCompareContent,
    editorKey,
    isDirty,
    newCommit,
    saveSnackbar,
    ssoSnackbar,
    handleToggleExplorer,
    handleExplorerSelectFile,
    handleExternalSave,
    handleCompareModeChange,
    handleExplorerSelectCommit,
    handleSelectCurrent,
    handleContentChange,
    setSsoSnackbar,
    setSaveSnackbar,
    fileSystemProvider,
  };
}

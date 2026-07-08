'use client';

import { STORAGE_KEY_CONTENT } from '@anytime-markdown/markdown-viewer/src/constants/storageKeys';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { CommitToGitHubValues } from '../../components/CommitToGitHubDialog';
import { FallbackFileSystemProvider } from '../../lib/FallbackFileSystemProvider';
import { fetchFileContent } from '../../lib/githubApi';
import { pickDriveMarkdownFile } from '../../lib/googlePicker';
import { WebFileSystemProvider } from '../../lib/WebFileSystemProvider';

interface DriveFileRef {
  fileId: string;
  name: string;
  headRevisionId: string;
}

export interface DriveConflict {
  content: string;
  latestHeadRevisionId: string;
}

/** unknown を Record<string, unknown> として安全に読むためのヘルパ（any 禁止のため）。 */
function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null) return null;
  return value as Record<string, unknown>;
}

function parseGoogleTokenPayload(value: unknown): string | null {
  const record = asRecord(value);
  const accessToken = record?.accessToken;
  return typeof accessToken === 'string' && accessToken.length > 0 ? accessToken : null;
}

interface DriveContentPayload {
  name: string;
  headRevisionId: string;
  content: string;
}

function parseDriveContentPayload(value: unknown): DriveContentPayload | null {
  const record = asRecord(value);
  if (!record) return null;
  const { name, headRevisionId, content } = record;
  if (typeof name !== 'string' || typeof headRevisionId !== 'string' || typeof content !== 'string') {
    return null;
  }
  return { name, headRevisionId, content };
}

function parseDriveHeadRevisionId(value: unknown): string | null {
  const record = asRecord(value);
  const headRevisionId = record?.headRevisionId;
  return typeof headRevisionId === 'string' ? headRevisionId : null;
}

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
  driveConflict: DriveConflict | null;
  /** 現在編集中のコンテンツが Google Drive から開かれたものか（onExternalSave の配線判定に使う）。 */
  hasDriveFile: boolean;
  /** GitHub 保存時のコミットメッセージ入力ダイアログ。null は非表示。 */
  commitMessageDialog: { open: boolean; defaultMessage: string } | null;
  /** 任意ソースから GitHub へコミットするダイアログ。null は非表示。 */
  commitToGitHubDialog: { open: boolean; defaultPath: string } | null;
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
  handleDriveOpen: () => Promise<void>;
  handleDriveConflictOverwrite: () => Promise<void>;
  handleDriveConflictCancel: () => void;
  handleCommitMessageConfirm: (message: string, remember: boolean) => Promise<void>;
  handleCommitMessageCancel: () => void;
  handleOpenCommitToGitHub: (defaultPath: string) => void;
  handleCloseCommitToGitHub: () => void;
  handleCommitToGitHubConfirm: (values: CommitToGitHubValues) => Promise<void>;
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
  fetchFn = typeof window === 'undefined' ? (undefined as unknown as typeof fetch) : window.fetch.bind(window),
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
  const driveFileRef = useRef<DriveFileRef | null>(null);
  const selectedCommitContentRef = useRef<string | null>(null);
  const originalContentRef = useRef<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [newCommit, setNewCommit] = useState<{ sha: string; message: string; author: string; date: string } | null>(null);
  const [saveSnackbar, setSaveSnackbar] = useState<{ message: string; severity: 'success' | 'error' } | null>(null);
  const [driveConflict, setDriveConflict] = useState<DriveConflict | null>(null);
  const [hasDriveFile, setHasDriveFile] = useState(false);
  /** 直近に handleContentChange へ渡された全文（保存元を問わず常に最新化）。GitHub 任意コミットの内容取得に使う。 */
  const currentContentRef = useRef<string>('');
  const [commitMessageDialog, setCommitMessageDialog] = useState<{ open: boolean; defaultMessage: string } | null>(null);
  const pendingCommitContentRef = useRef<string>('');
  /** 「次回から同じメッセージを使う」チェック時に保持するメッセージ（セッション内のみ）。 */
  const rememberedCommitMessageRef = useRef<string | null>(null);
  const [commitToGitHubDialog, setCommitToGitHubDialog] = useState<{ open: boolean; defaultPath: string } | null>(null);

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
    currentContentRef.current = content;
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
    driveFileRef.current = null;
    setHasDriveFile(false);
    setExternalContent(undefined);
    setExternalFileName(undefined);
    setExternalFilePath(undefined);
    setExternalCompareContent(null);
    setEditorKey((k) => k + 1);
    rememberedCommitMessageRef.current = null;
    setCommitMessageDialog(null);
    setCommitToGitHubDialog(null);
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
    driveFileRef.current = null;
    setHasDriveFile(false);
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

  /** Drive への PUT を実行する。409（他所での更新）は driveConflict へ委譲し、成功/失敗は snackbar で通知する。 */
  const performDriveSave = useCallback(async (content: string, headRevisionId: string) => {
    const drive = driveFileRef.current;
    if (!drive) return;
    const res = await fetchFn('/api/drive/content', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileId: drive.fileId, content, headRevisionId }),
    });
    if (res.status === 409) {
      const data = await res.json().catch(() => null);
      const latestHeadRevisionId = parseDriveHeadRevisionId(data) ?? headRevisionId;
      setDriveConflict({ content, latestHeadRevisionId });
      return;
    }
    if (res.ok) {
      const data = await res.json().catch(() => null);
      const nextHeadRevisionId = parseDriveHeadRevisionId(data) ?? drive.headRevisionId;
      driveFileRef.current = { ...drive, headRevisionId: nextHeadRevisionId };
      originalContentRef.current = content;
      setIsDirty(false);
      setSaveSnackbar({ message: t('fileSaved'), severity: 'success' });
      return;
    }
    const err = await res.json().catch(() => ({}));
    console.warn('Failed to save to Drive:', (err as { error?: string }).error);
    setSaveSnackbar({ message: t('driveSaveError'), severity: 'error' });
  }, [t, fetchFn]);

  const handleDriveConflictOverwrite = useCallback(async () => {
    const conflict = driveConflict;
    if (!conflict) return;
    setDriveConflict(null);
    await performDriveSave(conflict.content, conflict.latestHeadRevisionId);
  }, [driveConflict, performDriveSave]);

  const handleDriveConflictCancel = useCallback(() => {
    setDriveConflict(null);
  }, []);

  /** GitHub Contents API への PUT を実行する（コミットメッセージ確定後）。 */
  const performGitHubSave = useCallback(async (content: string, message: string) => {
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
        message,
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

  const handleExternalSave = useCallback(async (content: string) => {
    if (driveFileRef.current) {
      await performDriveSave(content, driveFileRef.current.headRevisionId);
      return;
    }
    const sel = selectedFileRef.current;
    if (!sel) return;
    if (rememberedCommitMessageRef.current != null) {
      await performGitHubSave(content, rememberedCommitMessageRef.current);
      return;
    }
    pendingCommitContentRef.current = content;
    setCommitMessageDialog({ open: true, defaultMessage: `Update ${sel.filePath}` });
  }, [performDriveSave, performGitHubSave]);

  /** コミットメッセージダイアログ確定: 保留中の保存を実行し、チェック時は以降のメッセージを記憶する。 */
  const handleCommitMessageConfirm = useCallback(async (message: string, remember: boolean) => {
    setCommitMessageDialog(null);
    if (remember) {
      rememberedCommitMessageRef.current = message;
    }
    await performGitHubSave(pendingCommitContentRef.current, message);
  }, [performGitHubSave]);

  /** コミットメッセージダイアログのキャンセル: 保存を中断し、成功通知は出さない。 */
  const handleCommitMessageCancel = useCallback(() => {
    setCommitMessageDialog(null);
  }, []);

  const handleOpenCommitToGitHub = useCallback((defaultPath: string) => {
    setCommitToGitHubDialog({ open: true, defaultPath });
  }, []);

  const handleCloseCommitToGitHub = useCallback(() => {
    setCommitToGitHubDialog(null);
  }, []);

  /** 任意ソース→GitHub コミット確定: 現在のエディタ本文（currentContentRef）を指定リポジトリへ PUT する。 */
  const handleCommitToGitHubConfirm = useCallback(async (values: CommitToGitHubValues) => {
    setCommitToGitHubDialog(null);
    const res = await fetchFn('/api/github/content', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        repo: values.repo,
        path: values.path,
        content: currentContentRef.current,
        branch: values.branch,
        message: values.message,
      }),
    });
    if (res.ok) {
      setSaveSnackbar({ message: t('githubCommitSuccess'), severity: 'success' });
      return;
    }
    const err = await res.json().catch(() => ({}));
    const detail = typeof (err as { error?: unknown }).error === 'string' ? (err as { error: string }).error : res.statusText;
    console.warn(`Failed to commit to GitHub (status ${res.status}):`, detail);
    setSaveSnackbar({ message: `${t('githubCommitError')} (${res.status}): ${detail}`, severity: 'error' });
  }, [t, fetchFn]);

  /** Google Picker で Drive 上の Markdown ファイルを選択し、本文を読み込んでエディタへ反映する。 */
  const handleDriveOpen = useCallback(async () => {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_PICKER_API_KEY ?? '';
    if (!apiKey) {
      setSaveSnackbar({ message: t('driveApiKeyMissing'), severity: 'error' });
      return;
    }
    const tokenRes = await fetchFn('/api/auth/google-token');
    if (!tokenRes.ok) {
      setSaveSnackbar({ message: t('driveSignInRequired'), severity: 'error' });
      return;
    }
    const accessToken = parseGoogleTokenPayload(await tokenRes.json().catch(() => null));
    if (!accessToken) {
      setSaveSnackbar({ message: t('driveSignInRequired'), severity: 'error' });
      return;
    }

    const picked = await pickDriveMarkdownFile(accessToken, apiKey);
    if (!picked) return;

    const contentRes = await fetchFn(`/api/drive/content?fileId=${encodeURIComponent(picked.fileId)}`);
    if (!contentRes.ok) {
      setSaveSnackbar({ message: t('driveLoadError'), severity: 'error' });
      return;
    }
    const payload = parseDriveContentPayload(await contentRes.json().catch(() => null));
    if (!payload) {
      setSaveSnackbar({ message: t('driveLoadError'), severity: 'error' });
      return;
    }

    driveFileRef.current = { fileId: picked.fileId, name: payload.name, headRevisionId: payload.headRevisionId };
    selectedFileRef.current = null;
    setHasDriveFile(true);
    setIsDirty(false);
    originalContentRef.current = payload.content;
    localStorage.setItem(STORAGE_KEY_CONTENT, payload.content);
    setExternalContent(undefined);
    setExternalFileName(payload.name);
    setExternalFilePath(payload.name);
    setExternalCompareContent(null);
    setEditorKey((k) => k + 1);
  }, [fetchFn, t]);

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
    driveFileRef.current = null;
    setHasDriveFile(false);
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
    driveConflict,
    hasDriveFile,
    commitMessageDialog,
    commitToGitHubDialog,
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
    handleDriveOpen,
    handleDriveConflictOverwrite,
    handleDriveConflictCancel,
    handleCommitMessageConfirm,
    handleCommitMessageCancel,
    handleOpenCommitToGitHub,
    handleCloseCommitToGitHub,
    handleCommitToGitHubConfirm,
  };
}

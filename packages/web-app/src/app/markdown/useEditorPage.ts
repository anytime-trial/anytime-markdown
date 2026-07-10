'use client';

import { STORAGE_KEY_CONTENT } from '@anytime-markdown/markdown-viewer/src/constants/storageKeys';
import { signIn } from 'next-auth/react';
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

interface DriveCreatePayload {
  fileId: string;
  name: string;
  headRevisionId: string | null;
}

/** POST /api/drive/content の応答（headRevisionId は作成直後 null のことがある）。 */
function parseDriveCreatePayload(value: unknown): DriveCreatePayload | null {
  const record = asRecord(value);
  if (!record) return null;
  const { fileId, name, headRevisionId } = record;
  if (typeof fileId !== 'string' || typeof name !== 'string') return null;
  return { fileId, name, headRevisionId: typeof headRevisionId === 'string' ? headRevisionId : null };
}

function parseDriveHeadRevisionId(value: unknown): string | null {
  const record = asRecord(value);
  const headRevisionId = record?.headRevisionId;
  return typeof headRevisionId === 'string' ? headRevisionId : null;
}

interface GitHubCommitPayload {
  sha: string;
  message: string;
  author: string;
  date: string;
}

function parseGitHubCommitPayload(value: unknown): GitHubCommitPayload | null {
  const record = asRecord(asRecord(value)?.commit ?? null);
  if (!record) return null;
  const { sha, message, author, date } = record;
  if (typeof sha !== 'string' || typeof message !== 'string' || typeof author !== 'string' || typeof date !== 'string') {
    return null;
  }
  return { sha, message, author, date };
}

function parseErrorMessage(value: unknown): string | undefined {
  const error = asRecord(value)?.error;
  return typeof error === 'string' ? error : undefined;
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
  driveSaveAsDialog: { open: boolean; defaultName: string } | null;
}

export interface EditorPageActions {
  handleToggleExplorer: () => void;
  handleExplorerSelectFile: (repo: string, filePath: string, branch: string) => Promise<void>;
  /** 保存完了可否を返す（false のとき未保存ガードは新規作成 / 開くを中断する）。 */
  handleExternalSave: (content: string) => Promise<boolean>;
  handleCompareModeChange: (active: boolean) => void;
  handleExplorerSelectCommit: (repo: string, filePath: string, sha: string) => Promise<void>;
  handleSelectCurrent: () => void;
  handleContentChange: (content: string) => void;
  setSsoSnackbar: (v: string | null) => void;
  setSaveSnackbar: (v: { message: string; severity: 'success' | 'error' } | null) => void;
  fileSystemProvider: WebFileSystemProvider | FallbackFileSystemProvider | null;
  handleDriveOpen: () => Promise<void>;
  handleSaveToDriveClick: (defaultName: string) => void;
  handleSaveToDriveConfirm: (name: string) => Promise<void>;
  handleSaveToDriveCancel: () => void;
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
  /** Override next-auth signIn for testing */
  signInFn?: (provider: string, options?: { callbackUrl?: string }) => Promise<unknown>;
}

export function useEditorPage({
  isGitHubLoggedIn,
  session,
  t,
  fetchFileFn = fetchFileContent,
  fetchFn = typeof window === 'undefined' ? (undefined as unknown as typeof fetch) : window.fetch.bind(window),
  signInFn = signIn,
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
  /** コミットメッセージ確定待ちの handleExternalSave を解決する resolver（保留中のみ非 null）。 */
  const pendingCommitResolveRef = useRef<((saved: boolean) => void) | null>(null);
  const [commitMessageDialog, setCommitMessageDialog] = useState<{ open: boolean; defaultMessage: string } | null>(null);
  const pendingCommitContentRef = useRef<string>('');
  /** 「次回から同じメッセージを使う」チェック時に保持するメッセージ（セッション内のみ）。 */
  const rememberedCommitMessageRef = useRef<string | null>(null);
  const [commitToGitHubDialog, setCommitToGitHubDialog] = useState<{ open: boolean; defaultPath: string } | null>(null);
  const [driveSaveAsDialog, setDriveSaveAsDialog] = useState<{ open: boolean; defaultName: string } | null>(null);

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

  /**
   * Drive への PUT を実行する。409（他所での更新）は driveConflict へ委譲する。
   * 戻り値は保存が完了したか（未保存ガードが本文を破棄してよいかの判定に使う）。
   */
  const performDriveSave = useCallback(async (content: string, headRevisionId: string): Promise<boolean> => {
    const drive = driveFileRef.current;
    if (!drive) return false;
    const res = await fetchFn('/api/drive/content', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileId: drive.fileId, content, headRevisionId }),
    });
    if (res.status === 409) {
      const data = await res.json().catch(() => null);
      const latestHeadRevisionId = parseDriveHeadRevisionId(data) ?? headRevisionId;
      setDriveConflict({ content, latestHeadRevisionId });
      return false;
    }
    if (res.ok) {
      const data = await res.json().catch(() => null);
      const nextHeadRevisionId = parseDriveHeadRevisionId(data) ?? drive.headRevisionId;
      driveFileRef.current = { ...drive, headRevisionId: nextHeadRevisionId };
      originalContentRef.current = content;
      setIsDirty(false);
      setSaveSnackbar({ message: t('fileSaved'), severity: 'success' });
      return true;
    }
    const err = parseErrorMessage(await res.json().catch(() => null));
    console.warn('Failed to save to Drive:', err);
    setSaveSnackbar({ message: t('driveSaveError'), severity: 'error' });
    return false;
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

  /** GitHub Contents API への PUT を実行する（コミットメッセージ確定後）。戻り値は保存完了可否。 */
  const performGitHubSave = useCallback(async (content: string, message: string): Promise<boolean> => {
    const sel = selectedFileRef.current;
    if (!sel) return false;
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
      const commit = parseGitHubCommitPayload(await res.json().catch(() => null));
      if (commit) {
        setNewCommit(commit);
      }
      setSaveSnackbar({ message: t('fileSaved'), severity: 'success' });
      return true;
    }
    const err = parseErrorMessage(await res.json().catch(() => null));
    console.warn('Failed to save to GitHub:', err);
    setSaveSnackbar({ message: t('saveError'), severity: 'error' });
    return false;
  }, [t, fetchFn]);

  /**
   * エディタからの保存要求。保存が完了したかを返す（false なら未保存ガードは新規作成 / 開くを中断する）。
   * GitHub 経路はコミットメッセージ確定まで解決を保留し、キャンセルで false を返す。
   */
  const handleExternalSave = useCallback(async (content: string): Promise<boolean> => {
    if (driveFileRef.current) {
      return performDriveSave(content, driveFileRef.current.headRevisionId);
    }
    const sel = selectedFileRef.current;
    if (!sel) {
      // 上書き先が無い（GitHub にサインイン済みだがファイル未選択・Drive 未保存）。黙って false を
      // 返すと「保存したつもり」で dirty だけが残るため、次に取るべき操作を案内する。
      console.warn('External save requested with no target (no Drive file, no GitHub file selected)');
      setSaveSnackbar({ message: t('saveNoTarget'), severity: 'error' });
      return false;
    }
    if (rememberedCommitMessageRef.current != null) {
      return performGitHubSave(content, rememberedCommitMessageRef.current);
    }
    pendingCommitContentRef.current = content;
    setCommitMessageDialog({ open: true, defaultMessage: `Update ${sel.filePath}` });
    return new Promise<boolean>((resolve) => {
      pendingCommitResolveRef.current = resolve;
    });
  }, [performDriveSave, performGitHubSave, t]);

  /** 保留中の handleExternalSave（コミットメッセージ待ち）を保存完了可否で解決する。 */
  const settlePendingCommit = useCallback((saved: boolean) => {
    const resolve = pendingCommitResolveRef.current;
    pendingCommitResolveRef.current = null;
    resolve?.(saved);
  }, []);

  /** コミットメッセージダイアログ確定: 保留中の保存を実行し、チェック時は以降のメッセージを記憶する。 */
  const handleCommitMessageConfirm = useCallback(async (message: string, remember: boolean) => {
    setCommitMessageDialog(null);
    if (remember) {
      rememberedCommitMessageRef.current = message;
    }
    const saved = await performGitHubSave(pendingCommitContentRef.current, message);
    settlePendingCommit(saved);
  }, [performGitHubSave, settlePendingCommit]);

  /** コミットメッセージダイアログのキャンセル: 保存を中断し、成功通知は出さない。 */
  const handleCommitMessageCancel = useCallback(() => {
    setCommitMessageDialog(null);
    settlePendingCommit(false);
  }, [settlePendingCommit]);

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
    const detail = parseErrorMessage(await res.json().catch(() => null)) ?? res.statusText;
    console.warn(`Failed to commit to GitHub (status ${res.status}):`, detail);
    setSaveSnackbar({ message: `${t('githubCommitError')} (${res.status}): ${detail}`, severity: 'error' });
  }, [t, fetchFn]);

  /** Google の同意画面へ遷移する。起動自体に失敗した場合のみ snackbar で通知する。 */
  const startGoogleSignIn = useCallback(async () => {
    try {
      await signInFn('google', { callbackUrl: window.location.href });
    } catch (err) {
      console.warn('Failed to start Google sign-in:', err);
      setSaveSnackbar({ message: t('driveSignInRequired'), severity: 'error' });
    }
  }, [signInFn, t]);

  /** 保存メニューの「Google Drive に保存」: ファイル名入力ダイアログを開く。 */
  const handleSaveToDriveClick = useCallback((defaultName: string) => {
    setDriveSaveAsDialog({ open: true, defaultName });
  }, []);

  const handleSaveToDriveCancel = useCallback(() => {
    setDriveSaveAsDialog(null);
  }, []);

  /**
   * Drive 上に新規ファイルを作成し、以後の上書き保存先を新ファイルへ切り替える。
   * `drive.file` スコープではアプリが作成したファイルは Picker を経由せず操作できる。
   */
  const handleSaveToDriveConfirm = useCallback(async (name: string) => {
    setDriveSaveAsDialog(null);
    const res = await fetchFn('/api/drive/content', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, content: currentContentRef.current }),
    });
    if (res.status === 401) {
      // 未サインイン。開く経路と同じく同意画面へ誘導する。
      await startGoogleSignIn();
      return;
    }
    if (!res.ok) {
      const detail = parseErrorMessage(await res.json().catch(() => null));
      console.warn(`Failed to create Drive file (${res.status}):`, detail);
      setSaveSnackbar({ message: t('driveCreateError'), severity: 'error' });
      return;
    }
    const payload = parseDriveCreatePayload(await res.json().catch(() => null));
    if (!payload) {
      console.warn('Failed to create Drive file: unexpected payload shape');
      setSaveSnackbar({ message: t('driveCreateError'), severity: 'error' });
      return;
    }

    driveFileRef.current = {
      fileId: payload.fileId,
      name: payload.name,
      headRevisionId: payload.headRevisionId ?? '',
    };
    selectedFileRef.current = null;
    setHasDriveFile(true);
    originalContentRef.current = currentContentRef.current;
    setIsDirty(false);
    setExternalFileName(payload.name);
    setExternalFilePath(payload.name);
    setSaveSnackbar({ message: t('fileSaved'), severity: 'success' });
  }, [fetchFn, t, startGoogleSignIn]);

  /** Google Picker で Drive 上の Markdown ファイルを選択し、本文を読み込んでエディタへ反映する。 */
  const handleDriveOpen = useCallback(async () => {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_API_KEY ?? '';
    // appId（Cloud プロジェクト番号）は drive.file スコープでの許可付与に必須。
    const appId = process.env.NEXT_PUBLIC_GOOGLE_APP_ID ?? '';
    if (!apiKey || !appId) {
      setSaveSnackbar({ message: t('driveApiKeyMissing'), severity: 'error' });
      return;
    }
    const tokenRes = await fetchFn('/api/auth/google-token');
    const accessToken = tokenRes.ok
      ? parseGoogleTokenPayload(await tokenRes.json().catch(() => null))
      : null;
    if (!accessToken) {
      // 未サインイン（401）またはトークン欠落。エラー表示ではなく Google の同意画面へ誘導する。
      // callbackUrl で編集中のページへ戻す（本文は localStorage に退避済み）。
      await startGoogleSignIn();
      return;
    }

    const picked = await pickDriveMarkdownFile(accessToken, apiKey, appId);
    if (!picked) return;

    const contentRes = await fetchFn(`/api/drive/content?fileId=${encodeURIComponent(picked.fileId)}`);
    if (!contentRes.ok) {
      const detail = parseErrorMessage(await contentRes.json().catch(() => null));
      console.warn(`Failed to load Drive file (${contentRes.status}):`, detail);
      setSaveSnackbar({ message: t('driveLoadError'), severity: 'error' });
      return;
    }
    const payload = parseDriveContentPayload(await contentRes.json().catch(() => null));
    if (!payload) {
      console.warn('Failed to load Drive file: unexpected payload shape');
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
  }, [fetchFn, t, startGoogleSignIn]);

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
    driveSaveAsDialog,
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
    handleSaveToDriveClick,
    handleSaveToDriveConfirm,
    handleSaveToDriveCancel,
    handleDriveConflictOverwrite,
    handleDriveConflictCancel,
    handleCommitMessageConfirm,
    handleCommitMessageCancel,
    handleOpenCommitToGitHub,
    handleCloseCommitToGitHub,
    handleCommitToGitHubConfirm,
  };
}

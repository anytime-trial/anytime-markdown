'use client';

import type { SaveTargetInfo } from '@anytime-markdown/markdown-viewer/src/host/fileOpsController';
import { clearDraft, writeDraft } from '@anytime-markdown/markdown-viewer/src/utils/draftStorage';
import { signIn } from 'next-auth/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

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


function parseErrorMessage(value: unknown): string | undefined {
  const error = asRecord(value)?.error;
  return typeof error === 'string' ? error : undefined;
}

export interface EditorPageState {
  externalContent: string | undefined;
  externalFileName: string | undefined;
  externalCompareContent: string | null;
  editorKey: number;
  isDirty: boolean;
  saveSnackbar: { message: string; severity: 'success' | 'error' } | null;
  ssoSnackbar: string | null;
  driveConflict: DriveConflict | null;
  /** 現在編集中のコンテンツが Google Drive から開かれたものか（onExternalSave の配線判定に使う）。 */
  hasDriveFile: boolean;
  /**
   * 上書き保存の宛先種別。エディタのツールバー表示（GitHub なら「GitHub にコミット」）に使う。
   * ローカルへ「名前を付けて保存」した後は markdown-viewer 側が自動で無効化する。
   */
  externalSaveKind: 'github' | 'drive' | undefined;
  /** GitHub 保存時のコミットメッセージ入力ダイアログ。null は非表示。 */
  commitMessageDialog: { open: boolean; defaultMessage: string } | null;
  driveSaveAsDialog: { open: boolean; defaultName: string } | null;
}

export interface EditorPageActions {
  /** GitHub のファイルを開く。開いた後の上書き保存先も同時に確定する。 */
  handleGitHubOpenFile: (repo: string, filePath: string, branch: string) => Promise<void>;
  /** 保存完了可否を返す（false のとき未保存ガードは新規作成 / 開くを中断する）。 */
  handleExternalSave: (content: string) => Promise<boolean>;
  handleSaveTargetChange: (target: SaveTargetInfo | null) => void;
  handleCompareModeChange: (active: boolean) => void;
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
}

interface UseEditorPageOptions {
  /**
   * GitHub OAuth 済みか（`resolveConnectedProviders(session).github`）。
   * `!!session` では Google/Spotify のサインインまで拾ってしまうため boolean で受け取る。
   * `undefined` は「セッション未確定（useSession が loading）」。未接続とは区別する。
   */
  isGitHubConnected: boolean | undefined;
  t: (key: string) => string;
  /** Override fetchFileContent for testing */
  fetchFileFn?: typeof fetchFileContent;
  /** Override fetch for testing */
  fetchFn?: typeof fetch;
  /** Override next-auth signIn for testing */
  signInFn?: (provider: string, options?: { callbackUrl?: string }) => Promise<unknown>;
}

export function useEditorPage({
  isGitHubConnected,
  t,
  fetchFileFn = fetchFileContent,
  fetchFn = typeof window === 'undefined' ? (undefined as unknown as typeof fetch) : window.fetch.bind(window),
  signInFn = signIn,
}: UseEditorPageOptions): EditorPageState & EditorPageActions {
  const [externalContent, setExternalContent] = useState<string | undefined>(undefined);
  const [externalFileName, setExternalFileName] = useState<string | undefined>(undefined);
  const [externalCompareContent, setExternalCompareContent] = useState<string | null>(null);
  // 値は参照されない（比較モードの分岐は markdown-viewer 側が持つ）。setter のみ使う。
  const [, setCompareModeOpen] = useState(false);
  const [editorKey, setEditorKey] = useState(0);
  const selectedFileRef = useRef<{ repo: string; filePath: string; branch: string } | null>(null);
  const driveFileRef = useRef<DriveFileRef | null>(null);
  const originalContentRef = useRef<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [saveSnackbar, setSaveSnackbar] = useState<{ message: string; severity: 'success' | 'error' } | null>(null);
  const [driveConflict, setDriveConflict] = useState<DriveConflict | null>(null);
  const [hasDriveFile, setHasDriveFile] = useState(false);
  /**
   * Drive ファイル参照の唯一の更新経路。`hasDriveFile` は `driveFileRef.current != null` の
   * 派生値であり、片方だけを代入できると必ず乖離する。単独代入を禁じるため常にこれを使う。
   */
  const setDriveFile = useCallback((ref: DriveFileRef | null) => {
    driveFileRef.current = ref;
    setHasDriveFile(ref != null);
  }, []);
  /** 直近に handleContentChange へ渡された全文（保存元を問わず常に最新化）。Drive への新規保存の内容取得に使う。 */
  const currentContentRef = useRef<string>('');
  /** コミットメッセージ確定待ちの handleExternalSave を解決する resolver（保留中のみ非 null）。 */
  const pendingCommitResolveRef = useRef<((saved: boolean) => void) | null>(null);
  const [commitMessageDialog, setCommitMessageDialog] = useState<{ open: boolean; defaultMessage: string } | null>(null);
  const pendingCommitContentRef = useRef<string>('');
  /** 「次回から同じメッセージを使う」チェック時に保持するメッセージ（セッション内のみ）。 */
  const rememberedCommitMessageRef = useRef<string | null>(null);
  const [externalSaveKind, setExternalSaveKind] = useState<'github' | 'drive' | undefined>(undefined);
  const [driveSaveAsDialog, setDriveSaveAsDialog] = useState<{ open: boolean; defaultName: string } | null>(null);

  // エディタページでのみ body に editor-page クラスを付与し overflow: hidden を適用
  useEffect(() => {
    document.body.classList.add('editor-page');
    return () => { document.body.classList.remove('editor-page'); };
  }, []);

  // GitHub 接続済みで初回アクセス時に localStorage の下書きをクリアする
  useEffect(() => {
    if (!isGitHubConnected) return;
    if (!selectedFileRef.current) {
      setExternalContent("");
      setEditorKey((k) => k + 1);
    }
    if (sessionStorage.getItem('ssoContentCleared') === '1') return;
    sessionStorage.setItem('ssoContentCleared', '1');
    clearDraft(); // 失敗時のログは draftStorage 側で出る
  }, [isGitHubConnected]);

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

  // GitHub の接続/切断時にエディタを空の初期状態にリセットする。
  // Google（Drive）や Spotify のサインインでは発火させない（本文が消えるため）。
  const prevGitHubConnectedRef = useRef<boolean | undefined>(isGitHubConnected);
  const [ssoSnackbar, setSsoSnackbar] = useState<string | null>(null);
  useEffect(() => {
    // セッション未確定の間は何も判断しない。確定した最初の値は「接続イベント」ではないので
    // 記録するだけで通知もリセットもしない（リロードのたびに snackbar が出るのを防ぐ）。
    if (isGitHubConnected === undefined) return;
    const wasLoggedIn = prevGitHubConnectedRef.current;
    prevGitHubConnectedRef.current = isGitHubConnected;
    if (wasLoggedIn === undefined || wasLoggedIn === isGitHubConnected) return;
    const isNowLoggedIn = isGitHubConnected;
    selectedFileRef.current = null;
    setDriveFile(null);
    setExternalContent(undefined);
    setExternalFileName(undefined);
    setExternalCompareContent(null);
    setEditorKey((k) => k + 1);
    rememberedCommitMessageRef.current = null;
    setCommitMessageDialog(null);
    setExternalSaveKind(undefined);
    if (isNowLoggedIn && !wasLoggedIn) {
      setSsoSnackbar(t('githubConnected'));
    } else if (!isNowLoggedIn && wasLoggedIn) {
      setSsoSnackbar(t('githubDisconnected'));
    }
  }, [isGitHubConnected, t, setDriveFile]);

  const handleGitHubOpenFile = useCallback(async (repo: string, filePath: string, branch: string) => {
    const prev = selectedFileRef.current;
    const isSameFile = prev?.repo === repo && prev?.filePath === filePath && prev?.branch === branch;
    selectedFileRef.current = { repo, filePath, branch };
    setDriveFile(null);
    setExternalSaveKind('github');
    if (isSameFile) return;
    setIsDirty(false);
    const content = await fetchFileFn(repo, filePath, branch);
    originalContentRef.current = content;
    writeDraft(content);
    setExternalContent(undefined);
    setExternalFileName(filePath.split("/").pop() ?? filePath);
    setExternalCompareContent(null);
    setEditorKey((k) => k + 1);
  }, [fetchFileFn, setDriveFile]);

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
      setDriveFile({ ...drive, headRevisionId: nextHeadRevisionId });
      originalContentRef.current = content;
      setIsDirty(false);
      setSaveSnackbar({ message: t('fileSaved'), severity: 'success' });
      return true;
    }
    const err = parseErrorMessage(await res.json().catch(() => null));
    console.warn('Failed to save to Drive:', err);
    setSaveSnackbar({ message: t('driveSaveError'), severity: 'error' });
    return false;
  }, [t, fetchFn, setDriveFile]);

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

  /**
   * エディタの保存先が変化したときの追従。ローカルへ「名前を付けて保存」すると以後の上書き保存は
   * ローカルへ行くため、外部保存の参照（Drive のファイル・GitHub の選択ファイル）を破棄する。
   * 破棄しないと `handleExternalSave` が古い宛先へ書き戻してしまう。
   */
  const handleSaveTargetChange = useCallback((target: SaveTargetInfo | null) => {
    if (target?.kind !== 'local') return;
    setDriveFile(null);
    setExternalSaveKind(undefined);
    selectedFileRef.current = null;
    // ファイル名の正本はエディタ（fileOpsController）側へ移る。prop で上書きしない。
    setExternalFileName(undefined);
  }, [setDriveFile]);

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

    setDriveFile({
      fileId: payload.fileId,
      name: payload.name,
      headRevisionId: payload.headRevisionId ?? '',
    });
    setExternalSaveKind('drive');
    selectedFileRef.current = null;
    originalContentRef.current = currentContentRef.current;
    setIsDirty(false);
    setExternalFileName(payload.name);
    setSaveSnackbar({ message: t('fileSaved'), severity: 'success' });
  }, [fetchFn, t, startGoogleSignIn, setDriveFile]);

  /**
   * Drive の fileId から本文を読み込み、エディタと以後の上書き保存先を Drive へ切り替える。
   * Picker 経由と Drive UI の「アプリで開く」経由の共通経路。読み込めたとき true を返す。
   * 保存先種別（`externalSaveKind`）の設定をここに閉じ込め、呼び出し側での設定漏れを防ぐ。
   */
  const loadDriveFileIntoEditor = useCallback(async (fileId: string): Promise<boolean> => {
    const contentRes = await fetchFn(`/api/drive/content?fileId=${encodeURIComponent(fileId)}`);
    if (!contentRes.ok) {
      const detail = parseErrorMessage(await contentRes.json().catch(() => null));
      console.warn(`Failed to load Drive file (${contentRes.status}):`, detail);
      setSaveSnackbar({ message: t('driveLoadError'), severity: 'error' });
      return false;
    }
    const payload = parseDriveContentPayload(await contentRes.json().catch(() => null));
    if (!payload) {
      console.warn('Failed to load Drive file: unexpected payload shape');
      setSaveSnackbar({ message: t('driveLoadError'), severity: 'error' });
      return false;
    }

    setDriveFile({ fileId, name: payload.name, headRevisionId: payload.headRevisionId });
    setExternalSaveKind('drive');
    selectedFileRef.current = null;
    setIsDirty(false);
    originalContentRef.current = payload.content;
    writeDraft(payload.content);
    setExternalContent(undefined);
    setExternalFileName(payload.name);
    setExternalCompareContent(null);
    setEditorKey((k) => k + 1);
    return true;
  }, [fetchFn, t, setDriveFile]);

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

    await loadDriveFileIntoEditor(picked.fileId);
  }, [fetchFn, t, startGoogleSignIn, loadDriveFileIntoEditor]);

  const handleCompareModeChange = useCallback((active: boolean) => {
    setCompareModeOpen(active);
  }, []);

  return {
    externalContent,
    externalFileName,
    externalCompareContent,
    editorKey,
    isDirty,
    saveSnackbar,
    ssoSnackbar,
    driveConflict,
    hasDriveFile,
    externalSaveKind,
    commitMessageDialog,
    driveSaveAsDialog,
    handleGitHubOpenFile,
    handleExternalSave,
    handleSaveTargetChange,
    handleCompareModeChange,
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
  };
}

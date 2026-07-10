/**
 * ファイル操作（open / save / saveAs / import / clear / 外部保存）の vanilla コントローラ。
 *
 * React `useFileSystem`（FileHandle 永続化 + provider 呼び出し）と `useEditorFileOps`
 * （frontmatter 付き全文取得・確認ダイアログ・保存通知）の plain 移植（G4-A・consumer 一本化で
 * 旧 React 経路の `fileSystemProvider` / `onExternalSave` parity を回復する）。
 *
 * React 版との差分: 非 UTF-8 encoding の保存（encoding-japanese 経由）は StatusBar の
 * encoding 状態が orchestrator 未配線のため未対応（UTF-8 のみ）。PDF export は対象外
 * （consumer が `fileHandlers.onExportPdf` を注入する）。
 */

import type { Editor } from "@anytime-markdown/markdown-core";

import { STORAGE_KEY_FILENAME } from "../constants/storageKeys";
import type { TranslationFn } from "../types";
import type { FileHandle, FileSystemProvider } from "../types/fileSystem";
import { clearDocumentAndComments } from "../utils/clearEditor";
import { applyMarkdownToEditor } from "../utils/editorContentLoader";
import { clearNativeHandle, loadNativeHandle, saveNativeHandle } from "../utils/fileHandleStore";
import { readFileAsText } from "../utils/fileReading";
import { prependFrontmatter } from "../utils/frontmatterHelpers";
import { getMarkdownFromEditorSafe } from "../utils/markdownSerializer";

/** {@link createFileOpsController} のオプション。 */
interface CreateFileOpsControllerOptions {
  editor: Editor;
  t: TranslationFn;
  /** ローカル FS provider（web の File System Access / fallback）。 */
  provider?: FileSystemProvider | null;
  /**
   * 外部保存（GitHub SSO / Google Drive 等）。指定時は save がこちらを優先する。
   *
   * 保存完了まで待てるホストは `Promise<boolean>`（成功 true / キャンセル・失敗 false）を返す。
   * `void` を返す同期ホストは常に成功とみなす（後方互換）。false を返した場合は dirty を
   * 落とさないため、未保存ガードは新規作成 / 開くを中断する。
   */
  onExternalSave?: (content: string) => void | Promise<boolean>;
  /** 確認ダイアログ（未指定時は確認なしで続行）。 */
  confirm?: (message: string) => Promise<boolean>;
  /**
   * 未保存データがある状態で新規作成 / 開くを行う際の 3 択確認。
   * 未注入のホストは {@link CreateFileOpsControllerOptions.confirm} の 2 択へフォールバックする。
   */
  confirmSave?: (message: string) => Promise<"save" | "discard" | "cancel">;
  /** フロントマター（エディタ外保持）の読み書き。 */
  getFrontmatter: () => string | null;
  setFrontmatter: (fm: string | null) => void;
  /** source モード中の取得/反映（モードは orchestrator が管理）。 */
  getSourceMode: () => boolean;
  getSourceText: () => string;
  setSourceText: (text: string) => void;
  /** fileName / dirty 変化の通知（StatusBar 反映）。 */
  onFileStateChange?: (state: { fileName: string | null; isDirty: boolean }) => void;
  /** 保存完了等の通知（aria-live / Snackbar 相当）。 */
  notify?: (messageKey: string) => void;
}

/** {@link createFileOpsController} の戻り値。 */
interface FileOpsController {
  /** フロントマター付き全文（保存・コピー用）。 */
  getFullMarkdown(): string;
  openFile(): Promise<void>;
  saveFile(): Promise<void>;
  saveAsFile(): Promise<void>;
  /** .md ドロップ / インポート（確認なし・DOM handlers の handleImport 相当）。 */
  importFile(file: File, nativeHandle?: FileSystemFileHandle): Promise<void>;
  /** 既存コンテンツがある場合は確認してから取り込む（React handleFileSelected 相当）。 */
  selectFile(file: File, nativeHandle?: FileSystemFileHandle): Promise<void>;
  /** 全消去（確認 + frontmatter / fileHandle リセット）。 */
  clearAll(): Promise<void>;
  /** 新規作成（未保存ガード + frontmatter / fileHandle リセット）。 */
  newFile(): Promise<void>;
  /**
   * 未保存データがあれば保存確認を出し、続行してよければ true を返す。
   * 本コントローラの外側で文書を差し替えるホスト（Drive から開く等）が使う。
   */
  confirmContinue(): Promise<boolean>;
  markDirty(): void;
  getFileName(): string | null;
  isDirty(): boolean;
  /**
   * 上書き保存の宛先があるか。ローカルの FileHandle だけでなく、外部保存（Google Drive /
   * GitHub 等）の注入も宛先とみなす。{@link saveFileImpl} が `onExternalSave` を最優先し
   * `fileHandle` を参照しないため、両者を同じ「宛先あり」として扱わないと Drive から開いた
   * 本文で上書き保存が無効化される。
   */
  hasSaveTarget(): boolean;
}

/** nativeHandle の書き込み権限を確認・要求し、拒否された場合 true を返す（React 版と同一）。 */
async function hasWritePermissionDenied(handle: FileSystemFileHandle): Promise<boolean> {
  const h = handle as unknown as {
    queryPermission?(d: { mode: string }): Promise<string>;
    requestPermission?(d: { mode: string }): Promise<string>;
  };
  if (typeof h.queryPermission !== "function") return false;
  const perm = await h.queryPermission({ mode: "readwrite" });
  if (perm === "granted") return false;
  if (typeof h.requestPermission !== "function") return true;
  const req = await h.requestPermission({ mode: "readwrite" });
  return req !== "granted";
}

function loadStoredFileName(): FileHandle | null {
  try {
    const saved = typeof window === "undefined" ? null : localStorage.getItem(STORAGE_KEY_FILENAME);
    return saved ? { name: saved } : null;
  } catch (error) {
    console.warn("[fileOpsController] fileName restore failed", error);
    return null;
  }
}

/** ファイル操作コントローラを生成する。 */
export function createFileOpsController(
  options: CreateFileOpsControllerOptions,
): FileOpsController {
  const { editor, t, provider, confirm } = options;
  let fileHandle: FileHandle | null = loadStoredFileName();
  let dirty = false;

  const notifyState = (): void =>
    options.onFileStateChange?.({ fileName: fileHandle?.name ?? null, isDirty: dirty });

  const persistHandle = (): void => {
    try {
      if (fileHandle?.name) {
        localStorage.setItem(STORAGE_KEY_FILENAME, fileHandle.name);
      } else {
        localStorage.removeItem(STORAGE_KEY_FILENAME);
      }
    } catch (error) {
      console.warn("[fileOpsController] fileName persist failed", error);
    }
    if (fileHandle?.nativeHandle) {
      saveNativeHandle(fileHandle.nativeHandle as FileSystemFileHandle).catch((error) => {
        console.warn("[fileOpsController] nativeHandle persist failed", error);
      });
    } else if (!fileHandle) {
      clearNativeHandle().catch((error) => {
        console.warn("[fileOpsController] nativeHandle clear failed", error);
      });
    }
  };

  const setHandle = (next: FileHandle | null): void => {
    fileHandle = next;
    persistHandle();
    notifyState();
  };

  const setDirty = (next: boolean): void => {
    if (dirty === next) return;
    dirty = next;
    notifyState();
  };

  // リロード時に IndexedDB から nativeHandle を復元（React useFileSystem の初回 effect 相当）。
  if (typeof window !== "undefined" && fileHandle?.name && !fileHandle.nativeHandle) {
    const name = fileHandle.name;
    loadNativeHandle()
      .then((native) => {
        if (native?.name === name && fileHandle?.name === name) {
          fileHandle = { name, nativeHandle: native };
        }
      })
      .catch((error) => {
        console.warn("[fileOpsController] nativeHandle restore failed", error);
      });
  }

  const getFullMarkdown = (): string => {
    if (options.getSourceMode()) return options.getSourceText();
    const md = getMarkdownFromEditorSafe(editor) ?? "";
    return prependFrontmatter(md, options.getFrontmatter());
  };

  const withTrailingNewline = (md: string): string =>
    md && !md.endsWith("\n") ? `${md}\n` : md;

  /** Markdown テキストをエディタ（または source textarea）へ適用する。 */
  const applyMarkdownContent = (text: string): void => {
    if (options.getSourceMode()) {
      options.setSourceText(text);
      return;
    }
    const { frontmatter } = applyMarkdownToEditor(editor, text);
    options.setFrontmatter(frontmatter);
  };

  const hasContent = (): boolean =>
    options.getSourceMode() ? options.getSourceText().trim() !== "" : !editor.isEmpty;

  const confirmOrTrue = async (message: string): Promise<boolean> => {
    if (!confirm) return true;
    try {
      return await confirm(message);
    } catch (error) {
      console.warn("[fileOpsController] confirm rejected", error);
      return false;
    }
  };

  /** 上書き保存の実体（保存先が無ければ saveAs へフォールバックする）。 */
  const saveFileImpl = async (): Promise<void> => {
    const md = withTrailingNewline(getFullMarkdown());
    if (options.onExternalSave) {
      // Promise を返すホストは保存完了まで待つ。false（コミットメッセージのキャンセル・
      // 409 競合・ネットワークエラー）なら dirty を保ち、ガードが本文を破棄しないようにする。
      const result = await options.onExternalSave(md);
      if (result === false) return;
      setDirty(false);
      options.notify?.("fileSaved");
      return;
    }
    if (!provider) return;
    if (fileHandle?.nativeHandle) {
      const denied = await hasWritePermissionDenied(fileHandle.nativeHandle as FileSystemFileHandle);
      if (denied) {
        const newHandle = await provider.saveAs(md);
        if (!newHandle) return;
        setHandle(newHandle);
      } else {
        await provider.save(fileHandle, md);
      }
    } else {
      const newHandle = await provider.saveAs(md);
      if (!newHandle) return;
      setHandle(newHandle);
    }
    setDirty(false);
    options.notify?.("fileSaved");
  };

  /** 名前を付けて保存の実体。 */
  const saveAsFileImpl = async (): Promise<void> => {
    if (!provider) return;
    const md = withTrailingNewline(getFullMarkdown());
    const newHandle = await provider.saveAs(md);
    if (!newHandle) return;
    setHandle(newHandle);
    setDirty(false);
    options.notify?.("fileSaved");
  };

  /**
   * 未保存データがあるとき、保存するか確認する。続行してよければ true。
   *
   * `confirmSave`（3 択）が注入されていればそれを使い、「保存」ではファイルを開いていれば上書き保存、
   * 未オープンなら名前を付けて保存へフォールバックする。保存が完了しなかった場合（ダイアログの
   * キャンセル・権限拒否・例外）は続行しない。未注入なら既存 `confirm` の 2 択へフォールバックする。
   */
  const guardDirty = async (): Promise<boolean> => {
    if (!dirty) return true;
    const message = t("unsavedConfirm");
    const confirmSave = options.confirmSave;
    if (!confirmSave) return confirmOrTrue(message);

    let choice: "save" | "discard" | "cancel";
    try {
      choice = await confirmSave(message);
    } catch (error) {
      console.warn("[fileOpsController] confirmSave rejected", error);
      return false;
    }
    if (choice === "cancel") return false;
    if (choice === "discard") return true;

    try {
      await (hasWritableTarget() ? saveFileImpl() : saveAsFileImpl());
    } catch (error) {
      console.warn("[fileOpsController] save before continue failed", error);
      return false;
    }
    // 保存が完了していれば dirty は落ちている。落ちていなければ中断（保存ダイアログのキャンセル等）。
    return !dirty;
  };

  /** 上書き保存の宛先を既に持っているか（外部保存ホストは常に持つ）。 */
  const hasWritableTarget = (): boolean => Boolean(options.onExternalSave) || fileHandle != null;

  const importFile = async (file: File, nativeHandle?: FileSystemFileHandle): Promise<void> => {
    if (!file.name.endsWith(".md") && !file.type.startsWith("text/")) return;
    try {
      const { text } = await readFileAsText(file);
      setHandle(nativeHandle ? { name: file.name, nativeHandle } : { name: file.name });
      applyMarkdownContent(text);
    } catch (error) {
      console.warn("[fileOpsController] file read failed", file.name, error);
    }
  };

  return {
    getFullMarkdown,
    importFile,
    async selectFile(file: File, nativeHandle?: FileSystemFileHandle): Promise<void> {
      if (hasContent() && !(await confirmOrTrue(t("importConfirm")))) return;
      await importFile(file, nativeHandle);
    },
    async openFile(): Promise<void> {
      if (!provider) return;
      if (!(await guardDirty())) return;
      const result = await provider.open();
      if (!result) return;
      setHandle(result.handle);
      // content 適用は transaction を発行し markDirty を誘発するため、適用後に dirty をリセットする
      // （適用前にリセットすると開いた直後に dirty 表示になる）。
      applyMarkdownContent(result.content);
      setDirty(false);
    },
    saveFile: saveFileImpl,
    saveAsFile: saveAsFileImpl,
    async newFile(): Promise<void> {
      if (!(await guardDirty())) return;
      if (options.getSourceMode()) {
        options.setSourceText("");
      } else {
        clearDocumentAndComments(editor);
      }
      options.setFrontmatter(null);
      setHandle(null);
      setDirty(false);
    },
    async clearAll(): Promise<void> {
      if (!(await confirmOrTrue(t("clearConfirm")))) return;
      if (options.getSourceMode()) {
        options.setSourceText("");
      } else {
        // 本文＋コメント状態を一括クリア（共有ヘルパー H2）。
        clearDocumentAndComments(editor);
      }
      options.setFrontmatter(null);
      setHandle(null);
      setDirty(false);
    },
    confirmContinue: guardDirty,
    markDirty: () => setDirty(true),
    getFileName: () => fileHandle?.name ?? null,
    isDirty: () => dirty,
    hasSaveTarget: () => fileHandle != null || !!options.onExternalSave,
  };
}

/**
 * 拡張ページ（editor.html）のエントリ。
 *
 * `@anytime-markdown/markdown-rich/element` を import すると
 * `<anytime-markdown-rich-editor>` Custom Element が登録される（副作用 import）。
 * mermaid / katex / plantuml / math / graph に対応する rich 版。
 *
 * 軽量なプレーン版に戻す場合は `@anytime-markdown/markdown-viewer/element`
 * （`<anytime-markdown-editor>`）に差し替える。
 *
 * 要素は `options` を connect 前に渡すため JS で生成する（属性で表現できない
 * sideToolbar / hide 等を一度の mount で反映するため）。
 */
import "@anytime-markdown/markdown-rich/element";
import { WebFileSystemProvider } from "@anytime-markdown/markdown-viewer/fs/web-file-system-provider";
import { DriveFileSystemProvider } from "@anytime-markdown/markdown-viewer/fs/drive-file-system-provider";
import type { CapturedPage } from "@anytime-markdown/markdown-viewer/web-import/capture-page";

/**
 * 本拡張で WC に渡す最小オプション型（このファイルは esbuild トランスパイルのみで
 * 型検査を受けないため、必要な口だけを局所定義する）。
 */
interface RichEditorElement extends HTMLElement {
  options: {
    sideToolbar?: boolean;
    hide?: { explorer?: boolean };
    fileSystemProvider?: WebFileSystemProvider | DriveFileSystemProvider;
    /**
     * light/dark テーマ切替コールバック。これを渡すとサイドツールバーに
     * 太陽/月のテーマ切替アイコンが表示される（web-app と同じ仕組み）。
     */
    onThemeModeChange?: (mode: "light" | "dark") => void;
  };
  value: string;
}

/** 使用する chrome.storage.local の口だけを構造的に表す（@types/chrome 非依存）。 */
interface StorageArea {
  get(
    keys: string | string[],
    callback: (items: Record<string, unknown>) => void,
  ): void;
  set(items: Record<string, unknown>, callback?: () => void): void;
  remove(keys: string | string[], callback?: () => void): void;
}

const STORAGE_KEY = "anytime-markdown:last-document";
/** 選択した light/dark テーマの保存先。再起動後に復元する。 */
const THEME_KEY = "anytime-markdown:theme";
/**
 * 拡張の右クリックメニュー（background.js）が置く、表示中ページの
 * Markdown 化結果の一時保存先。editor.html?import=1 起動時にのみ読み取り、
 * 取り込み後は自動保存復元より優先したうえで即座に削除する。
 */
const PENDING_IMPORT_KEY = "pendingImport";
/**
 * 拡張の右クリックメニューが Drive ファイル URL 上で押された際に background.js が置く、
 * 書き戻し対象の fileId 一時保存先。editor.html?driveImport=1 起動時にのみ読み取り、
 * 取り込み後は即座に削除する。
 */
const PENDING_DRIVE_FILE_KEY = "pendingDriveFile";
/** 自動保存のデバウンス。chrome.storage の書込みスロットリング回避。 */
const SAVE_DEBOUNCE_MS = 500;

/** 使用する chrome.identity の口だけを構造的に表す（@types/chrome 非依存）。 */
interface IdentityArea {
  getAuthToken(
    details: { interactive: boolean },
    callback: (token?: string) => void,
  ): void;
}

/** chrome.storage.local（拡張コンテキスト外では undefined）。 */
function getStorage(): StorageArea | undefined {
  return (globalThis as { chrome?: { storage?: { local?: StorageArea } } }).chrome
    ?.storage?.local;
}

/** chrome.identity（拡張コンテキスト外・identity 権限未付与時は undefined）。 */
function getIdentity(): IdentityArea | undefined {
  return (globalThis as { chrome?: { identity?: IdentityArea } }).chrome?.identity;
}

/** chrome.runtime.lastError（保存失敗の検出用。拡張コンテキスト外では undefined）。 */
function getRuntimeError(): { message?: string } | undefined {
  return (globalThis as { chrome?: { runtime?: { lastError?: { message?: string } } } })
    .chrome?.runtime?.lastError;
}

/**
 * chrome.identity.getAuthToken を Promise 化する（interactive: true で同意 UI 表示）。
 * identity 権限が無い / トークン取得失敗の場合はコンテキストを含む Error を投げる
 * （silent catch 禁止。呼び出し元でログ＋グレースフルデグラデーションに回す）。
 */
function getDriveAuthToken(): Promise<string> {
  const identity = getIdentity();
  if (!identity) {
    return Promise.reject(
      new Error(
        `[${new Date().toISOString()}] chrome.identity が利用できません（identity 権限未付与の可能性）`,
      ),
    );
  }
  return new Promise((resolve, reject) => {
    identity.getAuthToken({ interactive: true }, (token) => {
      const err = getRuntimeError();
      if (err || !token) {
        reject(
          new Error(
            `[${new Date().toISOString()}] Drive 認証トークンの取得に失敗しました: ${
              err?.message ?? "token is empty"
            }`,
          ),
        );
        return;
      }
      resolve(token);
    });
  });
}

let saveTimer: ReturnType<typeof setTimeout> | undefined;

/**
 * 編集内容を debounce して chrome.storage.local に保存する。
 * storage.set のコールバックで lastError を観測し、silent failure を避ける。
 */
function scheduleSave(value: string): void {
  const storage = getStorage();
  if (!storage) return;
  if (saveTimer !== undefined) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    storage.set({ [STORAGE_KEY]: value }, () => {
      const err = getRuntimeError();
      if (err) {
        // ブラウザ拡張ページのため console は DevTools で可視（VS Code 拡張ではない）。
        console.warn(`[anytime-markdown] 自動保存に失敗しました: ${err.message ?? "unknown error"}`);
      }
    });
  }, SAVE_DEBOUNCE_MS);
}

/**
 * 選択した light/dark テーマを chrome.storage.local に保存する。
 * 切替は低頻度のため debounce せず即時保存する。
 */
function saveTheme(mode: "light" | "dark"): void {
  const storage = getStorage();
  if (!storage) return;
  storage.set({ [THEME_KEY]: mode }, () => {
    const err = getRuntimeError();
    if (err) {
      console.warn(
        `[anytime-markdown] テーマの保存に失敗しました: ${err.message ?? "unknown error"}`,
      );
    }
  });
}

/**
 * rich エディタ要素を生成して #editor-root にマウントする。
 * 編集内容・選択テーマは chrome.storage.local に自動保存し、再起動後に復元する。
 *
 * @param fileSystemProvider 省略時は File System Access API ベースの
 *   {@link WebFileSystemProvider}（ローカル open/save/saveAs）。Drive ファイルの
 *   書き戻し起動時は {@link DriveFileSystemProvider} を渡し、Ctrl+S が Drive への
 *   PATCH になるようにする。
 */
function createEditor(
  initialContent: string,
  initialTheme: "light" | "dark",
  fileSystemProvider: WebFileSystemProvider | DriveFileSystemProvider = new WebFileSystemProvider(),
): void {
  const root = document.getElementById("editor-root");
  if (!root) return;

  const el = document.createElement("anytime-markdown-rich-editor") as RichEditorElement;
  el.setAttribute("theme", initialTheme);
  el.setAttribute("locale", "ja");
  // web-app と同様に右端の縦サイドツールバー（アウトライン / コメント / 設定）を表示する。
  // hide.explorer は上部ツールバーの explorer トグル（fileSystemProvider 未配線で無意味）を
  // 抑止する。サイドツールバー側の explorer ボタンは onToggleExplorer 未配線のため元々描画されない。
  // File System Access API で .md を開く / 上書き保存 / 名前を付けて保存を有効化する
  // （拡張ページは secure context のため showOpenFilePicker / createWritable が使える）。
  // これにより toolbar の 開く / 保存 / 別名保存 アイコンが有効になる。
  // web-app と同じく onThemeModeChange を配線するとサイドツールバーに light/dark
  // 切替アイコンが表示される。切替時は `theme` 属性を更新（WC が editor 本文・chrome
  // トークン・アイコンを同期）し、選択を storage に永続化する。
  // host の themeMode は callback 内で直接は更新せず、属性 set → attributeChangedCallback
  // → handle.update({themeMode}) 経由で逆流同期される（次回トグルの基準値もこれで整う）。
  el.options = {
    sideToolbar: true,
    hide: { explorer: true },
    fileSystemProvider,
    onThemeModeChange: (mode) => {
      el.setAttribute("theme", mode);
      saveTheme(mode);
    },
  };
  if (initialContent) el.value = initialContent;

  el.addEventListener("change", (event) => {
    const detail = (event as CustomEvent<{ value: string }>).detail;
    if (detail?.value === undefined) return;
    scheduleSave(detail.value);
  });

  // options / value を connect 前に確定させてから append（単一 mount）。
  root.appendChild(el);
}

/** storage 値を light/dark に正規化する（不正値・未設定は light）。 */
function normalizeTheme(value: unknown): "light" | "dark" {
  return value === "dark" ? "dark" : "light";
}

/** URL に `?import=1` が付与されているか（background.js が付ける取り込み起動フラグ）。 */
function hasPendingImportParam(): boolean {
  return new URLSearchParams(globalThis.location.search).get("import") === "1";
}

/** URL に `?driveImport=1` が付与されているか（Drive ファイル書き戻し起動フラグ）。 */
function hasPendingDriveImportParam(): boolean {
  return new URLSearchParams(globalThis.location.search).get("driveImport") === "1";
}

/** chrome.storage 由来の値を pendingDriveFile として構造的に検証する（`any` を避ける型ガード）。 */
function isPendingDriveFile(value: unknown): value is { fileId: string } {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.fileId === "string" && v.fileId.length > 0;
}

/** chrome.storage 由来の値を CapturedPage として構造的に検証する（`any` を避ける型ガード）。 */
function isCapturedPage(value: unknown): value is CapturedPage {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.markdown === "string" &&
    typeof v.title === "string" &&
    typeof v.sourceUrl === "string"
  );
}

/**
 * 通常の自動保存復元（chrome.storage.local の last-document）でエディタを起動する。
 */
function restoreAutoSaved(storage: StorageArea): void {
  storage.get([STORAGE_KEY, THEME_KEY], (items) => {
    const saved = items?.[STORAGE_KEY];
    createEditor(
      typeof saved === "string" ? saved : "",
      normalizeTheme(items?.[THEME_KEY]),
    );
  });
}

/**
 * pendingImport（右クリック「anytime-markdown で編集」の取り込み結果）を読み取り、
 * 取り込み後は即座に削除する。値が無い/不正な場合は通常の自動保存復元へフォールバックする。
 */
function consumePendingImport(storage: StorageArea): void {
  storage.get([PENDING_IMPORT_KEY], (items) => {
    const raw = items?.[PENDING_IMPORT_KEY];
    storage.remove(PENDING_IMPORT_KEY, () => {
      const err = getRuntimeError();
      if (err) {
        console.warn(
          `[anytime-markdown] pendingImport の削除に失敗しました: ${err.message ?? "unknown error"}`,
        );
      }
    });

    if (!isCapturedPage(raw)) {
      restoreAutoSaved(storage);
      return;
    }
    storage.get([THEME_KEY], (themeItems) => {
      createEditor(raw.markdown, normalizeTheme(themeItems?.[THEME_KEY]));
    });
  });
}

/**
 * Drive ファイルの確認ダイアログ文言を組み立てる（純粋関数・テスト容易性のため分離）。
 */
function buildDriveConflictMessage(latestHeadRevisionId: string): string {
  return (
    "Drive 上でこのファイルは別の場所から更新されています" +
    `（最新リビジョン: ${latestHeadRevisionId}）。上書き保存しますか？`
  );
}

/**
 * pendingDriveFile（右クリック「anytime-markdown で編集」を Drive ファイル URL 上で押した
 * 結果）を読み取り、取り込み後は即座に削除する。値が無い/不正な場合は通常の自動保存復元へ
 * フォールバックする。chrome.identity で対話的にトークンを取得し、Drive から本文を読み込む。
 * 認証・取得に失敗した場合も自動保存復元へフォールバックする（グレースフルデグラデーション）。
 */
function consumePendingDriveFile(storage: StorageArea): void {
  storage.get([PENDING_DRIVE_FILE_KEY], (items) => {
    const raw = items?.[PENDING_DRIVE_FILE_KEY];
    storage.remove(PENDING_DRIVE_FILE_KEY, () => {
      const err = getRuntimeError();
      if (err) {
        console.warn(
          `[anytime-markdown] pendingDriveFile の削除に失敗しました: ${err.message ?? "unknown error"}`,
        );
      }
    });

    if (!isPendingDriveFile(raw)) {
      restoreAutoSaved(storage);
      return;
    }

    const provider = new DriveFileSystemProvider({
      getToken: getDriveAuthToken,
      confirmOverwrite: (latestHeadRevisionId) =>
        globalThis.confirm(buildDriveConflictMessage(latestHeadRevisionId)),
    });

    provider
      .openById(raw.fileId)
      .then((result) => {
        storage.get([THEME_KEY], (themeItems) => {
          createEditor(result.content, normalizeTheme(themeItems?.[THEME_KEY]), provider);
        });
      })
      .catch((error: unknown) => {
        console.error(
          `[${new Date().toISOString()}] [ERROR] Drive ファイル(${raw.fileId}) の読み込みに失敗しました: ` +
            (error instanceof Error ? (error.stack ?? error.message) : String(error)),
        );
        restoreAutoSaved(storage);
      });
  });
}

function init(): void {
  const storage = getStorage();
  if (!storage) {
    createEditor("", "light");
    return;
  }
  if (hasPendingDriveImportParam()) {
    consumePendingDriveFile(storage);
    return;
  }
  if (hasPendingImportParam()) {
    consumePendingImport(storage);
    return;
  }
  restoreAutoSaved(storage);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init, { once: true });
} else {
  init();
}

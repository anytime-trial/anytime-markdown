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

/**
 * 本拡張で WC に渡す最小オプション型（このファイルは esbuild トランスパイルのみで
 * 型検査を受けないため、必要な口だけを局所定義する）。
 */
interface RichEditorElement extends HTMLElement {
  options: {
    sideToolbar?: boolean;
    hide?: { explorer?: boolean };
    fileSystemProvider?: WebFileSystemProvider;
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
}

const STORAGE_KEY = "anytime-markdown:last-document";
/** 選択した light/dark テーマの保存先。再起動後に復元する。 */
const THEME_KEY = "anytime-markdown:theme";
/** 自動保存のデバウンス。chrome.storage の書込みスロットリング回避。 */
const SAVE_DEBOUNCE_MS = 500;

/** chrome.storage.local（拡張コンテキスト外では undefined）。 */
function getStorage(): StorageArea | undefined {
  return (globalThis as { chrome?: { storage?: { local?: StorageArea } } }).chrome
    ?.storage?.local;
}

/** chrome.runtime.lastError（保存失敗の検出用。拡張コンテキスト外では undefined）。 */
function getRuntimeError(): { message?: string } | undefined {
  return (globalThis as { chrome?: { runtime?: { lastError?: { message?: string } } } })
    .chrome?.runtime?.lastError;
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
 */
function createEditor(initialContent: string, initialTheme: "light" | "dark"): void {
  const root = document.getElementById("editor-root");
  if (!root) return;

  const el = document.createElement("anytime-markdown-rich-editor") as RichEditorElement;
  el.setAttribute("theme", initialTheme);
  el.setAttribute("locale", "ja");
  // web-app と同様に右端の縦サイドツールバー（アウトライン / コメント / 設定）を表示する。
  // hide.explorer は上部ツールバーの explorer トグル（fileSystemProvider 未配線で無意味）を
  // 抑止する（web-app の `hide={{ explorer: !enableGitHub }}` 相当）。サイドツールバー側の
  // explorer ボタンは onToggleExplorer 未配線のため元々描画されない。
  // File System Access API で .md を開く / 上書き保存 / 名前を付けて保存を有効化する
  // （拡張ページは secure context のため showOpenFilePicker / createWritable が使える）。
  // これにより toolbar の 開く / 保存 / 別名保存 アイコンが有効になる。
  // web-app と同じく onThemeModeChange を配線するとサイドツールバーに light/dark
  // 切替アイコンが表示される。切替時は `theme` 属性を更新（WC が editor 本文・chrome
  // トークン・アイコンを同期）し、選択を storage に永続化する。
  el.options = {
    sideToolbar: true,
    hide: { explorer: true },
    fileSystemProvider: new WebFileSystemProvider(),
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

function init(): void {
  const storage = getStorage();
  if (!storage) {
    createEditor("", "light");
    return;
  }
  storage.get([STORAGE_KEY, THEME_KEY], (items) => {
    const saved = items?.[STORAGE_KEY];
    createEditor(
      typeof saved === "string" ? saved : "",
      normalizeTheme(items?.[THEME_KEY]),
    );
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init, { once: true });
} else {
  init();
}

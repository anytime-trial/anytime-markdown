import { tryImportDroppedMdFile } from "../../utils/editorImageHandlers";

/**
 * 本文領域全体（`[data-am-content]`）への .md ドロップでファイルを開く。
 *
 * ProseMirror の `handleDrop` は .ProseMirror 上のドロップしか拾えないため、用紙余白や
 * 短い文書の下など本文領域の空白に落とすと PM に届かず、ブラウザがファイルへ遷移して
 * アプリが失われる。contentEl で Files ドラッグを preventDefault してナビゲーションを
 * 抑止し、.md を `fileOps.selectFile`（importRef 経由）で取り込む。
 *
 * モード非依存で「開く」に統一する: ソースモードでも .md は selectFile 経由で source
 * テキストを置き換える（WYSIWYG と同一フロー）。.md 以外のファイルは preventDefault で
 * ブラウザ遷移だけ防ぎ、取り込みは行わず無視する（textarea へのネイティブ挿入も Files
 * ドロップでは発生しないため挙動差はない）。
 */

function isMarkdownFile(f: File): boolean {
  return f.name.endsWith(".md") || f.name.endsWith(".markdown") || f.type === "text/markdown";
}

export interface ContentFileDropOptions {
  /** ドラッグ中の見た目を `data-file-drag-over` で表す editor root。 */
  readonly root: HTMLElement;
  readonly contentEl: HTMLElement;
  /** ドロップされた .md の取り込み先（`fileOps.selectFile` 相当）。 */
  readonly importRef: Parameters<typeof tryImportDroppedMdFile>[2];
}

/** 本文領域の .md ドロップを装着し、解除する dispose を返す。 */
export function installContentFileDrop(options: ContentFileDropOptions): () => void {
  const { root, contentEl, importRef } = options;

  const onDragOver = (e: DragEvent): void => {
    if (!e.dataTransfer?.types?.includes("Files")) return;
    // preventDefault しないと drop が発火せずブラウザが既定（ファイルを開く）を実行する。
    e.preventDefault();
    root.dataset.fileDragOver = "true";
  };

  const onDragLeave = (e: DragEvent): void => {
    if (!contentEl.contains(e.relatedTarget as Node | null)) {
      delete root.dataset.fileDragOver;
    }
  };

  const onDrop = (e: DragEvent): void => {
    // drop が来たらドラッグオーバー状態は必ず解除する（PM 側 DOM ハンドラと同じ不変条件）。
    delete root.dataset.fileDragOver;
    // .ProseMirror 内のドロップは PM の handleDrop が処理済み（preventDefault 済み）。
    // 二重取り込みを避けるため、既に処理済みなら何もしない。
    if (e.defaultPrevented) return;
    const files = e.dataTransfer?.files;
    if (!files?.length) return;
    // Files ドロップは常に preventDefault してブラウザのファイル遷移を防ぐ（.md 以外は無視）。
    e.preventDefault();
    const md = Array.from(files).find(isMarkdownFile);
    if (md) tryImportDroppedMdFile(md, e, importRef);
  };

  contentEl.addEventListener("dragover", onDragOver);
  contentEl.addEventListener("dragleave", onDragLeave);
  contentEl.addEventListener("drop", onDrop);

  return () => {
    contentEl.removeEventListener("dragover", onDragOver);
    contentEl.removeEventListener("dragleave", onDragLeave);
    contentEl.removeEventListener("drop", onDrop);
  };
}

import type { FileHandle, FileOpenResult, FileSystemProvider } from "../types/fileSystem";

/**
 * File System Access API（`showOpenFilePicker` / `showSaveFilePicker` / `createWritable`）ベースの
 * {@link FileSystemProvider}。secure context（https / localhost / 拡張ページ）で動作し、開いた
 * ファイルハンドルへの**上書き保存**に対応する。
 *
 * web-app・ブラウザ拡張など File System Access API が使える consumer で共有する
 * （VS Code は webview の vscode API ベースの別 provider を使う）。
 */

/** File System Access API の最小型定義。 */
interface FileSystemWritableFileStream extends WritableStream {
  write(data: string | BufferSource | Blob): Promise<void>;
  close(): Promise<void>;
}

interface FileSystemFileHandle {
  readonly name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<FileSystemWritableFileStream>;
}

interface OpenFilePickerOptions {
  types?: { description: string; accept: Record<string, string[]> }[];
  multiple?: boolean;
}

interface SaveFilePickerOptions {
  suggestedName?: string;
  types?: { description: string; accept: Record<string, string[]> }[];
}

interface FileSystemAccessWindow {
  showOpenFilePicker(options?: OpenFilePickerOptions): Promise<FileSystemFileHandle[]>;
  showSaveFilePicker(options?: SaveFilePickerOptions): Promise<FileSystemFileHandle>;
}

const MARKDOWN_TYPES = [
  { description: "Markdown", accept: { "text/markdown": [".md"] } },
];

export class WebFileSystemProvider implements FileSystemProvider {
  get supportsDirectAccess(): boolean {
    return typeof globalThis !== "undefined" && "showOpenFilePicker" in globalThis;
  }

  async open(): Promise<FileOpenResult | null> {
    if (!this.supportsDirectAccess) return null;
    try {
      const [nativeHandle] = await (
        globalThis as unknown as FileSystemAccessWindow
      ).showOpenFilePicker({ types: MARKDOWN_TYPES, multiple: false });
      const file: File = await nativeHandle.getFile();
      const content = await file.text();
      return { handle: { name: file.name, nativeHandle }, content };
    } catch (e) {
      // ユーザーキャンセル（AbortError）は正常系として無視。それ以外（権限/IO 等）は
      // 最低限ログ出力する（silent catch 禁止。browser ページで動くため console は可視）。
      if (e instanceof DOMException && e.name === "AbortError") return null;
      console.error("[WebFileSystemProvider] open failed", e);
      return null;
    }
  }

  async save(handle: FileHandle, content: string): Promise<void> {
    if (!handle.nativeHandle) return;
    const writable = await (handle.nativeHandle as FileSystemFileHandle).createWritable();
    await writable.write(content);
    await writable.close();
  }

  async saveAs(content: string): Promise<FileHandle | null> {
    if (!this.supportsDirectAccess) return null;
    try {
      const nativeHandle = await (
        globalThis as unknown as FileSystemAccessWindow
      ).showSaveFilePicker({ suggestedName: "document.md", types: MARKDOWN_TYPES });
      const writable = await nativeHandle.createWritable();
      await writable.write(content);
      await writable.close();
      return { name: nativeHandle.name, nativeHandle };
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return null;
      console.error("[WebFileSystemProvider] saveAs failed", e);
      return null;
    }
  }
}

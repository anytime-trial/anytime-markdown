import type { FileHandle, FileOpenResult, FileSystemProvider } from '@anytime-markdown/editor-core';

/** File System Access API の最小型定義 */
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

export class WebFileSystemProvider implements FileSystemProvider {
  get supportsDirectAccess(): boolean {
    return typeof window !== 'undefined' && 'showOpenFilePicker' in window;
  }

  async open(): Promise<FileOpenResult | null> {
    if (!this.supportsDirectAccess) return null;
    try {
      const [nativeHandle] = await (window as unknown as FileSystemAccessWindow).showOpenFilePicker({
        types: [{ description: 'Markdown', accept: { 'text/markdown': ['.md'] } }],
        multiple: false,
      });
      const file: File = await nativeHandle.getFile();
      const content = await file.text();
      return { handle: { name: file.name, nativeHandle }, content };
    } catch {
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
      const nativeHandle = await (window as unknown as FileSystemAccessWindow).showSaveFilePicker({
        suggestedName: 'document.md',
        types: [{ description: 'Markdown', accept: { 'text/markdown': ['.md'] } }],
      });
      const writable = await nativeHandle.createWritable();
      await writable.write(content);
      await writable.close();
      return { name: nativeHandle.name, nativeHandle };
    } catch {
      return null;
    }
  }
}

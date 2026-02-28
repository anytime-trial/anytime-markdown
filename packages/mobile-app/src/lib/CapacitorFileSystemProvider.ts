import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { FilePicker } from '@capawesome/capacitor-file-picker';
import type { FileHandle, FileOpenResult, FileSystemProvider } from '@anytime-markdown/editor-core';

export class CapacitorFileSystemProvider implements FileSystemProvider {
  readonly supportsDirectAccess = true;

  async open(): Promise<FileOpenResult | null> {
    try {
      const result = await FilePicker.pickFiles({
        types: ['text/markdown', 'text/plain'],
        limit: 1,
        readData: true,
      });
      const file = result.files[0];
      if (!file || !file.data) return null;
      const content = atob(file.data);
      return {
        handle: { name: file.name, path: file.path },
        content,
      };
    } catch {
      return null;
    }
  }

  async save(handle: FileHandle, content: string): Promise<void> {
    if (!handle.path) return;
    await Filesystem.writeFile({
      path: handle.path,
      data: content,
      encoding: Encoding.UTF8,
    });
  }

  async saveAs(content: string): Promise<FileHandle | null> {
    const now = new Date();
    const ts = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
    const fileName = `document_${ts}.md`;
    try {
      const result = await Filesystem.writeFile({
        path: fileName,
        data: content,
        directory: Directory.Documents,
        encoding: Encoding.UTF8,
      });
      return { name: fileName, path: result.uri };
    } catch {
      return null;
    }
  }
}

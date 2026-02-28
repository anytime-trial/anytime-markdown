import type { FileHandle, FileOpenResult, FileSystemProvider } from '@anytime-markdown/editor-core';

export class FallbackFileSystemProvider implements FileSystemProvider {
  readonly supportsDirectAccess = false;

  open(): Promise<FileOpenResult | null> {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.md,text/markdown,text/plain';
      input.onchange = async () => {
        const file = input.files?.[0];
        if (!file) { resolve(null); return; }
        const content = await file.text();
        resolve({ handle: { name: file.name }, content });
      };
      input.oncancel = () => resolve(null);
      input.click();
    });
  }

  async save(_handle: FileHandle, content: string): Promise<void> {
    await this.saveAs(content);
  }

  async saveAs(content: string): Promise<FileHandle | null> {
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const now = new Date();
    const ts = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
    a.download = `document_${ts}.md`;
    a.click();
    URL.revokeObjectURL(url);
    return null;
  }
}

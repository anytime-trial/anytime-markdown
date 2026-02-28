import { useState, useCallback } from 'react';
import type { FileHandle, FileSystemProvider } from '../types/fileSystem';

export function useFileSystem(provider: FileSystemProvider | null | undefined) {
  const [fileHandle, setFileHandle] = useState<FileHandle | null>(null);
  const [isDirty, setIsDirty] = useState(false);

  const supportsDirectAccess = provider?.supportsDirectAccess ?? false;
  const fileName = fileHandle?.name ?? null;

  const openFile = useCallback(async (): Promise<string | null> => {
    if (!provider) return null;
    const result = await provider.open();
    if (!result) return null;
    setFileHandle(result.handle);
    setIsDirty(false);
    return result.content;
  }, [provider]);

  const saveFile = useCallback(async (content: string): Promise<void> => {
    if (!provider) return;
    if (fileHandle) {
      await provider.save(fileHandle, content);
    } else {
      const newHandle = await provider.saveAs(content);
      if (newHandle) setFileHandle(newHandle);
    }
    setIsDirty(false);
  }, [provider, fileHandle]);

  const saveAsFile = useCallback(async (content: string): Promise<void> => {
    if (!provider) return;
    const newHandle = await provider.saveAs(content);
    if (newHandle) {
      setFileHandle(newHandle);
      setIsDirty(false);
    }
  }, [provider]);

  const markDirty = useCallback(() => setIsDirty(true), []);

  const resetFile = useCallback(() => {
    setFileHandle(null);
    setIsDirty(false);
  }, []);

  return {
    fileHandle, fileName, isDirty, supportsDirectAccess,
    openFile, saveFile, saveAsFile, markDirty, resetFile,
  };
}

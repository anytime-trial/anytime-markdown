import { useCallback, useEffect, useState } from 'react';

import { STORAGE_KEY_FILENAME } from '../constants/storageKeys';
import type { FileHandle, FileSystemProvider } from '../types/fileSystem';
import { clearNativeHandle, loadNativeHandle, saveNativeHandle } from '../utils/fileHandleStore';

export function useFileSystem(provider: FileSystemProvider | null | undefined) {
  const [fileHandle, setFileHandleRaw] = useState<FileHandle | null>(() => {
    try {
      const saved = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY_FILENAME) : null;
      return saved ? { name: saved } : null;
    } catch {
      return null;
    }
  });
  const [isDirty, setIsDirty] = useState(false);

  // リロード時に IndexedDB から nativeHandle を復元
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const name = fileHandle?.name;
    if (!name || fileHandle?.nativeHandle) return;
    let cancelled = false;
    loadNativeHandle().then((native) => {
      if (!cancelled && native && native.name === name) {
        setFileHandleRaw({ name, nativeHandle: native });
      }
    }).catch(() => { /* IndexedDB 読み込み失敗は無視 */ });
    return () => { cancelled = true; };
    // 初回マウント時のみ実行
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // fileHandle 変更時に localStorage と IndexedDB に永続化
  useEffect(() => {
    try {
      if (fileHandle?.name) {
        localStorage.setItem(STORAGE_KEY_FILENAME, fileHandle.name);
      } else {
        localStorage.removeItem(STORAGE_KEY_FILENAME);
      }
    } catch {
      // localStorage 書き込み失敗は無視
    }
    if (fileHandle?.nativeHandle) {
      saveNativeHandle(fileHandle.nativeHandle as FileSystemFileHandle).catch(() => {});
    } else if (!fileHandle) {
      clearNativeHandle().catch(() => {});
    }
  }, [fileHandle]);

  const setFileHandle = useCallback((handle: FileHandle | null) => {
    setFileHandleRaw(handle);
  }, []);

  const supportsDirectAccess = provider?.supportsDirectAccess ?? false;
  const fileName = fileHandle?.name ?? null;

  const openFile = useCallback(async (): Promise<string | null> => {
    if (!provider) return null;
    const result = await provider.open();
    if (!result) return null;
    setFileHandleRaw(result.handle);
    setIsDirty(false);
    return result.content;
  }, [provider]);

  const saveFile = useCallback(async (content: string): Promise<boolean> => {
    if (!provider) return false;
    if (fileHandle?.nativeHandle) {
      // nativeHandle の書き込み権限を確認・要求
      const handle = fileHandle.nativeHandle as FileSystemFileHandle;
      if (typeof (handle as unknown as { queryPermission: unknown }).queryPermission === 'function') {
        const perm = await (handle as unknown as { queryPermission(d: { mode: string }): Promise<string> }).queryPermission({ mode: 'readwrite' });
        if (perm !== 'granted') {
          const req = await (handle as unknown as { requestPermission(d: { mode: string }): Promise<string> }).requestPermission({ mode: 'readwrite' });
          if (req !== 'granted') {
            // 権限拒否時は saveAs にフォールバック
            const newHandle = await provider.saveAs(content);
            if (!newHandle) return false;
            setFileHandleRaw(newHandle);
            setIsDirty(false);
            return true;
          }
        }
      }
      await provider.save(fileHandle, content);
    } else {
      const newHandle = await provider.saveAs(content);
      if (!newHandle) return false;
      setFileHandleRaw(newHandle);
    }
    setIsDirty(false);
    return true;
  }, [provider, fileHandle]);

  const saveAsFile = useCallback(async (content: string): Promise<boolean> => {
    if (!provider) return false;
    const newHandle = await provider.saveAs(content);
    if (newHandle) {
      setFileHandleRaw(newHandle);
      setIsDirty(false);
      return true;
    }
    return false;
  }, [provider]);

  const markDirty = useCallback(() => setIsDirty(true), []);

  const resetFile = useCallback(() => {
    setFileHandleRaw(null);
    setIsDirty(false);
  }, []);

  return {
    fileHandle, setFileHandle, fileName, isDirty, supportsDirectAccess,
    openFile, saveFile, saveAsFile, markDirty, resetFile,
  };
}

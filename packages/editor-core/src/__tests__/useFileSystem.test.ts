import { renderHook, act } from '@testing-library/react';
import { useFileSystem } from '../hooks/useFileSystem';
import type { FileSystemProvider, FileHandle } from '../types/fileSystem';

function createMockProvider(overrides?: Partial<FileSystemProvider>): FileSystemProvider {
  return {
    open: jest.fn().mockResolvedValue(null),
    save: jest.fn().mockResolvedValue(undefined),
    saveAs: jest.fn().mockResolvedValue(null),
    supportsDirectAccess: true,
    ...overrides,
  };
}

describe('useFileSystem', () => {
  test('初期状態: handle が null, isDirty が false', () => {
    const provider = createMockProvider();
    const { result } = renderHook(() => useFileSystem(provider));
    expect(result.current.fileHandle).toBeNull();
    expect(result.current.isDirty).toBe(false);
    expect(result.current.fileName).toBeNull();
  });

  test('openFile: provider.open を呼び出しハンドルとコンテンツを返す', async () => {
    const mockHandle: FileHandle = { name: 'test.md' };
    const provider = createMockProvider({
      open: jest.fn().mockResolvedValue({ handle: mockHandle, content: '# Hello' }),
    });
    const { result } = renderHook(() => useFileSystem(provider));
    let content: string | null = null;
    await act(async () => { content = await result.current.openFile(); });
    expect(content).toBe('# Hello');
    expect(result.current.fileHandle).toEqual(mockHandle);
    expect(result.current.fileName).toBe('test.md');
    expect(result.current.isDirty).toBe(false);
  });

  test('openFile: ユーザーキャンセル時は null を返し状態変更なし', async () => {
    const provider = createMockProvider({ open: jest.fn().mockResolvedValue(null) });
    const { result } = renderHook(() => useFileSystem(provider));
    let content: string | null = null;
    await act(async () => { content = await result.current.openFile(); });
    expect(content).toBeNull();
    expect(result.current.fileHandle).toBeNull();
  });

  test('saveFile: ハンドルあり時に provider.save を呼び出す', async () => {
    const mockHandle: FileHandle = { name: 'test.md' };
    const saveFn = jest.fn().mockResolvedValue(undefined);
    const provider = createMockProvider({
      open: jest.fn().mockResolvedValue({ handle: mockHandle, content: '# Hello' }),
      save: saveFn,
    });
    const { result } = renderHook(() => useFileSystem(provider));
    await act(async () => { await result.current.openFile(); });
    act(() => { result.current.markDirty(); });
    expect(result.current.isDirty).toBe(true);
    await act(async () => { await result.current.saveFile('# Updated'); });
    expect(saveFn).toHaveBeenCalledWith(mockHandle, '# Updated');
    expect(result.current.isDirty).toBe(false);
  });

  test('saveFile: ハンドルなし時に saveAs にフォールバック', async () => {
    const newHandle: FileHandle = { name: 'new.md' };
    const saveAsFn = jest.fn().mockResolvedValue(newHandle);
    const provider = createMockProvider({ saveAs: saveAsFn });
    const { result } = renderHook(() => useFileSystem(provider));
    await act(async () => { await result.current.saveFile('# New content'); });
    expect(saveAsFn).toHaveBeenCalledWith('# New content');
    expect(result.current.fileHandle).toEqual(newHandle);
    expect(result.current.isDirty).toBe(false);
  });

  test('saveAsFile: 新しいハンドルを返し状態を更新', async () => {
    const newHandle: FileHandle = { name: 'saved.md' };
    const provider = createMockProvider({ saveAs: jest.fn().mockResolvedValue(newHandle) });
    const { result } = renderHook(() => useFileSystem(provider));
    await act(async () => { await result.current.saveAsFile('# Content'); });
    expect(result.current.fileHandle).toEqual(newHandle);
    expect(result.current.fileName).toBe('saved.md');
    expect(result.current.isDirty).toBe(false);
  });

  test('resetFile: ハンドルをクリアし isDirty を false にする', async () => {
    const mockHandle: FileHandle = { name: 'test.md' };
    const provider = createMockProvider({
      open: jest.fn().mockResolvedValue({ handle: mockHandle, content: '# Hello' }),
    });
    const { result } = renderHook(() => useFileSystem(provider));
    await act(async () => { await result.current.openFile(); });
    act(() => { result.current.markDirty(); });
    act(() => { result.current.resetFile(); });
    expect(result.current.fileHandle).toBeNull();
    expect(result.current.isDirty).toBe(false);
  });

  test('provider が null の場合は全操作が null/noop を返す', async () => {
    const { result } = renderHook(() => useFileSystem(null));
    let content: string | null = 'initial';
    await act(async () => { content = await result.current.openFile(); });
    expect(content).toBeNull();
    expect(result.current.supportsDirectAccess).toBe(false);
  });
});

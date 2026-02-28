# File System Access 実装計画

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Web/モバイルでローカルファイルを直接開いて上書き保存できるようにする

**Architecture:** FileSystemProvider インターフェースで抽象化し、Web は File System Access API (Chrome/Edge) + フォールバック (Safari/Firefox)、モバイルは Capacitor Filesystem で実装。editor-core の useFileSystem hook が状態管理を担当。

**Tech Stack:** File System Access API, @capacitor/filesystem, @capawesome/capacitor-file-picker, React hooks

**Design Doc:** `docs/plans/2026-02-28-file-system-access-design.md`

---

### Task 1: FileSystemProvider インターフェース定義

**Files:**
- Create: `packages/editor-core/src/types/fileSystem.ts`

**Step 1: 型定義ファイルを作成**

```typescript
// packages/editor-core/src/types/fileSystem.ts
export interface FileHandle {
  name: string;
  nativeHandle?: unknown;
  path?: string;
}

export interface FileOpenResult {
  handle: FileHandle;
  content: string;
}

export interface FileSystemProvider {
  open(): Promise<FileOpenResult | null>;
  save(handle: FileHandle, content: string): Promise<void>;
  saveAs(content: string): Promise<FileHandle | null>;
  supportsDirectAccess: boolean;
}
```

**Step 2: editor-core の index.ts から型をエクスポート**

`packages/editor-core/src/index.ts` に追加:
```typescript
export type { FileHandle, FileOpenResult, FileSystemProvider } from './types/fileSystem';
```

**Step 3: 型チェック**

Run: `npx tsc --noEmit`
Expected: PASS

**Step 4: コミット**

```bash
git add packages/editor-core/src/types/fileSystem.ts packages/editor-core/src/index.ts
git commit -m "feat: add FileSystemProvider interface types"
```

---

### Task 2: useFileSystem hook - テスト作成

**Files:**
- Create: `packages/editor-core/src/__tests__/useFileSystem.test.ts`

**Step 1: テストを作成**

```typescript
// packages/editor-core/src/__tests__/useFileSystem.test.ts
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
    await act(async () => {
      content = await result.current.openFile();
    });

    expect(content).toBe('# Hello');
    expect(result.current.fileHandle).toEqual(mockHandle);
    expect(result.current.fileName).toBe('test.md');
    expect(result.current.isDirty).toBe(false);
  });

  test('openFile: ユーザーキャンセル時は null を返し状態変更なし', async () => {
    const provider = createMockProvider({
      open: jest.fn().mockResolvedValue(null),
    });
    const { result } = renderHook(() => useFileSystem(provider));

    let content: string | null = null;
    await act(async () => {
      content = await result.current.openFile();
    });

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

    await act(async () => {
      await result.current.openFile();
    });
    act(() => { result.current.markDirty(); });
    expect(result.current.isDirty).toBe(true);

    await act(async () => {
      await result.current.saveFile('# Updated');
    });

    expect(saveFn).toHaveBeenCalledWith(mockHandle, '# Updated');
    expect(result.current.isDirty).toBe(false);
  });

  test('saveFile: ハンドルなし時に saveAs にフォールバック', async () => {
    const newHandle: FileHandle = { name: 'new.md' };
    const saveAsFn = jest.fn().mockResolvedValue(newHandle);
    const provider = createMockProvider({ saveAs: saveAsFn });
    const { result } = renderHook(() => useFileSystem(provider));

    await act(async () => {
      await result.current.saveFile('# New content');
    });

    expect(saveAsFn).toHaveBeenCalledWith('# New content');
    expect(result.current.fileHandle).toEqual(newHandle);
    expect(result.current.isDirty).toBe(false);
  });

  test('saveAsFile: 新しいハンドルを返し状態を更新', async () => {
    const newHandle: FileHandle = { name: 'saved.md' };
    const provider = createMockProvider({
      saveAs: jest.fn().mockResolvedValue(newHandle),
    });
    const { result } = renderHook(() => useFileSystem(provider));

    await act(async () => {
      await result.current.saveAsFile('# Content');
    });

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

    await act(async () => {
      await result.current.openFile();
    });
    act(() => { result.current.markDirty(); });

    act(() => { result.current.resetFile(); });

    expect(result.current.fileHandle).toBeNull();
    expect(result.current.isDirty).toBe(false);
  });

  test('provider が null の場合は全操作が null/noop を返す', async () => {
    const { result } = renderHook(() => useFileSystem(null));

    let content: string | null = 'initial';
    await act(async () => {
      content = await result.current.openFile();
    });
    expect(content).toBeNull();

    expect(result.current.supportsDirectAccess).toBe(false);
  });
});
```

**Step 2: テスト実行 - 失敗を確認**

Run: `cd packages/editor-core && npx jest src/__tests__/useFileSystem.test.ts`
Expected: FAIL (useFileSystem モジュールが存在しない)

---

### Task 3: useFileSystem hook - 実装

**Files:**
- Create: `packages/editor-core/src/hooks/useFileSystem.ts`

**Step 1: hook を実装**

```typescript
// packages/editor-core/src/hooks/useFileSystem.ts
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
    fileHandle,
    fileName,
    isDirty,
    supportsDirectAccess,
    openFile,
    saveFile,
    saveAsFile,
    markDirty,
    resetFile,
  };
}
```

**Step 2: テスト実行 - 成功を確認**

Run: `cd packages/editor-core && npx jest src/__tests__/useFileSystem.test.ts`
Expected: PASS (全テスト)

**Step 3: 型チェック**

Run: `npx tsc --noEmit`
Expected: PASS

**Step 4: コミット**

```bash
git add packages/editor-core/src/hooks/useFileSystem.ts packages/editor-core/src/__tests__/useFileSystem.test.ts
git commit -m "feat: add useFileSystem hook with tests"
```

---

### Task 4: WebFileSystemProvider - テスト作成と実装

**Files:**
- Create: `packages/web-app/src/lib/WebFileSystemProvider.ts`
- Create: `packages/web-app/src/__tests__/WebFileSystemProvider.test.ts`

**Step 1: テストを作成**

```typescript
// packages/web-app/src/__tests__/WebFileSystemProvider.test.ts
import { WebFileSystemProvider } from '../lib/WebFileSystemProvider';

describe('WebFileSystemProvider', () => {
  test('supportsDirectAccess は showOpenFilePicker の存在に依存', () => {
    const provider = new WebFileSystemProvider();
    // jsdom には showOpenFilePicker がないので false
    expect(provider.supportsDirectAccess).toBe(false);
  });
});
```

**Step 2: Provider を実装**

```typescript
// packages/web-app/src/lib/WebFileSystemProvider.ts
import type { FileHandle, FileOpenResult, FileSystemProvider } from '@anytime-markdown/editor-core';

export class WebFileSystemProvider implements FileSystemProvider {
  get supportsDirectAccess(): boolean {
    return typeof window !== 'undefined' && 'showOpenFilePicker' in window;
  }

  async open(): Promise<FileOpenResult | null> {
    if (!this.supportsDirectAccess) return null;
    try {
      const [nativeHandle] = await (window as any).showOpenFilePicker({
        types: [{ description: 'Markdown', accept: { 'text/markdown': ['.md'] } }],
        multiple: false,
      });
      const file: File = await nativeHandle.getFile();
      const content = await file.text();
      return {
        handle: { name: file.name, nativeHandle },
        content,
      };
    } catch {
      return null; // ユーザーキャンセル
    }
  }

  async save(handle: FileHandle, content: string): Promise<void> {
    if (!handle.nativeHandle) return;
    const writable = await (handle.nativeHandle as any).createWritable();
    await writable.write(content);
    await writable.close();
  }

  async saveAs(content: string): Promise<FileHandle | null> {
    if (!this.supportsDirectAccess) return null;
    try {
      const nativeHandle = await (window as any).showSaveFilePicker({
        suggestedName: 'document.md',
        types: [{ description: 'Markdown', accept: { 'text/markdown': ['.md'] } }],
      });
      const writable = await nativeHandle.createWritable();
      await writable.write(content);
      await writable.close();
      return { name: nativeHandle.name, nativeHandle };
    } catch {
      return null; // ユーザーキャンセル
    }
  }
}
```

**Step 3: テスト実行**

Run: `cd packages/web-app && npx jest src/__tests__/WebFileSystemProvider.test.ts`
Expected: PASS

**Step 4: コミット**

```bash
git add packages/web-app/src/lib/WebFileSystemProvider.ts packages/web-app/src/__tests__/WebFileSystemProvider.test.ts
git commit -m "feat: add WebFileSystemProvider with File System Access API"
```

---

### Task 5: FallbackFileSystemProvider 実装

**Files:**
- Create: `packages/web-app/src/lib/FallbackFileSystemProvider.ts`

**Step 1: Provider を実装**

```typescript
// packages/web-app/src/lib/FallbackFileSystemProvider.ts
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
    // フォールバック: 上書き保存は不可能なので saveAs と同じ動作
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
    return null; // フォールバックではハンドルを保持しない
  }
}
```

**Step 2: 型チェック**

Run: `npx tsc --noEmit`
Expected: PASS

**Step 3: コミット**

```bash
git add packages/web-app/src/lib/FallbackFileSystemProvider.ts
git commit -m "feat: add FallbackFileSystemProvider for non-supporting browsers"
```

---

### Task 6: 翻訳キー追加

**Files:**
- Modify: `packages/editor-core/src/i18n/ja.json`
- Modify: `packages/editor-core/src/i18n/en.json`

**Step 1: ja.json に追加**

既存の `"download"` キーの後に以下を追加:
```json
"openFile": "開く",
"saveFile": "上書き保存",
"saveAsFile": "名前を付けて保存",
```

**Step 2: en.json に追加**

同じ位置に以下を追加:
```json
"openFile": "Open",
"saveFile": "Save",
"saveAsFile": "Save As",
```

**Step 3: コミット**

```bash
git add packages/editor-core/src/i18n/ja.json packages/editor-core/src/i18n/en.json
git commit -m "feat: add file operation translation keys"
```

---

### Task 7: EditorToolbar にボタン追加

**Files:**
- Modify: `packages/editor-core/src/components/EditorToolbar.tsx`

**Step 1: props に追加**

`EditorToolbarProps` に追加:
```typescript
onOpenFile?: () => void;
onSaveFile?: () => void;
onSaveAsFile?: () => void;
hasFileHandle?: boolean;
supportsDirectAccess?: boolean;
```

**Step 2: アイコン import 追加**

```typescript
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import SaveIcon from '@mui/icons-material/Save';
import SaveAsIcon from '@mui/icons-material/SaveAs';
```

**Step 3: ボタン変更**

既存の「Upload」ボタン（`FileUploadIcon`）を「開く」ボタン（`FolderOpenIcon`）に置換。
既存の「Download」ボタン（`DownloadIcon`）を「名前を付けて保存」ボタン（`SaveAsIcon`）に置換。
その間に「上書き保存」ボタン（`SaveIcon`）を追加。`disabled` は `!hasFileHandle` の場合。

`supportsDirectAccess` が false の場合は、アイコンとラベルを現行のまま維持（Upload / Download 表記）。

**Step 4: 型チェック**

Run: `npx tsc --noEmit`
Expected: PASS

**Step 5: コミット**

```bash
git add packages/editor-core/src/components/EditorToolbar.tsx
git commit -m "feat: add open/save/saveAs buttons to toolbar"
```

---

### Task 8: StatusBar にファイル名表示追加

**Files:**
- Modify: `packages/editor-core/src/components/StatusBar.tsx`

**Step 1: props に追加**

`StatusBarProps` に追加:
```typescript
fileName?: string | null;
isDirty?: boolean;
```

**Step 2: ファイル名表示を追加**

既存の行数表示の後、`<Box sx={{ flex: 1 }} />` の前に:
```tsx
{fileName && (
  <Typography variant="caption" sx={{ ml: 2, opacity: 0.7 }}>
    {fileName}{isDirty ? ' *' : ''}
  </Typography>
)}
```

**Step 3: 型チェック**

Run: `npx tsc --noEmit`
Expected: PASS

**Step 4: コミット**

```bash
git add packages/editor-core/src/components/StatusBar.tsx
git commit -m "feat: show filename and dirty indicator in status bar"
```

---

### Task 9: useEditorFileOps に useFileSystem を統合

**Files:**
- Modify: `packages/editor-core/src/hooks/useEditorFileOps.ts`

**Step 1: パラメータに fileSystem 関連を追加**

`UseEditorFileOpsParams` に追加:
```typescript
openFile?: () => Promise<string | null>;
saveFile?: (content: string) => Promise<void>;
saveAsFile?: (content: string) => Promise<void>;
resetFile?: () => void;
```

**Step 2: handleOpenFile を追加**

```typescript
const handleOpenFile = useCallback(async () => {
  if (!openFile) return;
  const content = await openFile();
  if (content === null) return;
  const sanitized = sanitizeMarkdown(content);
  if (sourceMode) {
    setSourceText(sanitized);
  } else if (editor) {
    editor.commands.setContent(parseMarkdownToEditor(sanitized, editor));
  }
}, [openFile, editor, sourceMode, setSourceText]);
```

**Step 3: handleSaveFile / handleSaveAsFile を追加**

```typescript
const handleSaveFile = useCallback(async () => {
  if (!saveFile) return;
  const md = sourceMode ? sourceText : getMarkdownFromEditor(editor);
  if (md !== null) await saveFile(md);
}, [saveFile, editor, sourceMode, sourceText]);

const handleSaveAsFile = useCallback(async () => {
  if (!saveAsFile) return;
  const md = sourceMode ? sourceText : getMarkdownFromEditor(editor);
  if (md !== null) await saveAsFile(md);
}, [saveAsFile, editor, sourceMode, sourceText]);
```

**Step 4: handleClear を拡張 - resetFile を呼び出し**

既存の `handleClear` 内で `clearContent()` の後に `resetFile?.()` を追加。

**Step 5: 戻り値に追加**

```typescript
return { ..., handleOpenFile, handleSaveFile, handleSaveAsFile };
```

**Step 6: テスト実行**

Run: `cd packages/editor-core && npx jest`
Expected: PASS (既存テスト + useFileSystem テスト)

**Step 7: コミット**

```bash
git add packages/editor-core/src/hooks/useEditorFileOps.ts
git commit -m "feat: integrate useFileSystem into useEditorFileOps"
```

---

### Task 10: MarkdownEditorPage に統合

**Files:**
- Modify: `packages/editor-core/src/MarkdownEditorPage.tsx`

**Step 1: props に fileSystemProvider を追加**

```typescript
interface MarkdownEditorPageProps {
  // ... 既存 props
  fileSystemProvider?: FileSystemProvider | null;
}
```

**Step 2: useFileSystem hook を呼び出し**

```typescript
const {
  fileHandle, fileName, isDirty,
  supportsDirectAccess,
  openFile, saveFile, saveAsFile, markDirty, resetFile,
} = useFileSystem(fileSystemProvider ?? null);
```

**Step 3: useEditorFileOps に openFile/saveFile/saveAsFile/resetFile を渡す**

**Step 4: saveContent の後に markDirty を呼び出し**

既存の `saveContent` コールバック内で、localStorage 保存後に `markDirty()` を呼ぶ。

**Step 5: キーボードショートカット追加**

既存のキーボードハンドラ内に追加:
```typescript
// Ctrl/Cmd + S: 上書き保存
if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key === 's') {
  e.preventDefault();
  handleSaveFile();
  return;
}
// Ctrl/Cmd + O: ファイルを開く
if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key === 'o') {
  e.preventDefault();
  handleOpenFile();
  return;
}
```

**Step 6: EditorToolbar に新 props を渡す**

```typescript
<EditorToolbar
  // ... 既存 props
  onOpenFile={handleOpenFile}
  onSaveFile={handleSaveFile}
  onSaveAsFile={handleSaveAsFile}
  hasFileHandle={fileHandle !== null}
  supportsDirectAccess={supportsDirectAccess}
/>
```

**Step 7: StatusBar に新 props を渡す**

```typescript
<StatusBar
  // ... 既存 props
  fileName={fileName}
  isDirty={isDirty}
/>
```

**Step 8: 型チェック + テスト**

Run: `npx tsc --noEmit && cd packages/editor-core && npx jest`
Expected: PASS

**Step 9: コミット**

```bash
git add packages/editor-core/src/MarkdownEditorPage.tsx
git commit -m "feat: integrate file system into MarkdownEditorPage"
```

---

### Task 11: web-app に Provider を注入

**Files:**
- Modify: `packages/web-app/src/app/page.tsx`

**Step 1: Provider を生成して渡す**

```typescript
'use client';
import { useMemo } from 'react';
import { WebFileSystemProvider } from '../lib/WebFileSystemProvider';
import { FallbackFileSystemProvider } from '../lib/FallbackFileSystemProvider';

// コンポーネント内:
const fileSystemProvider = useMemo(() => {
  if (typeof window === 'undefined') return null;
  const web = new WebFileSystemProvider();
  return web.supportsDirectAccess ? web : new FallbackFileSystemProvider();
}, []);

// MarkdownEditorPage に渡す:
<MarkdownEditorPage
  // ... 既存 props
  fileSystemProvider={fileSystemProvider}
/>
```

**Step 2: 型チェック + テスト**

Run: `npx tsc --noEmit && cd packages/web-app && npx jest`
Expected: PASS

**Step 3: コミット**

```bash
git add packages/web-app/src/app/page.tsx
git commit -m "feat: inject FileSystemProvider into web-app"
```

---

### Task 12: CapacitorFileSystemProvider（モバイル）

**Files:**
- Create: `packages/mobile-app/src/lib/CapacitorFileSystemProvider.ts`

**Step 1: 依存パッケージ追加**

```bash
cd packages/mobile-app
npm i @capacitor/filesystem @capawesome/capacitor-file-picker
```

**Step 2: Provider 実装**

```typescript
// packages/mobile-app/src/lib/CapacitorFileSystemProvider.ts
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
```

**Step 3: 型チェック**

Run: `npx tsc --noEmit`
Expected: PASS

**Step 4: コミット**

```bash
git add packages/mobile-app/src/lib/CapacitorFileSystemProvider.ts packages/mobile-app/package.json
git commit -m "feat: add CapacitorFileSystemProvider for mobile file access"
```

---

### Task 13: 全体検証

**Step 1: 全テスト実行**

```bash
cd packages/editor-core && npx jest
cd packages/web-app && npx jest
```
Expected: 全テスト PASS

**Step 2: 型チェック**

Run: `npx tsc --noEmit`
Expected: PASS

**Step 3: ビルド確認**

```bash
cd packages/web-app && npm run build
cd packages/vscode-extension && npx webpack --mode production
```
Expected: ビルド成功

**Step 4: 最終コミットが不要であることを確認**

Run: `git status`
Expected: clean

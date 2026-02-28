# File System Access - 設計書

## 概要

Web/モバイルでローカルファイルを直接開いて保存できるようにする。現在の「インポート/ダウンロード」モデルを「開く/保存」モデルに進化させる。

## 方針

ハイブリッドアプローチを採用:
- **Web (Chrome/Edge)**: File System Access API でファイルハンドルを保持し、上書き保存に対応
- **Web (Safari/Firefox)**: 現行の input[file] + Blob ダウンロードにフォールバック
- **モバイル (Capacitor)**: `@capacitor/filesystem` + `@capawesome/capacitor-file-picker` でネイティブファイルアクセス
- **VS Code**: スコープ外（既存の localStorage ブリッジを維持）

## アーキテクチャ

```
editor-core (共通)
  └─ useFileSystem hook (抽象レイヤー)
       ├─ FileSystemProvider interface
       │    ├─ open(): Promise<{ handle, content } | null>
       │    ├─ save(handle, content): Promise<void>
       │    ├─ saveAs(content): Promise<FileHandle | null>
       │    └─ supportsDirectAccess: boolean
       │
       ├─ WebFileSystemProvider (File System Access API)
       ├─ CapacitorFileSystemProvider (@capacitor/filesystem)
       └─ FallbackFileSystemProvider (input[file] + Blob download)
```

Provider は `MarkdownEditorPage` の props として注入。プラットフォーム側（web-app / mobile-app）が具体的な Provider を生成。

## インターフェース定義

```typescript
interface FileHandle {
  name: string;
  nativeHandle?: unknown;  // File System Access API の FileSystemFileHandle
  path?: string;           // Capacitor 用ファイルパス
}

interface FileSystemProvider {
  open(): Promise<{ handle: FileHandle; content: string } | null>;
  save(handle: FileHandle, content: string): Promise<void>;
  saveAs(content: string): Promise<FileHandle | null>;
  supportsDirectAccess: boolean;
}
```

## 状態管理

```typescript
// useFileSystem hook
interface FileState {
  handle: FileHandle | null;  // 現在開いているファイル
  isDirty: boolean;           // 未保存の変更あり
}
```

- `handle`: ファイルを開いた時・名前を付けて保存した時にセット
- `isDirty`: エディタ更新時に true、保存時に false
- 新規作成時に `handle` を null にリセット

## UI 変更

### ツールバー

| 現在 | 変更後 | 条件 |
|------|--------|------|
| アップロード（インポート） | **開く** (FolderOpenIcon) | 常時表示 |
| _(なし)_ | **上書き保存** (SaveIcon) | ファイルハンドル保持時のみ有効 |
| ダウンロード | **名前を付けて保存** (SaveAsIcon) | 常時表示 |
| 新規作成 | 変更なし | |
| コピー | 変更なし | |

### ステータスバー

ファイル名を表示。未保存の変更がある場合は `*` を付加（例: `document.md *`）。

## 操作フロー

### 「開く」
1. File System Access API 対応 → `showOpenFilePicker()` → ハンドル保持
2. Capacitor → file-picker → `Filesystem.readFile()` → パス保持
3. フォールバック → `input[type=file]`（ハンドルなし）

### 「上書き保存」(Ctrl+S)
1. ハンドルあり → 上書き保存
2. ハンドルなし → 「名前を付けて保存」にフォールバック

### 「名前を付けて保存」
1. File System Access API → `showSaveFilePicker()` → 新ハンドル保持
2. Capacitor → `Filesystem.writeFile()` → Documents ディレクトリ
3. フォールバック → Blob ダウンロード

## 変更ファイル

### 新規

| ファイル | 内容 |
|---------|------|
| `editor-core/src/types/fileSystem.ts` | FileHandle, FileSystemProvider インターフェース |
| `editor-core/src/hooks/useFileSystem.ts` | ファイル状態管理 hook |
| `web-app/src/lib/WebFileSystemProvider.ts` | File System Access API 実装 |
| `web-app/src/lib/FallbackFileSystemProvider.ts` | input[file] + Blob ダウンロード実装 |
| `mobile-app/src/lib/CapacitorFileSystemProvider.ts` | Capacitor Filesystem 実装 |

### 変更

| ファイル | 変更内容 |
|---------|---------|
| `editor-core/src/MarkdownEditorPage.tsx` | fileSystemProvider prop 追加、Ctrl+S ハンドラ |
| `editor-core/src/components/EditorToolbar.tsx` | 開く/保存/名前を付けて保存ボタン |
| `editor-core/src/components/StatusBar.tsx` | ファイル名・未保存インジケータ |
| `editor-core/src/hooks/useEditorFileOps.ts` | useFileSystem 統合 |
| `web-app/src/app/page.tsx` | Provider 生成・注入 |
| `editor-core/src/i18n/ja.json`, `en.json` | 翻訳キー追加 |

### 追加依存パッケージ

| パッケージ | 場所 | 用途 |
|-----------|------|------|
| `@capacitor/filesystem` | mobile-app | ネイティブファイル読み書き |
| `@capawesome/capacitor-file-picker` | mobile-app | ファイル選択ダイアログ |

## スコープ外

- VS Code 拡張の変更
- 複数ドキュメント同時編集
- クラウド同期
- ファイルブラウザ / サイドバー UI

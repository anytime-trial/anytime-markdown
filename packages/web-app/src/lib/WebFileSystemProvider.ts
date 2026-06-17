// File System Access API ベースの FileSystemProvider は markdown-viewer へ移設し、
// web-app / ブラウザ拡張で共有する（CLAUDE.md「両者で使うロジックは共通パッケージへ」）。
// 既存 import 経路（useEditorPage / 各テスト）を壊さないよう本ファイルは re-export に留める。
// バレル（index）経由だと markdown-viewer 全体（diffEngine → markdown-engine 等）を
// 引き込むため、WebFileSystemProvider 専用 export から直接 re-export する。
export { WebFileSystemProvider } from '@anytime-markdown/markdown-viewer/fs/web-file-system-provider';

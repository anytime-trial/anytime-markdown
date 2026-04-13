import { TrailViewerApp } from '@anytime-markdown/trail-viewer';

/**
 * VS Code 拡張機能の Trail Viewer ラッパー。
 *
 * 共通の TrailViewerApp に拡張バンドルの HTTP/WebSocket サーバ URL と
 * editable=true を渡すだけのシェル。編集系コールバックは TrailViewerApp 内部で
 * c4 dataSource の sendCommand に変換される。
 */
export function StandaloneTrailViewer({ isDark = true }: Readonly<{ isDark?: boolean }>) {
  return <TrailViewerApp serverUrl={globalThis.location.origin} isDark={isDark} editable />;
}

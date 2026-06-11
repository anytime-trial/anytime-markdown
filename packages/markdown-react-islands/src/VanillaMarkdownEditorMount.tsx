"use client";

/**
 * G3-2 draft: vanilla orchestrator（{@link mountVanillaMarkdownEditor}）を mount する薄い React ラッパ。
 *
 * 脱React Phase3 の段階的 seam 戦略（plan/20260610-g3-app-root-flip-spec.ja.md §4）の中核。
 * consumer（web-app / vscode webview）は本ラッパを **既存 RichMarkdownEditorPage と並走（フラグ切替）** で
 * mount し、手動疎通したうえで切り替える。本ラッパ自体は editor 本体を React で描画せず、`useEffect` で
 * 素 DOM の orchestrator を container へ mount し、unmount 時に `destroy()` する **だけ**の薄い殻。
 * G4 で旧 React 経路を削除したのち、consumer が orchestrator を直接 mount すれば本ラッパも不要になる。
 *
 * live props（readOnly / themeMode / presetName / autoReload / externalCompareContent /
 * settings / fileName）は `handle.update` で反映する。生成時オプション（initialContent /
 * codeBlockExtension / locale 等）の変更は consumer が `key` を変えて remount する
 * （React 経路の editorKey remount と同じ契約）。
 *
 * mount 失敗時は旧 `EditorErrorBoundary` 相当のフォールバック UI（再読み込みボタン付き）を表示し、
 * console と VS Code 拡張の Output チャネル（`editorError` message）へエラーを転送する。
 */

import { useEffect, useRef, useState } from "react";

import {
  mountVanillaMarkdownEditor,
  type MountVanillaMarkdownEditorOptions,
  type VanillaMarkdownEditorHandle,
} from "@anytime-markdown/markdown-viewer/src/host/vanillaMarkdownEditor";

/** {@link VanillaMarkdownEditorMount} の props（orchestrator options + コンテナ装飾）。 */
export interface VanillaMarkdownEditorMountProps extends MountVanillaMarkdownEditorOptions {
  className?: string;
  style?: React.CSSProperties;
  /**
   * orchestrator の差し替え（既定は {@link mountVanillaMarkdownEditor}）。
   * rich 注入版（markdown-rich の `mountVanillaRichMarkdownEditor`）を渡す consumer 用。
   */
  mount?: (
    container: HTMLElement,
    options: MountVanillaMarkdownEditorOptions,
  ) => VanillaMarkdownEditorHandle;
  /** mount 失敗の通知（旧 EditorErrorBoundary の onError 相当）。 */
  onError?: (error: Error) => void;
}

/**
 * mount 失敗を console と VS Code 拡張の Output チャネルへ転送する
 * （旧 EditorErrorBoundary.componentDidCatch 相当・silent 破棄禁止）。
 */
function reportEditorError(error: Error, vscodeApi?: VsCodeApi | null): void {
  const ts = new Date().toISOString();
  // eslint-disable-next-line no-console
  console.error(`[${ts}] [VanillaMarkdownEditorMount] エディタの mount でエラーが発生`, error, error.stack ?? "");
  const api = vscodeApi ?? (typeof window !== "undefined" ? window.__vscode : undefined);
  api?.postMessage({
    type: "editorError",
    message: error.message,
    stack: error.stack ?? "",
    componentStack: "",
  });
}

/** mount 失敗時のフォールバック（旧 EditorErrorBoundary の回復 UI 相当・文言も同一）。 */
function MountErrorFallback({
  error,
  onRetry,
}: Readonly<{ error: Error; onRetry: () => void }>): React.ReactElement {
  return (
    <div
      role="alert"
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "40vh",
        gap: 16,
        padding: 32,
      }}
    >
      <div style={{ fontWeight: 700, fontSize: "1.25rem" }}>エディタでエラーが発生しました</div>
      <div
        style={{ maxWidth: 480, textAlign: "center", whiteSpace: "pre-wrap", fontSize: "0.875rem" }}
      >
        {error.message}
      </div>
      <button type="button" onClick={onRetry}>
        再読み込み
      </button>
    </div>
  );
}

/**
 * vanilla orchestrator を mount する React ラッパ。`MarkdownEditorPage` が受ける props のうち
 * orchestrator がサポートするものをそのまま渡せるため、consumer は要素を差し替えるだけで切替できる。
 */
export function VanillaMarkdownEditorMount({
  className,
  style,
  mount,
  onError,
  ...options
}: Readonly<VanillaMarkdownEditorMountProps>): React.ReactElement {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const handleRef = useRef<VanillaMarkdownEditorHandle | null>(null);
  const [mountError, setMountError] = useState<Error | null>(null);

  useEffect(() => {
    // mount は 1 回のみ（mountError リセットで再試行）。effect は初回 commit 後に走るため、
    // ここで参照する options は mount 時点の props と一致する（live props は下の update effect で反映）。
    if (mountError) return undefined;
    const container = containerRef.current;
    if (!container) return undefined;
    try {
      handleRef.current = (mount ?? mountVanillaMarkdownEditor)(container, options);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      reportEditorError(err, options.vscodeApi);
      onError?.(err);
      // 失敗 mount が残した部分 DOM を片付けてからフォールバックへ切り替える。
      container.replaceChildren();
      setMountError(err);
      return undefined;
    }
    return () => {
      handleRef.current?.destroy();
      handleRef.current = null;
    };
    // 生成時オプションの変更は consumer の key remount で扱う（mount-once）。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mountError]);

  // live props の反映（orchestrator.handle.update）。
  useEffect(() => {
    handleRef.current?.update({
      readOnly: options.readOnly,
      themeMode: options.themeMode,
      presetName: options.presetName,
      autoReload: options.autoReload,
      externalCompareContent: options.externalCompareContent,
      settings: options.settings,
      fileName: options.fileName,
    });
  }, [
    options.readOnly,
    options.themeMode,
    options.presetName,
    options.autoReload,
    options.externalCompareContent,
    options.settings,
    options.fileName,
  ]);

  if (mountError) {
    return <MountErrorFallback error={mountError} onRetry={() => setMountError(null)} />;
  }

  return <div ref={containerRef} className={className} style={{ height: "100%", ...style }} />;
}

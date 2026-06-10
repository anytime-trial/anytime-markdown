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
 * 注意（draft の制約）: 現状 orchestrator は **mount 時 1 回**で props の live update を持たない
 * （`handle.update` 未実装）。props 変更時の再構築は follow-up（mount-once として運用）。
 */

import { useEffect, useRef } from "react";

import {
  mountVanillaMarkdownEditor,
  type MountVanillaMarkdownEditorOptions,
  type VanillaMarkdownEditorHandle,
} from "./host/vanillaMarkdownEditor";

/** {@link VanillaMarkdownEditorMount} の props（orchestrator options + コンテナ装飾）。 */
export interface VanillaMarkdownEditorMountProps extends MountVanillaMarkdownEditorOptions {
  className?: string;
  style?: React.CSSProperties;
}

/**
 * vanilla orchestrator を mount する React ラッパ。`MarkdownEditorPage` が受ける props のうち
 * orchestrator がサポートするものをそのまま渡せるため、consumer は要素を差し替えるだけで切替できる。
 */
export function VanillaMarkdownEditorMount({
  className,
  style,
  ...options
}: Readonly<VanillaMarkdownEditorMountProps>): React.ReactElement {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // mount は 1 回のみ。effect は初回 commit 後に走るため、ここで参照する options は mount 時点の
    // props と一致する（live update は orchestrator.handle.update 実装後の follow-up）。
    const container = containerRef.current;
    if (!container) return undefined;
    let handle: VanillaMarkdownEditorHandle | null = null;
    try {
      handle = mountVanillaMarkdownEditor(container, options);
    } catch (error) {
      // mount 失敗は致命的でないが原因追跡のため握り潰さず出力する（seam の疎通診断）。
      console.error("[VanillaMarkdownEditorMount] mount failed", error);
    }
    return () => handle?.destroy();
    // mount-once（props live update は orchestrator.handle.update 実装後に対応）。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={containerRef} className={className} style={{ height: "100%", ...style }} />;
}

/** {@link MaybeVanillaMarkdownEditor} の props。 */
export interface MaybeVanillaMarkdownEditorProps {
  /** 旧 React 経路の要素（例: `<MarkdownEditorPage {...props} />` / RichMarkdownEditorPage）。 */
  legacy: React.ReactElement;
  /** フラグ ON 時に mount する vanilla orchestrator の props。 */
  vanilla: VanillaMarkdownEditorMountProps;
  /** 明示フラグ（省略時は {@link isVanillaEditorEnabled} で判定）。 */
  enabled?: boolean;
}

/**
 * 並走スイッチ（G3-2 の consumer 配線中核）。フラグに応じて旧 React 経路（`legacy`）と vanilla 経路
 * （{@link VanillaMarkdownEditorMount}）を切り替える。consumer は既存の editor 要素を `legacy` に渡し、
 * 同じ値から導いた orchestrator props を `vanilla` に渡すだけで、既定 OFF のまま安全に並走させられる。
 *
 * @example
 * <MaybeVanillaMarkdownEditor
 *   legacy={<MarkdownEditorPage {...pageProps} />}
 *   vanilla={{ t, initialContent: content, readOnly, themeMode, presetName, locale, onContentChange }}
 * />
 */
export function MaybeVanillaMarkdownEditor({
  legacy,
  vanilla,
  enabled,
}: Readonly<MaybeVanillaMarkdownEditorProps>): React.ReactElement {
  const useVanilla = enabled ?? isVanillaEditorEnabled();
  return useVanilla ? <VanillaMarkdownEditorMount {...vanilla} /> : legacy;
}

/**
 * vanilla editor 経路を有効化するかのフラグ（並走切替用）。既定は false（旧 React 経路）。
 *
 * 優先順: グローバル明示フラグ `__AM_VANILLA_EDITOR__` → 環境変数 `NEXT_PUBLIC_VANILLA_EDITOR` →
 * URL クエリ `?vanilla=1`（ブラウザ時のみ）。consumer 側で独自判定したい場合は本関数を使わず
 * 直接条件分岐してよい。
 */
export function isVanillaEditorEnabled(): boolean {
  const g = globalThis as unknown as Record<string, unknown>;
  if (typeof g.__AM_VANILLA_EDITOR__ === "boolean") return g.__AM_VANILLA_EDITOR__;
  const env =
    typeof process !== "undefined"
      ? (process as { env?: Record<string, string | undefined> }).env?.NEXT_PUBLIC_VANILLA_EDITOR
      : undefined;
  if (env === "1" || env === "true") return true;
  if (typeof window !== "undefined") {
    try {
      return new URLSearchParams(window.location.search).get("vanilla") === "1";
    } catch {
      return false;
    }
  }
  return false;
}

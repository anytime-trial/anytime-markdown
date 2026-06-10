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
 */

import { useEffect, useRef } from "react";

import {
  mountVanillaMarkdownEditor,
  type MountVanillaMarkdownEditorOptions,
  type VanillaMarkdownEditorHandle,
} from "./host/vanillaMarkdownEditor";
import { isVanillaEditorEnabled } from "./vanillaEditorFlag";

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
}

/**
 * vanilla orchestrator を mount する React ラッパ。`MarkdownEditorPage` が受ける props のうち
 * orchestrator がサポートするものをそのまま渡せるため、consumer は要素を差し替えるだけで切替できる。
 */
export function VanillaMarkdownEditorMount({
  className,
  style,
  mount,
  ...options
}: Readonly<VanillaMarkdownEditorMountProps>): React.ReactElement {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const handleRef = useRef<VanillaMarkdownEditorHandle | null>(null);

  useEffect(() => {
    // mount は 1 回のみ。effect は初回 commit 後に走るため、ここで参照する options は mount 時点の
    // props と一致する（live props は下の update effect で反映）。
    const container = containerRef.current;
    if (!container) return undefined;
    try {
      handleRef.current = (mount ?? mountVanillaMarkdownEditor)(container, options);
    } catch (error) {
      // mount 失敗は致命的でないが原因追跡のため握り潰さず出力する（seam の疎通診断）。
      console.error("[VanillaMarkdownEditorMount] mount failed", error);
    }
    return () => {
      handleRef.current?.destroy();
      handleRef.current = null;
    };
    // 生成時オプションの変更は consumer の key remount で扱う（mount-once）。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

// フラグ判定は重量依存のない単独モジュール（./vanillaEditorFlag）へ分離。再 export で互換維持。
export { isVanillaEditorEnabled };

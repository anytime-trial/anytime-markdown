import type { NoteGraphPanelHandle } from "@anytime-markdown/graph-core";
import type { NoteGraphSlot } from "@anytime-markdown/markdown-viewer/src/host/vanillaMarkdownEditor";
import { useEffect, useMemo, useRef } from "react";

import { fetchNoteGraphDocs } from "../../lib/githubApi";

/** themeMode 文字列 → isDark。'system'/未指定は prefers-color-scheme に従う。 */
function resolveIsDark(themeMode: string | undefined): boolean {
  if (themeMode === "dark") return true;
  if (themeMode === "light") return false;
  return (
    typeof globalThis.matchMedia === "function" &&
    globalThis.matchMedia("(prefers-color-scheme: dark)").matches
  );
}

export interface UseNoteGraphSlotParams {
  /** GitHub から開いたときだけ true。false のときスロットを作らない（ボタン非表示）。 */
  enabled: boolean;
  repo: string | undefined;
  branch: string | undefined;
  /** 現在開いているファイルの repo ルート相対パス（中心表示の起点）。 */
  currentPath: string | undefined;
  themeMode: string | undefined;
  t: (key: string) => string;
  /** ノードクリックでそのドキュメントを開く（GitHub の同 repo/branch）。 */
  onOpenDoc: (path: string) => void;
}

/**
 * GitHub で開いたときのノート網スロットを構築する（閲覧専用）。
 *
 * graph-core（canvas 描画）は GitHub 利用時のみ動的 import して初期バンドルから外す。
 * スロットの `element` はラッパ div を同期生成し（editor は mount 時にこれを読む）、
 * パネル本体は import 完了後に注入する。docs 取得はパネルを開いた時（`onOpen`）に初めて行う。
 */
export function useNoteGraphSlot(params: UseNoteGraphSlotParams): NoteGraphSlot | undefined {
  const { enabled, repo, branch, currentPath, themeMode, t, onOpenDoc } = params;

  // live prop はコールバック再生成でスロットを作り直さないよう ref 経由で最新を読む。
  const cbRef = useRef({ t, onOpenDoc, themeMode, currentPath });
  cbRef.current = { t, onOpenDoc, themeMode, currentPath };

  const handleRef = useRef<NoteGraphPanelHandle | null>(null);
  const openedRef = useRef(false);
  const docsLoadedRef = useRef(false);
  const inFlightRef = useRef(false);

  // repo/branch が定まる GitHub ファイルごとに 1 スロット。ラッパは同期生成し、
  // editor が mount 時にこの element を読む（後から async で中身を注入する）。
  const slot = useMemo<NoteGraphSlot | undefined>(() => {
    if (!enabled || !repo || !branch) return undefined;
    const wrapper = document.createElement("div");
    wrapper.style.cssText = "display:flex;min-height:0;flex:1 1 auto;";
    openedRef.current = false;
    docsLoadedRef.current = false;
    return {
      element: wrapper,
      onOpen: () => {
        openedRef.current = true;
        void loadDocs(repo, branch);
      },
      isPinned: () => handleRef.current?.isPinned() ?? false,
    };
    // repo/branch 変化で新スロット。currentPath 等は ref 経由で最新を読むため deps 外。
  }, [enabled, repo, branch]);

  // docs を取得してパネルへ反映する。成功時のみ docsLoaded を立て、失敗時は
  // ログを出して再試行を許す（パネル未生成なら生成完了後に改めて呼ばれる）。
  // 中心（currentPath）は初回取得時のもので、同一 repo/branch 内で別ファイルを開いても
  // 追随しない（パネル内クリックで再センタリング可能なため許容）。
  async function loadDocs(r: string, b: string): Promise<void> {
    if (docsLoadedRef.current || inFlightRef.current || !handleRef.current) return;
    inFlightRef.current = true;
    try {
      const docs = await fetchNoteGraphDocs(r, b);
      docsLoadedRef.current = true;
      handleRef.current?.setDocs({
        docs,
        isDark: resolveIsDark(cbRef.current.themeMode),
        currentPath: cbRef.current.currentPath,
      });
    } catch (err) {
      console.warn(`[noteGraph] docs 取得に失敗 (repo=${r} branch=${b})`, err);
    } finally {
      inFlightRef.current = false;
    }
  }

  // パネル本体（graph-core）を動的 import して slot.element に注入する。
  useEffect(() => {
    if (!slot || !repo || !branch) return undefined;
    let cancelled = false;
    void (async () => {
      const { createNoteGraphPanel } = await import("@anytime-markdown/graph-core");
      if (cancelled) return;
      const handle = createNoteGraphPanel({
        t: (key) => cbRef.current.t(key),
        readOnly: true,
        onOpenDoc: (path) => cbRef.current.onOpenDoc(path),
        onConnect: () => {},
        onRefresh: () => {},
      });
      handleRef.current = handle;
      (slot.element as HTMLElement).append(handle.element);
      // パネルを先に開いていた場合はここで初回ロードする。
      if (openedRef.current) void loadDocs(repo, branch);
    })();
    return () => {
      cancelled = true;
      handleRef.current?.destroy();
      handleRef.current = null;
    };
  }, [slot, repo, branch]);

  return slot;
}

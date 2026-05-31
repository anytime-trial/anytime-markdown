import { useTheme } from "@mui/material";
import type { Editor } from "@tiptap/react";
import { useCallback, useState } from "react";

import { PRINT_DELAY } from "../constants/timing";
import type { NotificationKey } from "./useNotification";

/**
 * ダークモード印刷時に図（Mermaid / PlantUML）をライトテーマへ差し替える戦略。
 * 重量モジュール（mermaid / plantuml-encoder）に依存するため markdown-rich が実装し、
 * RichMarkdownEditorPage 経由で注入する (B-5)。未注入時はダークモードでも図変換をスキップする。
 *
 * - `applyBeforePrint`: print 直前に同期適用する（例: Mermaid の innerHTML 差し替え）
 * - `restore`: print 後に適用内容を元へ戻す（PlantUML の src・Mermaid の innerHTML 復元）
 * - `hasChanges`: 図を準備したか。print 前の再レンダー待ち delay を入れるか判断する
 */
export type DarkDiagramPrintPreparer = () => Promise<{
  applyBeforePrint: () => void;
  restore: () => void;
  hasChanges: boolean;
}>;

/** 折りたたまれたブロックの位置を収集し展開する */
function expandCollapsedBlocks(editor: Editor): number[] {
  const positions: number[] = [];
  editor.state.doc.descendants((node, pos) => {
    if (node.attrs.collapsed) positions.push(pos);
  });
  if (positions.length > 0) {
    const tr = editor.state.tr;
    for (const pos of positions) tr.setNodeAttribute(pos, "collapsed", false);
    editor.view.dispatch(tr);
  }
  return positions;
}

/** 折りたたみ状態を復元する */
function restoreCollapsedBlocks(editor: Editor, positions: number[]): void {
  if (positions.length > 0 && !editor.isDestroyed) {
    const tr = editor.state.tr;
    for (const pos of positions) tr.setNodeAttribute(pos, "collapsed", true);
    editor.view.dispatch(tr);
  }
}

interface UsePdfExportParams {
  editor: Editor | null;
  showNotification: (key: NotificationKey) => void;
  /** ダークモード図のライト化戦略（markdown-rich が注入）。未注入時はダーク時の図変換をスキップ (B-5) */
  prepareDarkDiagrams?: DarkDiagramPrintPreparer;
}

export function usePdfExport({ editor, showNotification, prepareDarkDiagrams }: UsePdfExportParams) {
  const [pdfExporting, setPdfExporting] = useState(false);
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";

  const handleExportPdf = useCallback(async () => {
    if (typeof globalThis === "undefined" || !editor) {
      if (typeof globalThis !== "undefined") globalThis.print();
      return;
    }
    setPdfExporting(true);
    try {
      const collapsedPositions = expandCollapsedBlocks(editor);

      // ダークモード時、印刷用にライトテーマで図を差し替える（rich 注入時のみ）
      let applyBeforePrint: () => void = () => {};
      let restoreDiagrams: () => void = () => {};
      let hasDiagramChanges = false;
      if (isDark && prepareDarkDiagrams) {
        const prepared = await prepareDarkDiagrams();
        applyBeforePrint = prepared.applyBeforePrint;
        restoreDiagrams = prepared.restore;
        hasDiagramChanges = prepared.hasChanges;
      }

      // 再レンダーを待ってから印刷
      const needsDelay = collapsedPositions.length > 0 || hasDiagramChanges;
      const delay = needsDelay ? PRINT_DELAY : 0;
      setTimeout(() => {
        try {
          applyBeforePrint();
          globalThis.print();
        } finally {
          restoreDiagrams();
          restoreCollapsedBlocks(editor, collapsedPositions);
          setPdfExporting(false);
        }
      }, delay);
    } catch {
      setPdfExporting(false);
      showNotification("pdfExportError");
      return;
    }
    // showNotification は安定な関数のため依存配列から除外
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, isDark, prepareDarkDiagrams]);

  return { pdfExporting, handleExportPdf };
}

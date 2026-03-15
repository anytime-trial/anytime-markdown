import { GlobalStyles } from "@mui/material";
import React from "react";

/**
 * PDF エクスポート用の印刷スタイル。
 * window.print() 時に @media print ルールで
 * エディタ本文のみを全展開して印刷する。
 */
export const PrintStyles: React.FC = () =>
  React.createElement(GlobalStyles, {
    styles: {
      "@page": {
        size: "A4",
        margin: "15mm",
      },
      "@media print": {
        /* === ページ全体のクリッピング解除 === */
        "html, body": {
          overflow: "visible !important",
          height: "auto !important",
          maxHeight: "none !important",
        },
        /* Next.js アプリラッパーの overflow/height 解除 */
        "#main-content, #main-content > .MuiBox-root": {
          overflow: "visible !important",
          height: "auto !important",
          maxHeight: "none !important",
        },

        /* === 文字色を印刷用に統一 === */
        ".tiptap, .tiptap *": {
          color: "#000 !important",
        },

        /* === レイアウト制御 === */
        ".tiptap": {
          maxHeight: "none !important",
          minHeight: "0 !important",
          overflowY: "visible !important",
          overflow: "visible !important",
          height: "auto !important",
        },
        "#md-editor-content": {
          overflow: "visible !important",
          border: "none !important",
          boxShadow: "none !important",
          height: "auto !important",
          maxHeight: "none !important",
        },
        /*
         * NodeView コンテナの overflow を全解除。
         * Image / Table / Mermaid 全ての NodeView が
         * 外側 Box に overflow: hidden を持ち、
         * Table は孫要素に overflow: auto を持つため
         * 全子孫要素を対象にする。
         */
        "[data-node-view-wrapper], [data-node-view-wrapper] *:not(svg *):not(svg):not(.katex *):not(.katex):not(pre):not(pre *)": {
          overflow: "visible !important",
          height: "auto !important",
          maxHeight: "none !important",
          opacity: "1 !important",
        },

        /* === 非表示要素 === */
        "#md-editor-toolbar": {
          display: "none !important",
        },
        "#md-editor-statusbar": {
          display: "none !important",
        },
        ".MuiDrawer-root": {
          display: "none !important",
        },
        ".MuiPopper-root, .MuiPopover-root, .MuiModal-root": {
          display: "none !important",
        },
        "#search-replace-bar": {
          display: "none !important",
        },
        ".heading-folded::after": {
          display: "none !important",
        },
        ".is-editor-empty::before": {
          display: "none !important",
        },
        ".search-match, .search-match-current": {
          backgroundColor: "transparent !important",
          outline: "none !important",
        },
        "[data-block-toolbar]": {
          display: "none !important",
        },
        /* 見出しの背景色・影を除去 */
        ".tiptap h1, .tiptap h2": {
          background: "none !important",
          boxShadow: "none !important",
        },
        /* セクション番号を非表示 */
        ".heading-number": {
          display: "none !important",
        },
        "[data-drag-handle]": {
          display: "none !important",
        },
        /* Mermaid/PlantUML/Math: 図プレビューがある場合のみコードを非表示 */
        "[data-node-view-wrapper]:has([role='img']) pre": {
          display: "none !important",
        },

        /* === Mermaid/PlantUML 図の印刷対応 === */
        "[role='img'] > div": {
          transform: "none !important",
        },

        /* === 改ページ制御 === */
        pre: {
          pageBreakInside: "avoid",
          whiteSpace: "pre-wrap !important" as string,
          overflowWrap: "break-word !important" as string,
        },
        img: {
          pageBreakInside: "avoid",
          maxWidth: "100% !important",
        },
        svg: {
          maxWidth: "100% !important",
          pageBreakInside: "avoid",
        },
        /* === テーブル枠線（印刷用） === */
        ".tiptap table": {
          borderCollapse: "collapse",
          pageBreakInside: "auto",
        },
        ".tiptap th, .tiptap td": {
          border: "1px solid #999 !important",
        },
        tr: {
          pageBreakInside: "avoid",
        },
        blockquote: {
          pageBreakInside: "avoid",
        },
        "[data-node-view-wrapper]": {
          pageBreakInside: "avoid",
        },
      },
    },
  });

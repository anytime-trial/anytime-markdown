"use client";

import type { CSSProperties } from "react";
import { NodeViewContent, NodeViewWrapper } from "@anytime-markdown/markdown-react";

import { DEFAULT_DARK_CODE_BG, DEFAULT_LIGHT_CODE_BG, getDivider, useEditorSettingsContext, DeleteBlockDialog } from "@anytime-markdown/markdown-viewer";

import styles from "./CodeBlockFrame.module.css";

interface CodeBlockFrameProps {
  /** Toolbar row rendered above the code editor */
  toolbar: React.ReactNode;
  /** Whether the code editor portion is collapsed (preview blocks only) */
  codeCollapsed?: boolean;
  /** Whether this is a diagram block (uses wrapper Box around pre) */
  isDiagramLayout?: boolean;
  /** Whether dark mode */
  isDark: boolean;
  /** Whether selected or in fullscreen (affects border visibility) */
  showBorder: boolean;
  /** Max height for code area (default 200 for preview blocks, 400 for regular) */
  codeMaxHeight?: number;
  /** Delete dialog state */
  deleteDialogOpen: boolean;
  setDeleteDialogOpen: (open: boolean) => void;
  handleDeleteBlock: () => void;
  t: (key: string) => string;
  /** Content rendered after the code editor (preview area, diagram area, etc.) */
  children?: React.ReactNode;
  /** Content rendered after the outer Box (fullscreen dialogs, popovers, etc.) */
  afterFrame?: React.ReactNode;
}

export function CodeBlockFrame({
  toolbar,
  codeCollapsed,
  isDiagramLayout,
  isDark,
  showBorder,
  codeMaxHeight,
  deleteDialogOpen,
  setDeleteDialogOpen,
  handleDeleteBlock,
  t,
  children,
  afterFrame,
}: Readonly<CodeBlockFrameProps>) {
  const settings = useEditorSettingsContext();
  const hasCodeCollapse = codeCollapsed !== undefined;
  const maxH = codeMaxHeight ?? (hasCodeCollapse ? 200 : 400);

  const codeBg = isDark ? DEFAULT_DARK_CODE_BG : DEFAULT_LIGHT_CODE_BG;
  const isHidden = hasCodeCollapse && codeCollapsed;
  const preClassName = isHidden
    ? styles.hidden
    : [styles.pre, hasCodeCollapse ? styles.preAnimated : undefined].filter(Boolean).join(" ");
  const preStyle: CSSProperties | undefined = isHidden
    ? undefined
    : { fontSize: `${settings.fontSize}px`, lineHeight: settings.lineHeight, backgroundColor: codeBg, maxHeight: maxH };

  const preElement = (
    <pre className={preClassName} style={preStyle} spellCheck={false}>
      {/* @ts-expect-error Tiptap NodeViewContent as prop type is too restrictive */}
      <NodeViewContent as="code" />
    </pre>
  );

  const frameClassName = [styles.frame, !showBorder ? styles.frameNoBorder : undefined].filter(Boolean).join(" ");

  return (
    <NodeViewWrapper className="block-node-wrapper">
      <div
        className={frameClassName}
        style={{ borderColor: showBorder ? getDivider(isDark) : "transparent" }}
      >
        {toolbar}
        {isDiagramLayout
          ? <div className={codeCollapsed ? styles.hidden : undefined}>{preElement}</div>
          : preElement
        }
        {children}
      </div>
      {afterFrame}
      <DeleteBlockDialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        onDelete={handleDeleteBlock}
        t={t}
      />
    </NodeViewWrapper>
  );
}

"use client";

import { Box } from "@mui/material";
import { useCallback, useRef } from "react";

import { useBlockResize } from "../../hooks/useBlockResize";
import { parseEmbedInfoString, type EmbedVariant } from "../../utils/embedInfoString";
import { EmbedEditDialog } from "../EmbedEditDialog";
import { EmbedNodeView } from "../EmbedNodeView";
import { BlockInlineToolbar } from "./BlockInlineToolbar";
import { CodeBlockFrame } from "./CodeBlockFrame";
import { shouldShowBorder } from "./compareHelpers";
import { ResizeGrip } from "./ResizeGrip";
import type { CodeBlockSharedProps } from "./types";

type EmbedBlockProps = Pick<
    CodeBlockSharedProps,
    | "editor" | "node" | "updateAttributes" | "getPos"
    | "codeCollapsed" | "isSelected"
    | "selectNode" | "code"
    | "handleCopyCode" | "handleDeleteBlock" | "deleteDialogOpen" | "setDeleteDialogOpen"
    | "editOpen" | "setEditOpen" | "tryCloseEdit" | "fsCode" | "onFsCodeChange" | "fsTextareaRef" | "fsSearch"
    | "onFsApply" | "fsDirty" | "discardDialogOpen" | "setDiscardDialogOpen" | "handleDiscardConfirm"
    | "t" | "isDark" | "isEditable" | "isCompareLeft" | "isCompareLeftEditable"
> & {
    handleFsTextChange: (newCode: string) => void;
};

function firstNonEmptyLine(text: string): string {
    for (const rawLine of text.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (line) return line;
    }
    return "";
}

export function EmbedBlock(props: EmbedBlockProps) {
    const {
        editor, node, updateAttributes, getPos,
        codeCollapsed, isSelected,
        selectNode, code,
        handleDeleteBlock, deleteDialogOpen, setDeleteDialogOpen,
        editOpen, setEditOpen,
        t, isDark,
    } = props;

    const containerRef = useRef<HTMLDivElement>(null);
    const language = node.attrs.language as string;
    const variant: EmbedVariant = parseEmbedInfoString(language)?.variant ?? "card";
    const initialUrl = firstNonEmptyLine(code);
    const resizable = variant === "card";

    const {
        resizing,
        resizeWidth,
        displayWidth,
        handleResizePointerDown,
        handleResizePointerMove,
        handleResizePointerUp,
    } = useBlockResize({
        containerRef,
        updateAttributes,
        currentWidth: node.attrs.width as string | null | undefined,
    });

    const handleApply = useCallback(
        (url: string, nextVariant: EmbedVariant) => {
            const nextLanguage = nextVariant === "compact" ? "embed compact" : "embed";
            updateAttributes({ language: nextLanguage });
            if (editor && typeof getPos === "function") {
                const pos = getPos();
                if (pos != null) {
                    const from = pos + 1;
                    const to = from + node.content.size;
                    editor.chain().command(({ tr }) => {
                        if (url) {
                            tr.replaceWith(from, to, editor.schema.text(url));
                        } else {
                            tr.delete(from, to);
                        }
                        return true;
                    }).run();
                }
            }
            setEditOpen(false);
        },
        [editor, getPos, node.content.size, setEditOpen, updateAttributes],
    );

    const toolbar = (
        <BlockInlineToolbar
            label="Embed"
            onEdit={props.isCompareLeft ? undefined : () => setEditOpen(true)}
            onDelete={props.isCompareLeft ? undefined : () => setDeleteDialogOpen(true)}
            labelOnly={props.isCompareLeftEditable}
            labelDivider
            t={t}
        />
    );

    const widthOverride = resizable ? displayWidth : undefined;

    return (
        <CodeBlockFrame
            toolbar={toolbar}
            codeCollapsed={codeCollapsed}
            isDark={isDark}
            showBorder={shouldShowBorder({
                isSelected,
                isCompareLeft: props.isCompareLeft,
                isCompareLeftEditable: props.isCompareLeftEditable,
                isEditable: props.isEditable,
            })}
            deleteDialogOpen={deleteDialogOpen}
            setDeleteDialogOpen={setDeleteDialogOpen}
            handleDeleteBlock={handleDeleteBlock}
            t={t}
            afterFrame={
                <EmbedEditDialog
                    open={editOpen}
                    initialUrl={initialUrl}
                    initialVariant={variant}
                    onClose={() => setEditOpen(false)}
                    onApply={handleApply}
                    t={t}
                />
            }
        >
            <Box
                ref={containerRef}
                contentEditable={false}
                onClick={selectNode}
                onDoubleClick={() => setEditOpen(true)}
                onPointerMove={handleResizePointerMove}
                onPointerUp={handleResizePointerUp}
                sx={{
                    p: 1.5,
                    cursor: "pointer",
                    overflow: "hidden",
                    display: "inline-block",
                    position: "relative",
                    width: widthOverride ?? "fit-content",
                    maxWidth: "100%",
                }}
            >
                <EmbedNodeView language={language} body={code} widthOverride={widthOverride} />
                {resizable && (
                    <ResizeGrip
                        visible={isSelected && props.isEditable}
                        resizing={resizing}
                        resizeWidth={resizeWidth}
                        onPointerDown={handleResizePointerDown}
                    />
                )}
            </Box>
        </CodeBlockFrame>
    );
}

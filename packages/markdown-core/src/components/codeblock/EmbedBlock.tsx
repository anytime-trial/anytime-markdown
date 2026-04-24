"use client";

import { Box } from "@mui/material";
import { useRef } from "react";

import { CodeBlockEditDialog } from "../CodeBlockEditDialog";
import { EmbedNodeView } from "../EmbedNodeView";
import { BlockInlineToolbar } from "./BlockInlineToolbar";
import { CodeBlockFrame } from "./CodeBlockFrame";
import { shouldShowBorder } from "./compareHelpers";
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

export function EmbedBlock(props: EmbedBlockProps) {
    const {
        codeCollapsed, isSelected,
        selectNode, code,
        handleDeleteBlock, deleteDialogOpen, setDeleteDialogOpen,
        editOpen, setEditOpen, fsCode, onFsCodeChange, fsTextareaRef, fsSearch,
        handleFsTextChange,
        t, isDark,
    } = props;

    const containerRef = useRef<HTMLDivElement>(null);
    const language = props.node.attrs.language as string;

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
                <CodeBlockEditDialog
                    open={editOpen}
                    onClose={() => {
                        fsSearch.reset();
                        props.tryCloseEdit();
                    }}
                    onApply={props.onFsApply}
                    dirty={props.fsDirty}
                    label="Embed"
                    language={language}
                    fsCode={fsCode}
                    onFsCodeChange={onFsCodeChange}
                    onFsTextChange={handleFsTextChange}
                    fsTextareaRef={fsTextareaRef}
                    fsSearch={fsSearch}
                    readOnly={!props.isEditable}
                    t={t}
                />
            }
        >
            <Box
                ref={containerRef}
                contentEditable={false}
                onClick={selectNode}
                onDoubleClick={() => setEditOpen(true)}
                sx={{
                    p: 1.5,
                    cursor: "pointer",
                    overflow: "auto",
                    display: "flex",
                    justifyContent: "flex-start",
                }}
            >
                <EmbedNodeView language={language} body={code} />
            </Box>
        </CodeBlockFrame>
    );
}

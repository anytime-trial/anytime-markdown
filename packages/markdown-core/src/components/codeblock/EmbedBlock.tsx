"use client";

import { Box } from "@mui/material";
import { useCallback, useMemo, useRef } from "react";

import { useBlockResize } from "../../hooks/useBlockResize";
import {
    buildEmbedInfoString,
    DEFAULT_EMBED_BASELINE,
    parseEmbedInfoString,
    type EmbedBaseline,
    type EmbedVariant,
} from "../../utils/embedInfoString";
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
    const parsedInfo = parseEmbedInfoString(language) ?? {
        variant: "card" as const,
        width: null,
        ...DEFAULT_EMBED_BASELINE,
    };
    const variant: EmbedVariant = parsedInfo.variant;
    const storedWidth = parsedInfo.width;
    // 参照を安定化することで useEmbedUpdateCheck の effect 再実行（RSS/OGP fetch の余分な発火）を防ぐ。
    const baseline = useMemo<EmbedBaseline>(
        () => ({
            rssFeedUrl: parsedInfo.rssFeedUrl,
            baselineRssGuid: parsedInfo.baselineRssGuid,
            baselineOgpHash: parsedInfo.baselineOgpHash,
            rssChecked: parsedInfo.rssChecked,
        }),
        [parsedInfo.rssFeedUrl, parsedInfo.baselineRssGuid, parsedInfo.baselineOgpHash, parsedInfo.rssChecked],
    );
    const initialUrl = firstNonEmptyLine(code);
    const resizable = variant === "card";

    // width は info string（language 属性）に永続化する。useBlockResize は
    // updateAttributes({ width: "Npx" }) を呼ぶので、これを捕捉して
    // language に embed info string として書き戻す。
    const updateAttributesForResize = useCallback(
        (attrs: Record<string, unknown>) => {
            if (Object.prototype.hasOwnProperty.call(attrs, "width")) {
                const nextWidth = attrs.width as string | null;
                const nextLanguage = buildEmbedInfoString(variant, nextWidth, baseline);
                const { width: _ignored, ...rest } = attrs;
                void _ignored;
                updateAttributes({ ...rest, language: nextLanguage, width: nextWidth });
                return;
            }
            updateAttributes(attrs);
        },
        [updateAttributes, variant, baseline],
    );

    const writeBaseline = useCallback(
        (newBaseline: EmbedBaseline) => {
            const nextLanguage = buildEmbedInfoString(variant, storedWidth, newBaseline);
            updateAttributes({ language: nextLanguage });
        },
        [updateAttributes, variant, storedWidth],
    );

    const {
        resizing,
        resizeWidth,
        displayWidth,
        handleResizePointerDown,
        handleResizePointerMove,
        handleResizePointerUp,
    } = useBlockResize({
        containerRef,
        updateAttributes: updateAttributesForResize,
        currentWidth: storedWidth ?? (node.attrs.width as string | null | undefined),
    });

    const handleApply = useCallback(
        (url: string, nextVariant: EmbedVariant) => {
            // variant 切替でも既存の width / baseline は保持する
            const nextLanguage = buildEmbedInfoString(nextVariant, storedWidth, baseline);
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
        [editor, getPos, node.content.size, setEditOpen, storedWidth, updateAttributes, baseline],
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
                    position: "relative",
                    display: "block",
                    width: widthOverride ?? "100%",
                    maxWidth: widthOverride ?? 720,
                }}
            >
                <EmbedNodeView
                    language={language}
                    body={code}
                    widthOverride={widthOverride}
                    baseline={baseline}
                    onBaselineWrite={writeBaseline}
                />
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

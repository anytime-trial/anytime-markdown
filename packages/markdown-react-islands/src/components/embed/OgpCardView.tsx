"use client";

import { LinkIcon } from "../../ui/icons";
import { useIsDark } from "../../contexts/ThemeModeContext";
import { getDivider, getBgPaper, getTextPrimary, getTextSecondary, getWarningMain } from "@anytime-markdown/markdown-viewer/src/constants/colors";

import { Skeleton } from "../../ui/Skeleton";
import { type CSSProperties } from "react";

import { useEmbedUpdateCheck, useOgpData } from "../../hooks/useEmbedData";
import type { EmbedProviders } from "@anytime-markdown/markdown-viewer/src/types/embedProvider";
import { DEFAULT_EMBED_BASELINE, type EmbedBaseline } from "@anytime-markdown/markdown-viewer/src/utils/embedInfoString";
import { markEmbedSeen } from "@anytime-markdown/markdown-viewer/src/utils/embedSeenStore";
import { Stack } from "../../ui/Stack";
import { Text } from "../../ui/Text";
import { EmbedUpdateBadge } from "../codeblock/EmbedUpdateBadge";

interface Props {
    url: string;
    variant: "card" | "compact";
    providers: EmbedProviders;
    widthOverride?: string;
    baseline?: EmbedBaseline;
    onBaselineWrite?: (baseline: EmbedBaseline) => void;
}

const noopBaselineWrite = (_b: EmbedBaseline) => undefined;

function getDomain(url: string): string {
    try {
        return new URL(url).hostname.replace(/^www\./, "");
    } catch {
        return url;
    }
}

export function OgpCardView({ url, variant, providers, widthOverride, baseline, onBaselineWrite }: Readonly<Props>) {
    const { loading, data, error } = useOgpData(url, providers);
    const isDark = useIsDark();

    const effectiveBaseline = baseline ?? DEFAULT_EMBED_BASELINE;
    const updateCheck = useEmbedUpdateCheck({
        url,
        ogpData: variant === "card" ? data : null,
        providers,
        baseline: effectiveBaseline,
        onInitialBaseline: onBaselineWrite ?? noopBaselineWrite,
    });
    const badgeVisible = variant === "card" && updateCheck.status === "unseen";
    const handleBadgeClick = () => {
        if (updateCheck.fingerprint) markEmbedSeen(url, updateCheck.fingerprint);
    };

    const borderColor = getDivider(isDark);
    const bg = getBgPaper(isDark);
    const textPrimary = getTextPrimary(isDark);
    const textSecondary = getTextSecondary(isDark);

    const cardWidthStyle: CSSProperties = widthOverride
        ? { width: widthOverride }
        : { width: "100%", maxWidth: 720 };

    if (loading) {
        if (variant === "compact") {
            return <Skeleton variant="rectangular" height={40} style={{ maxWidth: 720 }} />;
        }
        return <Skeleton variant="rectangular" height={140} style={cardWidthStyle} />;
    }

    const domain = getDomain(data?.url ?? url);
    const title = data?.title ?? url;
    const description = data?.description ?? "";
    const image = data?.image;
    const favicon = data?.favicon;

    const linkStyle: CSSProperties = {
        textDecoration: "none",
        color: "inherit",
        display: "block",
    };

    if (variant === "compact") {
        return (
            <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                style={linkStyle}
            >
                <div
                    style={{
                        border: `1px solid ${borderColor}`,
                        borderRadius: 4,
                        backgroundColor: bg,
                        maxWidth: 720,
                        height: 40,
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        paddingLeft: 12,
                        paddingRight: 12,
                        overflow: "hidden",
                    }}
                >
                    {favicon ? (
                        <img
                            src={favicon}
                            alt=""
                            loading="lazy"
                            style={{ width: 16, height: 16, flexShrink: 0 }}
                        />
                    ) : (
                        <LinkIcon fontSize={16} color={textSecondary} style={{ flexShrink: 0 }} />
                    )}
                    <Text
                        component="span"
                        style={{
                            color: textPrimary,
                            fontSize: 14,
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            flex: 1,
                            minWidth: 0,
                        }}
                    >
                        {title}
                    </Text>
                    <Text
                        component="span"
                        style={{
                            color: textSecondary,
                            fontSize: 12,
                            flexShrink: 0,
                        }}
                    >
                        {domain}
                    </Text>
                </div>
            </a>
        );
    }

    return (
        <a href={url} target="_blank" rel="noopener noreferrer" style={linkStyle}>
            <div
                style={{
                    border: `1px solid ${borderColor}`,
                    borderRadius: 4,
                    backgroundColor: bg,
                    ...cardWidthStyle,
                    height: 140,
                    display: "flex",
                    overflow: "hidden",
                    position: "relative",
                }}
            >
                <EmbedUpdateBadge
                    visible={badgeVisible}
                    newTitle={updateCheck.newTitle}
                    onClick={handleBadgeClick}
                />
                <Stack style={{ flex: 1, minWidth: 0, padding: 12, justifyContent: "space-between" }}>
                    <div style={{ minHeight: 0, overflow: "hidden" }}>
                        <Text
                            component="span"
                            style={{
                                color: textPrimary,
                                fontSize: 15,
                                fontWeight: 600,
                                display: "-webkit-box",
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: "vertical",
                                overflow: "hidden",
                            }}
                        >
                            {title}
                        </Text>
                        {description && (
                            <Text
                                component="span"
                                style={{
                                    color: textSecondary,
                                    fontSize: 13,
                                    marginTop: 4,
                                    display: "-webkit-box",
                                    WebkitLineClamp: 2,
                                    WebkitBoxOrient: "vertical",
                                    overflow: "hidden",
                                }}
                            >
                                {description}
                            </Text>
                        )}
                    </div>
                    <Stack direction="row" spacing={1} alignItems="center">
                        {favicon ? (
                            <img
                                src={favicon}
                                alt=""
                                loading="lazy"
                                style={{ width: 14, height: 14 }}
                            />
                        ) : (
                            <LinkIcon fontSize={14} color={textSecondary} />
                        )}
                        <Text
                            component="span"
                            style={{ color: textSecondary, fontSize: 12 }}
                        >
                            {domain}
                        </Text>
                        {error && (
                            <Text
                                component="span"
                                style={{ color: getWarningMain(isDark), fontSize: 12 }}
                            >
                                ⚠ {error}
                            </Text>
                        )}
                    </Stack>
                </Stack>
                {image && (
                    <img
                        src={image}
                        alt=""
                        loading="lazy"
                        style={{
                            width: 180,
                            height: "100%",
                            objectFit: "cover",
                            flexShrink: 0,
                        }}
                    />
                )}
            </div>
        </a>
    );
}

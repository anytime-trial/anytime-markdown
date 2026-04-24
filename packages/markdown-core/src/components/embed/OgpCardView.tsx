import LinkIcon from "@mui/icons-material/Link";
import { Box, Skeleton, Stack, Typography, useTheme } from "@mui/material";
import { type CSSProperties } from "react";

import { useEmbedUpdateCheck, useOgpData } from "../../hooks/useEmbedData";
import type { EmbedProviders } from "../../types/embedProvider";
import { DEFAULT_EMBED_BASELINE, type EmbedBaseline } from "../../utils/embedInfoString";
import { markEmbedSeen } from "../../utils/embedSeenStore";
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

export function OgpCardView({ url, variant, providers, widthOverride, baseline, onBaselineWrite }: Props) {
    const { loading, data, error } = useOgpData(url, providers);
    const theme = useTheme();

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

    const borderColor = theme.palette.divider;
    const bg = theme.palette.background.paper;
    const textPrimary = theme.palette.text.primary;
    const textSecondary = theme.palette.text.secondary;

    const cardWidthSx = widthOverride ? { width: widthOverride } : { width: "100%", maxWidth: 720 };

    if (loading) {
        if (variant === "compact") {
            return <Skeleton variant="rectangular" height={40} sx={{ maxWidth: 720 }} />;
        }
        return <Skeleton variant="rectangular" height={140} sx={cardWidthSx} />;
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
                <Box
                    sx={{
                        border: `1px solid ${borderColor}`,
                        borderRadius: 1,
                        backgroundColor: bg,
                        maxWidth: 720,
                        height: 40,
                        display: "flex",
                        alignItems: "center",
                        gap: 1,
                        px: 1.5,
                        overflow: "hidden",
                    }}
                >
                    {favicon ? (
                        <Box
                            component="img"
                            src={favicon}
                            alt=""
                            loading="lazy"
                            sx={{ width: 16, height: 16, flexShrink: 0 }}
                        />
                    ) : (
                        <LinkIcon sx={{ fontSize: 16, color: textSecondary, flexShrink: 0 }} />
                    )}
                    <Typography
                        sx={{
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
                    </Typography>
                    <Typography
                        sx={{
                            color: textSecondary,
                            fontSize: 12,
                            flexShrink: 0,
                        }}
                    >
                        {domain}
                    </Typography>
                </Box>
            </a>
        );
    }

    return (
        <a href={url} target="_blank" rel="noopener noreferrer" style={linkStyle}>
            <Box
                sx={{
                    border: `1px solid ${borderColor}`,
                    borderRadius: 1,
                    backgroundColor: bg,
                    ...cardWidthSx,
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
                <Stack sx={{ flex: 1, minWidth: 0, p: 1.5, justifyContent: "space-between" }}>
                    <Box sx={{ minHeight: 0, overflow: "hidden" }}>
                        <Typography
                            sx={{
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
                        </Typography>
                        {description && (
                            <Typography
                                sx={{
                                    color: textSecondary,
                                    fontSize: 13,
                                    mt: 0.5,
                                    display: "-webkit-box",
                                    WebkitLineClamp: 2,
                                    WebkitBoxOrient: "vertical",
                                    overflow: "hidden",
                                }}
                            >
                                {description}
                            </Typography>
                        )}
                    </Box>
                    <Stack direction="row" spacing={1} alignItems="center">
                        {favicon ? (
                            <Box
                                component="img"
                                src={favicon}
                                alt=""
                                loading="lazy"
                                sx={{ width: 14, height: 14 }}
                            />
                        ) : (
                            <LinkIcon sx={{ fontSize: 14, color: textSecondary }} />
                        )}
                        <Typography
                            sx={{ color: textSecondary, fontSize: 12 }}
                        >
                            {domain}
                        </Typography>
                        {error && (
                            <Typography sx={{ color: theme.palette.warning.main, fontSize: 12 }}>
                                ⚠ {error}
                            </Typography>
                        )}
                    </Stack>
                </Stack>
                {image && (
                    <Box
                        component="img"
                        src={image}
                        alt=""
                        loading="lazy"
                        sx={{
                            width: 180,
                            height: "100%",
                            objectFit: "cover",
                            flexShrink: 0,
                        }}
                    />
                )}
            </Box>
        </a>
    );
}

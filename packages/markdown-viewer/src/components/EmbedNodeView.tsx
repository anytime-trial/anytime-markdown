import LinkOffIcon from "@mui/icons-material/LinkOff";
import { Box, Stack, Typography, useTheme } from "@mui/material";

import { useOptionalEmbedProviders } from "../contexts/EmbedProvidersContext";
import type { EmbedProviders } from "../types/embedProvider";
import { classifyEmbedUrl } from "../utils/embedClassifier";
import { type EmbedBaseline,parseEmbedInfoString } from "../utils/embedInfoString";
import { DrawioEmbedView } from "./embed/DrawioEmbedView";
import { FigmaEmbedView } from "./embed/FigmaEmbedView";
import { OgpCardView } from "./embed/OgpCardView";
import { SpotifyEmbedView } from "./embed/SpotifyEmbedView";
import { TwitterEmbedView } from "./embed/TwitterEmbedView";
import { YouTubeEmbedView } from "./embed/YouTubeEmbedView";

interface EmbedNodeViewProps {
    language: string;
    body: string;
    providers?: EmbedProviders | null;
    /** card variant のリサイズで親が決定した幅（例: "640px"）。compact では無視される。 */
    widthOverride?: string;
    baseline?: EmbedBaseline;
    onBaselineWrite?: (baseline: EmbedBaseline) => void;
}

function extractUrl(body: string): string | null {
    for (const rawLine of body.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (line) return line;
    }
    return null;
}

function PlaceholderBox({ message }: Readonly<{ message: string }>) {
    const theme = useTheme();
    return (
        <Stack
            direction="row"
            spacing={1}
            alignItems="center"
            sx={{
                border: `1px dashed ${theme.palette.divider}`,
                borderRadius: 1,
                backgroundColor: theme.palette.action.hover,
                maxWidth: 720,
                px: 1.5,
                py: 1,
            }}
        >
            <LinkOffIcon sx={{ fontSize: 16, color: theme.palette.text.secondary }} />
            <Typography sx={{ color: theme.palette.text.secondary, fontSize: 13 }}>
                {message}
            </Typography>
        </Stack>
    );
}

export function EmbedNodeView({ language, body, providers, widthOverride, baseline, onBaselineWrite }: Readonly<EmbedNodeViewProps>) {
    const ctxProviders = useOptionalEmbedProviders();
    const effectiveProviders = providers ?? ctxProviders;

    const variantInfo = parseEmbedInfoString(language) ?? { variant: "card" as const };
    const url = extractUrl(body);
    const effectiveWidth = variantInfo.variant === "card" ? widthOverride : undefined;

    if (!url) {
        return <PlaceholderBox message="有効な URL を入力してください" />;
    }

    const classified = classifyEmbedUrl(url);
    if (!classified) {
        return <PlaceholderBox message="この URL は埋め込めません" />;
    }

    if (classified.kind === "youtube") {
        return (
            <YouTubeEmbedView
                videoId={classified.videoId}
                variant={variantInfo.variant}
                widthOverride={effectiveWidth}
            />
        );
    }
    if (classified.kind === "figma") {
        return (
            <FigmaEmbedView
                path={classified.path}
                variant={variantInfo.variant}
                widthOverride={effectiveWidth}
            />
        );
    }
    if (classified.kind === "spotify") {
        return (
            <SpotifyEmbedView
                spotifyType={classified.type}
                spotifyId={classified.id}
                variant={variantInfo.variant}
                widthOverride={effectiveWidth}
            />
        );
    }
    if (classified.kind === "drawio") {
        return (
            <DrawioEmbedView
                url={classified.url}
                variant={variantInfo.variant}
                widthOverride={effectiveWidth}
            />
        );
    }

    if (!effectiveProviders) {
        return (
            <Box>
                <PlaceholderBox message="埋め込みプロバイダが未設定です" />
            </Box>
        );
    }

    if (classified.kind === "twitter") {
        return (
            <TwitterEmbedView
                url={classified.url}
                variant={variantInfo.variant}
                providers={effectiveProviders}
                widthOverride={effectiveWidth}
            />
        );
    }

    return (
        <OgpCardView
            url={classified.url}
            variant={variantInfo.variant}
            providers={effectiveProviders}
            widthOverride={effectiveWidth}
            baseline={baseline}
            onBaselineWrite={onBaselineWrite}
        />
    );
}

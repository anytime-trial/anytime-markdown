import { Box, Skeleton, Stack, Typography, useTheme } from "@mui/material";
import { useEffect, useRef } from "react";

import { useOembedData } from "../../hooks/useEmbedData";
import type { EmbedProviders } from "../../types/embedProvider";
import { sanitizeTweetHtml } from "../../utils/tweetSanitize";

interface Props {
    url: string;
    variant: "card" | "compact";
    providers: EmbedProviders;
    widthOverride?: string;
}

const WIDGETS_JS_SRC = "https://platform.twitter.com/widgets.js";
let widgetsLoaded = false;

function loadWidgetsJs(): void {
    if (typeof window === "undefined") return;
    if (widgetsLoaded) return;
    if ((globalThis as { twttr?: unknown }).twttr) {
        widgetsLoaded = true;
        return;
    }
    const existing = document.querySelector(`script[src="${WIDGETS_JS_SRC}"]`);
    if (existing) {
        widgetsLoaded = true;
        return;
    }
    const script = document.createElement("script");
    script.src = WIDGETS_JS_SRC;
    script.async = true;
    document.head.appendChild(script);
    widgetsLoaded = true;
}

function extractTextExcerpt(html: string): string {
    let text = "";
    let inTag = false;
    let prevSpace = true;

    for (const ch of html) {
        if (ch === "<") {
            inTag = true;
            continue;
        }
        if (ch === ">") {
            inTag = false;
            if (!prevSpace) {
                text += " ";
                prevSpace = true;
            }
            continue;
        }
        if (inTag) continue;

        const isSpace = ch === " " || ch === "\n" || ch === "\r" || ch === "\t" || ch === "\f";
        if (isSpace) {
            if (!prevSpace) {
                text += " ";
                prevSpace = true;
            }
            continue;
        }

        text += ch;
        prevSpace = false;
    }

    return text.trim().slice(0, 50);
}

export function TwitterEmbedView({ url, variant, providers, widthOverride }: Readonly<Props>) {
    const { loading, data, error } = useOembedData(url, providers);
    const theme = useTheme();
    const containerRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (!data?.html) return;
        loadWidgetsJs();
        const twttr = (globalThis as { twttr?: { widgets?: { load?: (el?: Element) => void } } }).twttr;
        if (twttr?.widgets?.load && containerRef.current) {
            twttr.widgets.load(containerRef.current);
        }
    }, [data?.html]);

    if (loading) {
        return (
            <Skeleton
                variant="rectangular"
                height={variant === "compact" ? 40 : 180}
                sx={{ maxWidth: 720 }}
            />
        );
    }

    if (error || !data) {
        return (
            <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: theme.palette.warning.main }}
            >
                ⚠ {url}
            </a>
        );
    }

    if (variant === "compact") {
        const author = data.authorName ?? "";
        const excerpt = extractTextExcerpt(data.html);
        return (
            <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                style={{ textDecoration: "none", color: "inherit", display: "block" }}
            >
                <Stack
                    direction="row"
                    spacing={1}
                    alignItems="center"
                    sx={{
                        border: `1px solid ${theme.palette.divider}`,
                        borderRadius: 1,
                        backgroundColor: theme.palette.background.paper,
                        maxWidth: 720,
                        height: 40,
                        px: 1.5,
                    }}
                >
                    <Typography sx={{ fontSize: 14, color: theme.palette.text.primary, fontWeight: 600 }}>
                        @{author}
                    </Typography>
                    <Typography
                        sx={{
                            fontSize: 13,
                            color: theme.palette.text.secondary,
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            flex: 1,
                        }}
                    >
                        · {excerpt}
                    </Typography>
                </Stack>
            </a>
        );
    }

    return (
        <Box
            ref={containerRef}
            sx={{ width: widthOverride ?? "100%", maxWidth: widthOverride ?? 720 }}
            dangerouslySetInnerHTML={{ __html: sanitizeTweetHtml(data.html) }}
        />
    );
}

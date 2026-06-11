"use client";

import { Skeleton } from "../../ui/Skeleton";
import { useEffect, useRef } from "react";

import { Stack } from "../../ui/Stack";
import { Text } from "../../ui/Text";
import { useIsDark } from "../../contexts/ThemeModeContext";
import {
    getBgPaper,
    getDivider,
    getTextPrimary,
    getTextSecondary,
    getWarningMain,
} from "@anytime-markdown/markdown-viewer/src/constants/colors";
import { useOembedData } from "../../hooks/useEmbedData";
import type { EmbedProviders } from "@anytime-markdown/markdown-viewer/src/types/embedProvider";
import { sanitizeTweetHtml } from "@anytime-markdown/markdown-viewer/src/utils/tweetSanitize";

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
    const isDark = useIsDark();
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
                style={{ maxWidth: 720 }}
            />
        );
    }

    if (error || !data) {
        return (
            <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: getWarningMain(isDark) }}
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
                    style={{
                        border: `1px solid ${getDivider(isDark)}`,
                        borderRadius: 4,
                        backgroundColor: getBgPaper(isDark),
                        maxWidth: 720,
                        height: 40,
                        paddingLeft: 12,
                        paddingRight: 12,
                    }}
                >
                    <Text style={{ fontSize: 14, color: getTextPrimary(isDark), fontWeight: 600 }}>
                        @{author}
                    </Text>
                    <Text
                        style={{
                            fontSize: 13,
                            color: getTextSecondary(isDark),
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            flex: 1,
                        }}
                    >
                        · {excerpt}
                    </Text>
                </Stack>
            </a>
        );
    }

    return (
        <div
            ref={containerRef}
            style={{ width: widthOverride ?? "100%", maxWidth: widthOverride ?? 720 }}
            dangerouslySetInnerHTML={{ __html: sanitizeTweetHtml(data.html) }}
        />
    );
}

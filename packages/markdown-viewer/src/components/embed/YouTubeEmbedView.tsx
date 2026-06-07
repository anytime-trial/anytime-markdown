import { PlayArrowIcon } from "../../ui/icons";
import { Stack } from "../../ui/Stack";
import { Text } from "../../ui/Text";

interface Props {
    videoId: string;
    variant: "card" | "compact";
    widthOverride?: string;
}

export function YouTubeEmbedView({ videoId, variant, widthOverride }: Readonly<Props>) {
    const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;

    if (variant === "compact") {
        return (
            <a
                href={watchUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{ textDecoration: "none", color: "inherit", display: "block" }}
            >
                <Stack
                    direction="row"
                    spacing={1}
                    alignItems="center"
                    style={{
                        border: "1px solid var(--am-color-divider)",
                        borderRadius: 4,
                        backgroundColor: "var(--am-color-bg-paper)",
                        maxWidth: 720,
                        height: 40,
                        paddingLeft: 12,
                        paddingRight: 12,
                        overflow: "hidden",
                    }}
                >
                    <PlayArrowIcon fontSize={20} color="#FF0000" style={{ flexShrink: 0 }} />
                    <Text
                        style={{
                            color: "var(--am-color-text-primary)",
                            fontSize: 14,
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            flex: 1,
                        }}
                    >
                        YouTube: {videoId}
                    </Text>
                </Stack>
            </a>
        );
    }

    return (
        <div
            style={{
                position: "relative",
                width: widthOverride ?? "100%",
                maxWidth: widthOverride ?? 720,
                paddingTop: "56.25%",
                borderRadius: 4,
                overflow: "hidden",
                backgroundColor: "var(--am-color-bg-paper)",
            }}
        >
            <iframe
                src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}`}
                title={`YouTube: ${videoId}`}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                referrerPolicy="strict-origin-when-cross-origin"
                loading="lazy"
                style={{
                    position: "absolute",
                    inset: 0,
                    width: "100%",
                    height: "100%",
                    border: 0,
                }}
            />
        </div>
    );
}

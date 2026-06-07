import { useTheme } from "@mui/material";

import { MusicNoteIcon } from "../../ui/icons";
import { Stack } from "../../ui/Stack";
import { Text } from "../../ui/Text";

interface Props {
    spotifyType: string;
    spotifyId: string;
    variant: "card" | "compact";
    widthOverride?: string;
}

function iframeHeightFor(type: string): number {
    if (type === "track") return 80;
    if (type === "artist") return 380;
    return 152;
}

export function SpotifyEmbedView({ spotifyType, spotifyId, variant, widthOverride }: Readonly<Props>) {
    const theme = useTheme();
    const pageUrl = `https://open.spotify.com/${spotifyType}/${spotifyId}`;

    if (variant === "compact") {
        return (
            <a
                href={pageUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{ textDecoration: "none", color: "inherit", display: "block" }}
            >
                <Stack
                    direction="row"
                    spacing={1}
                    alignItems="center"
                    style={{
                        border: `1px solid ${theme.palette.divider}`,
                        borderRadius: 4,
                        backgroundColor: theme.palette.background.paper,
                        maxWidth: 720,
                        height: 40,
                        paddingLeft: 12,
                        paddingRight: 12,
                    }}
                >
                    <MusicNoteIcon fontSize={16} color="#1DB954" style={{ flexShrink: 0 }} />
                    <Text
                        style={{
                            color: theme.palette.text.primary,
                            fontSize: 14,
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            flex: 1,
                        }}
                    >
                        Spotify: {spotifyId}
                    </Text>
                </Stack>
            </a>
        );
    }

    const height = iframeHeightFor(spotifyType);
    const embedSrc = `https://open.spotify.com/embed/${encodeURIComponent(spotifyType)}/${encodeURIComponent(spotifyId)}`;

    return (
        <div
            style={{
                width: widthOverride ?? "100%",
                maxWidth: widthOverride ?? 720,
                borderRadius: 4,
                overflow: "hidden",
            }}
        >
            <iframe
                src={embedSrc}
                title={`Spotify ${spotifyType}: ${spotifyId}`}
                allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                referrerPolicy="strict-origin-when-cross-origin"
                loading="lazy"
                style={{ width: "100%", height, border: 0 }}
            />
        </div>
    );
}

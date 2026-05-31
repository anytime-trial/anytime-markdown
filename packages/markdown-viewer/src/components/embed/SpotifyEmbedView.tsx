import MusicNoteIcon from "@mui/icons-material/MusicNote";
import { Box, Stack, Typography, useTheme } from "@mui/material";

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
                    sx={{
                        border: `1px solid ${theme.palette.divider}`,
                        borderRadius: 1,
                        backgroundColor: theme.palette.background.paper,
                        maxWidth: 720,
                        height: 40,
                        px: 1.5,
                    }}
                >
                    <MusicNoteIcon sx={{ fontSize: 16, color: "#1DB954", flexShrink: 0 }} />
                    <Typography
                        sx={{
                            color: theme.palette.text.primary,
                            fontSize: 14,
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            flex: 1,
                        }}
                    >
                        Spotify: {spotifyId}
                    </Typography>
                </Stack>
            </a>
        );
    }

    const height = iframeHeightFor(spotifyType);
    const embedSrc = `https://open.spotify.com/embed/${encodeURIComponent(spotifyType)}/${encodeURIComponent(spotifyId)}`;

    return (
        <Box
            sx={{
                width: widthOverride ?? "100%",
                maxWidth: widthOverride ?? 720,
                borderRadius: 1,
                overflow: "hidden",
            }}
        >
            <Box
                component="iframe"
                src={embedSrc}
                title={`Spotify ${spotifyType}: ${spotifyId}`}
                allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                referrerPolicy="strict-origin-when-cross-origin"
                loading="lazy"
                sx={{ width: "100%", height, border: 0 }}
            />
        </Box>
    );
}

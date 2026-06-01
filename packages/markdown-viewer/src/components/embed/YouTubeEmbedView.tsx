import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import { Box, Stack, Typography, useTheme } from "@mui/material";

interface Props {
    videoId: string;
    variant: "card" | "compact";
    widthOverride?: string;
}

export function YouTubeEmbedView({ videoId, variant, widthOverride }: Readonly<Props>) {
    const theme = useTheme();
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
                    sx={{
                        border: `1px solid ${theme.palette.divider}`,
                        borderRadius: 1,
                        backgroundColor: theme.palette.background.paper,
                        maxWidth: 720,
                        height: 40,
                        px: 1.5,
                        overflow: "hidden",
                    }}
                >
                    <PlayArrowIcon sx={{ fontSize: 20, color: "#FF0000", flexShrink: 0 }} />
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
                        YouTube: {videoId}
                    </Typography>
                </Stack>
            </a>
        );
    }

    return (
        <Box
            sx={{
                position: "relative",
                width: widthOverride ?? "100%",
                maxWidth: widthOverride ?? 720,
                paddingTop: "56.25%",
                borderRadius: 1,
                overflow: "hidden",
                backgroundColor: theme.palette.background.paper,
            }}
        >
            <Box
                component="iframe"
                src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}`}
                title={`YouTube: ${videoId}`}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                referrerPolicy="strict-origin-when-cross-origin"
                loading="lazy"
                sx={{
                    position: "absolute",
                    inset: 0,
                    width: "100%",
                    height: "100%",
                    border: 0,
                }}
            />
        </Box>
    );
}

import HexagonOutlinedIcon from "@mui/icons-material/HexagonOutlined";
import { Box, Stack, Typography, useTheme } from "@mui/material";

interface Props {
    url: string;
    variant: "card" | "compact";
    widthOverride?: string;
}

function extractFileName(url: string): string {
    try {
        const u = new URL(url);
        const last = u.pathname.split("/").filter(Boolean).at(-1);
        return last ?? u.hostname;
    } catch {
        return url;
    }
}

export function DrawioEmbedView({ url, variant, widthOverride }: Readonly<Props>) {
    const theme = useTheme();

    if (variant === "compact") {
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
                    <HexagonOutlinedIcon
                        sx={{ fontSize: 16, color: theme.palette.text.secondary, flexShrink: 0 }}
                    />
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
                        {extractFileName(url)}
                    </Typography>
                </Stack>
            </a>
        );
    }

    const embedSrc = `https://viewer.diagrams.net/?embed=1&ui=min&lightbox=0#U${encodeURIComponent(url)}`;

    return (
        <Box
            sx={{
                position: "relative",
                width: widthOverride ?? "100%",
                maxWidth: widthOverride ?? 720,
                paddingTop: "75%",
                borderRadius: 1,
                overflow: "hidden",
                border: `1px solid ${theme.palette.divider}`,
            }}
        >
            <Box
                component="iframe"
                src={embedSrc}
                title={`Draw.io: ${extractFileName(url)}`}
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

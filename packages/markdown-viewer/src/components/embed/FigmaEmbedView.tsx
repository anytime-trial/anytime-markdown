import HexagonOutlinedIcon from "@mui/icons-material/HexagonOutlined";
import { Box, Stack, Typography, useTheme } from "@mui/material";

interface Props {
    path: string;
    variant: "card" | "compact";
    widthOverride?: string;
}

function extractFileName(path: string): string {
    const segments = path.split("/").filter(Boolean);
    return segments.at(-1) ?? "Figma";
}

export function FigmaEmbedView({ path, variant, widthOverride }: Readonly<Props>) {
    const theme = useTheme();
    const canonical = `https://www.figma.com${path}`;

    if (variant === "compact") {
        return (
            <a
                href={canonical}
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
                        {extractFileName(path)}
                    </Typography>
                </Stack>
            </a>
        );
    }

    const embedSrc = `https://www.figma.com/embed?embed_host=anytime-markdown&url=${encodeURIComponent(canonical)}`;

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
                title={`Figma: ${extractFileName(path)}`}
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

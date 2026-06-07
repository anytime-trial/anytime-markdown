import { useIsDark } from "../../contexts/ThemeModeContext";
import { getBgPaper, getTextPrimary, getTextSecondary } from "../../constants/colors";
import { HexagonOutlinedIcon } from "../../ui/icons";
import { Stack } from "../../ui/Stack";
import { Text } from "../../ui/Text";

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
    const isDark = useIsDark();
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
                    style={{
                        border: `1px solid var(--am-color-divider)`,
                        borderRadius: 4,
                        backgroundColor: getBgPaper(isDark),
                        maxWidth: 720,
                        height: 40,
                        paddingLeft: 12,
                        paddingRight: 12,
                    }}
                >
                    <HexagonOutlinedIcon
                        fontSize={16}
                        color={getTextSecondary(isDark)}
                        style={{ flexShrink: 0 }}
                    />
                    <Text
                        component="span"
                        style={{
                            color: getTextPrimary(isDark),
                            fontSize: 14,
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            flex: 1,
                        }}
                    >
                        {extractFileName(path)}
                    </Text>
                </Stack>
            </a>
        );
    }

    const embedSrc = `https://www.figma.com/embed?embed_host=anytime-markdown&url=${encodeURIComponent(canonical)}`;

    return (
        <div
            style={{
                position: "relative",
                width: widthOverride ?? "100%",
                maxWidth: widthOverride ?? 720,
                paddingTop: "75%",
                borderRadius: 4,
                overflow: "hidden",
                border: `1px solid var(--am-color-divider)`,
            }}
        >
            <iframe
                src={embedSrc}
                title={`Figma: ${extractFileName(path)}`}
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

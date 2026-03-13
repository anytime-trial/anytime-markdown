import { Box, Typography, useTheme } from "@mui/material";
import { type FC, useMemo } from "react";

import { computeDiff } from "../utils/diffEngine";

interface TimelineDiffViewProps {
  content: string;
  previousContent: string | null;
  height: number;
}

export const TimelineDiffView: FC<TimelineDiffViewProps> = ({
  content,
  previousContent,
  height,
}) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";

  const diffLines = useMemo(() => {
    if (!previousContent) {
      return content.split("\n").map((text, i) => ({
        text,
        type: "equal" as const,
        lineNumber: i + 1,
      }));
    }
    const result = computeDiff(previousContent, content);
    return result.rightLines
      .filter((l) => l.type !== "padding")
      .map((l) => ({
        text: l.text,
        type: l.type,
        lineNumber: l.lineNumber,
      }));
  }, [content, previousContent]);

  const bgColor = (type: string): string | undefined => {
    if (type === "added" || type === "modified-new") {
      return isDark ? "rgba(46,160,67,0.15)" : "rgba(46,160,67,0.10)";
    }
    if (type === "removed" || type === "modified-old") {
      return isDark ? "rgba(248,81,73,0.15)" : "rgba(248,81,73,0.10)";
    }
    return undefined;
  };

  return (
    <Box
      sx={{
        height,
        overflow: "auto",
        fontFamily: "monospace",
        fontSize: "0.85rem",
        lineHeight: 1.6,
        p: 2,
        bgcolor: "background.default",
      }}
    >
      {diffLines.map((line, i) => (
        <Box
          key={i}
          sx={{
            display: "flex",
            bgcolor: bgColor(line.type),
            px: 1,
            minHeight: "1.6em",
          }}
        >
          <Typography
            component="span"
            sx={{
              width: 48,
              textAlign: "right",
              pr: 2,
              color: "text.secondary",
              userSelect: "none",
              fontFamily: "monospace",
              fontSize: "inherit",
            }}
          >
            {line.lineNumber ?? ""}
          </Typography>
          <Typography
            component="span"
            sx={{
              whiteSpace: "pre-wrap",
              wordBreak: "break-all",
              fontFamily: "monospace",
              fontSize: "inherit",
              flex: 1,
            }}
          >
            {line.text}
          </Typography>
        </Box>
      ))}
    </Box>
  );
};

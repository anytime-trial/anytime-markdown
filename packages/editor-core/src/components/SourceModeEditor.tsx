import { Box, Paper, useTheme } from "@mui/material";
import { alpha } from "@mui/material/styles";
import { useEditorSettingsContext } from "../useEditorSettings";

interface SourceModeEditorProps {
  sourceText: string;
  onSourceChange: (value: string) => void;
  editorHeight: number;
  ariaLabel: string;
}

export function SourceModeEditor({
  sourceText,
  onSourceChange,
  editorHeight,
  ariaLabel,
}: SourceModeEditorProps) {
  const settings = useEditorSettingsContext();
  const theme = useTheme();

  return (
    <Paper
      variant="outlined"
      sx={{
        borderTopLeftRadius: 0,
        borderTopRightRadius: 0,
        maxHeight: editorHeight,
        overflow: "auto",
      }}
    >
      <Box sx={{ display: "flex", minHeight: "100%" }}>
        <Box
          component="pre"
          sx={{
            width: "auto",
            minWidth: "3ch",
            py: 2,
            px: 1,
            m: 0,
            textAlign: "right",
            whiteSpace: "pre",
            fontFamily: "monospace",
            fontSize: `${settings.fontSize}px`,
            lineHeight: settings.lineHeight,
            color: alpha(theme.palette.text.secondary, 0.6),
            userSelect: "none",
            overflow: "hidden",
            boxSizing: "border-box",
            flexShrink: 0,
          }}
        >
          {Array.from({ length: (sourceText || "").split("\n").length || 1 }, (_, i) => i + 1).join("\n")}
        </Box>
        <Box
          component="textarea"
          aria-label={ariaLabel}
          value={sourceText}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
            onSourceChange(e.target.value)
          }
          sx={{
            flex: 1,
            minWidth: 0,
            minHeight: editorHeight - 36,
            py: 2,
            pr: 2,
            pl: 1,
            border: "none",
            outline: "none",
            resize: "none",
            fontFamily: "monospace",
            fontSize: `${settings.fontSize}px`,
            lineHeight: settings.lineHeight,
            color: theme.palette.text.primary,
            bgcolor: "transparent",
            boxSizing: "border-box",
          }}
        />
      </Box>
    </Paper>
  );
}

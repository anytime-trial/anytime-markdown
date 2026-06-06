"use client";

import { Box, Button, Typography } from "@mui/material";
import type { ErrorInfo, ReactNode } from "react";
import { Component } from "react";

import { getTextSecondary } from "../constants/colors";

interface Props {
  children: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  componentStack: string | null;
}

export class EditorErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, componentStack: null };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.setState({ componentStack: errorInfo.componentStack ?? null });
    // 断続的なクラッシュ（ファイル選択・比較表示など）の原因特定のため、
    // stack と componentStack を必ず出力する（silent 破棄禁止）。
    const ts = new Date().toISOString();
    // eslint-disable-next-line no-console
    console.error(`[${ts}] [EditorErrorBoundary] エディタの描画でエラーが発生`, error, errorInfo.componentStack ?? "");
    this.props.onError?.(error, errorInfo);
  }

  private readonly handleReload = () => {
    this.setState({ hasError: false, error: null, componentStack: null });
  };

  render() {
    if (this.state.hasError) {
      const { error, componentStack } = this.state;
      const details = [error?.stack ?? error?.message ?? "", componentStack ?? ""]
        .filter(Boolean)
        .join("\n\n");
      return (
        <Box
          role="alert"
          sx={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            minHeight: "40vh",
            gap: 2,
            p: 4,
          }}
        >
          <Typography variant="h6" component="h2" sx={{ fontWeight: 700 }}>
            エディタでエラーが発生しました
          </Typography>
          <Typography variant="body2" sx={{ maxWidth: 480, textAlign: "center", color: (theme) => getTextSecondary(theme.palette.mode === "dark") }}>
            {error?.message}
          </Typography>
          {details && (
            <Box
              component="details"
              sx={{
                width: "100%",
                maxWidth: 720,
                color: (theme) => getTextSecondary(theme.palette.mode === "dark"),
              }}
            >
              <Box component="summary" sx={{ cursor: "pointer", fontSize: "0.8125rem", mb: 1 }}>
                詳細 (開発者向け)
              </Box>
              <Box
                component="pre"
                sx={{
                  textAlign: "left",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  fontSize: "0.75rem",
                  maxHeight: 280,
                  overflow: "auto",
                  m: 0,
                  p: 1.5,
                  borderRadius: 1,
                  border: "1px solid",
                  borderColor: "divider",
                  bgcolor: (theme) => (theme.palette.mode === "dark" ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)"),
                }}
              >
                {details}
              </Box>
            </Box>
          )}
          <Button
            variant="contained"
            onClick={this.handleReload}
            aria-label="エディタを再読み込み"
          >
            再読み込み
          </Button>
        </Box>
      );
    }
    return this.props.children;
  }
}

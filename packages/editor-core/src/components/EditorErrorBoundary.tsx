"use client";

import { Box, Button, Typography } from "@mui/material";
import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";

interface Props {
  children: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class EditorErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.props.onError?.(error, errorInfo);
  }

  private handleReload = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
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
          <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 480, textAlign: "center" }}>
            {this.state.error?.message}
          </Typography>
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

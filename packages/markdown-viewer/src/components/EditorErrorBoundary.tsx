"use client";

import type { ErrorInfo, ReactNode } from "react";
import { Component } from "react";

import { Button } from "../ui/Button";
import { Text } from "../ui/Text";
import styles from "./EditorErrorBoundary.module.css";

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
    // VS Code 拡張では webview の console が見えないため、拡張の Output チャネルへ転送する
    if (typeof window !== "undefined") {
      window.__vscode?.postMessage({
        type: "editorError",
        message: error.message,
        stack: error.stack ?? "",
        componentStack: errorInfo.componentStack ?? "",
      });
    }
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
        <div
          role="alert"
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            minHeight: "40vh",
            gap: 16,
            padding: 32,
          }}
        >
          <Text variant="h6" component="h2" style={{ fontWeight: 700 }}>
            エディタでエラーが発生しました
          </Text>
          <Text
            variant="body2"
            style={{
              maxWidth: 480,
              textAlign: "center",
              color: "var(--am-color-text-secondary)",
            }}
          >
            {error?.message}
          </Text>
          {details && (
            <details
              style={{
                width: "100%",
                maxWidth: 720,
                color: "var(--am-color-text-secondary)",
              }}
            >
              <summary style={{ cursor: "pointer", fontSize: "0.8125rem", marginBottom: 8 }}>
                詳細 (開発者向け)
              </summary>
              <pre className={styles.preBlock}>
                {details}
              </pre>
            </details>
          )}
          <Button
            variant="contained"
            onClick={this.handleReload}
            aria-label="エディタを再読み込み"
          >
            再読み込み
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}

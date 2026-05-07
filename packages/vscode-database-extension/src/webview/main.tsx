import { CssBaseline, ThemeProvider, createTheme } from "@mui/material";
import { NextIntlClientProvider } from "next-intl";
import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  DatabaseEditor,
  databaseViewerEnMessages,
  databaseViewerJaMessages,
} from "@anytime-markdown/database-viewer";
import { RemoteDatabaseAdapter } from "@anytime-markdown/database-core/RemoteDatabaseAdapter";
import type {
  ExtToWvMessage,
  InitMessage,
  MessageTransport,
  WvToExtMessage,
} from "@anytime-markdown/database-core/messaging";
import type { SchemaInfo } from "@anytime-markdown/database-core/types";
import {
  spreadsheetViewerEnMessages,
  spreadsheetViewerJaMessages,
} from "@anytime-markdown/spreadsheet-viewer";

declare const acquireVsCodeApi: () => {
  postMessage: (m: WvToExtMessage) => void;
};

const vscode = acquireVsCodeApi();

const isDark =
  typeof document !== "undefined" && document.body.classList.contains("vscode-dark");

const theme = createTheme({ palette: { mode: isDark ? "dark" : "light" } });

function makeTransport(): MessageTransport {
  const listeners = new Set<(m: ExtToWvMessage | WvToExtMessage) => void>();
  globalThis.addEventListener("message", (e: MessageEvent) =>
    listeners.forEach((l) => l(e.data as ExtToWvMessage)),
  );
  return {
    postMessage: (m) => vscode.postMessage(m as WvToExtMessage),
    onMessage: (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  };
}

function basename(filePath: string): string {
  // ファイルパス末尾のディレクトリ区切り後のセグメントを取り出す (Win/POSIX 両対応)
  const last = Math.max(filePath.lastIndexOf("/"), filePath.lastIndexOf("\\"));
  return last >= 0 ? filePath.slice(last + 1) : filePath;
}

const App: React.FC = () => {
  const [adapter, setAdapter] = useState<RemoteDatabaseAdapter | null>(null);
  const [schema, setSchema] = useState<SchemaInfo | null>(null);
  const [config, setConfig] = useState<{ queryMaxRows: number; fileName: string } | null>(null);

  useEffect(() => {
    const transport = makeTransport();
    const off = transport.onMessage((m) => {
      if (m.type !== "init") return;
      const init = m as InitMessage;
      const a = new RemoteDatabaseAdapter({
        transport,
        capabilities: init.capabilities,
      });
      setAdapter(a);
      setSchema(init.schema);
      setConfig({ queryMaxRows: init.config.queryMaxRows, fileName: init.config.fileName });
    });
    vscode.postMessage({ type: "ready" });
    return () => off();
  }, []);

  if (!adapter || !config) return <div>Loading database...</div>;

  return (
    <DatabaseEditor
      adapter={adapter}
      initialSchema={schema ?? undefined}
      queryMaxRows={config.queryMaxRows}
      themeMode={isDark ? "dark" : "light"}
      onMutationExecuted={() => vscode.postMessage({ type: "markDirty" })}
      databaseName={basename(config.fileName)}
    />
  );
};

const lang =
  typeof navigator !== "undefined" && navigator.language.startsWith("ja") ? "ja" : "en";
const messages =
  lang === "ja"
    ? { ...spreadsheetViewerJaMessages, ...databaseViewerJaMessages }
    : { ...spreadsheetViewerEnMessages, ...databaseViewerEnMessages };

const rootEl = document.getElementById("root");
if (rootEl) {
  createRoot(rootEl).render(
    <NextIntlClientProvider locale={lang} messages={messages as Record<string, unknown>}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <App />
      </ThemeProvider>
    </NextIntlClientProvider>,
  );
}

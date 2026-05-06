import { CssBaseline, ThemeProvider, createTheme } from "@mui/material";
import { NextIntlClientProvider } from "next-intl";
import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  DatabaseEditor,
  databaseViewerEnMessages,
  databaseViewerJaMessages,
} from "@anytime-markdown/database-viewer";
import { RemoteDatabaseAdapter } from "@anytime-markdown/database-core/src/RemoteDatabaseAdapter";
import type {
  ExtToWvMessage,
  InitMessage,
  MessageTransport,
  WvToExtMessage,
} from "@anytime-markdown/database-core/src/messaging";
import type { SchemaInfo } from "@anytime-markdown/database-core/src/types";
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

const App: React.FC = () => {
  const [adapter, setAdapter] = useState<RemoteDatabaseAdapter | null>(null);
  const [schema, setSchema] = useState<SchemaInfo | null>(null);
  const [config, setConfig] = useState<{ queryMaxRows: number } | null>(null);

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
      setConfig({ queryMaxRows: init.config.queryMaxRows });
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

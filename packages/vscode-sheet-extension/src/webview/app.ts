import {
  mountSpreadsheetEditor,
  type SpreadsheetEditorHandle,
  type SpreadsheetThemeMode,
  type WorkbookSnapshot,
  type ChartDefinition,
} from '@anytime-markdown/spreadsheet-viewer';
import { createVSCodeSheetAdapter } from './adapters/VSCodeSheetAdapter';
import { createVSCodeWorkbookAdapter } from './adapters/VSCodeWorkbookAdapter';
import { getVscodeApi } from './adapters/vscodeApi';

/**
 * sheet webview の vanilla bootstrap（旧 React App.tsx + index.tsx の置換）。
 * spreadsheet-viewer の脱 React に伴い、webview から react / react-dom / next-intl shim を排除した。
 */

type SheetFormat = 'sheet' | 'csv' | 'tsv';

function readBodyTheme(): SpreadsheetThemeMode {
  const kind = document.body.getAttribute('data-vscode-theme-kind');
  return kind === 'vscode-light' || kind === 'vscode-high-contrast-light' ? 'light' : 'dark';
}

export function startApp(container: HTMLElement): void {
  let format: SheetFormat = 'sheet';
  // locale 未受信時は undefined のまま渡し、spreadsheet-viewer 側の自動検出（navigator.language）に委ねる。
  let locale: string | undefined;
  let themeMode = readBodyTheme();
  let editor: SpreadsheetEditorHandle | null = null;
  /** init メッセージで受け取ったチャート定義（次回 mount 時に initialCharts として使う）。 */
  let pendingCharts: ChartDefinition[] | undefined;

  const csvAdapter = createVSCodeSheetAdapter('csv');
  const tsvAdapter = createVSCodeSheetAdapter('tsv');
  const workbookAdapter = createVSCodeWorkbookAdapter();
  const vscodeApi = getVscodeApi();

  const mountEditor = (): void => {
    editor?.destroy();
    const initialCharts = pendingCharts;
    pendingCharts = undefined;
    editor = mountSpreadsheetEditor(container, {
      locale,
      themeMode,
      ...(format === 'sheet'
        ? { workbookAdapter }
        : { adapter: format === 'tsv' ? tsvAdapter : csvAdapter }),
      initialCharts,
      onChartsChange: (charts) => {
        vscodeApi.postMessage({ type: 'chartsChange', charts });
      },
    });
  };

  // VS Code テーマ変更（body の data-vscode-theme-kind）を追従する。
  const themeObserver = new MutationObserver(() => {
    const next = readBodyTheme();
    if (next !== themeMode) {
      themeMode = next;
      editor?.update({ themeMode: next });
    }
  });
  themeObserver.observe(document.body, {
    attributes: true,
    attributeFilter: ['data-vscode-theme-kind'],
  });

  window.addEventListener('message', (event: MessageEvent) => {
    // VS Code webview のメッセージは origin が空文字列または vscode-webview:// スキーム
    if (event.origin && !event.origin.startsWith('vscode-webview://')) return;
    const msg = event.data as Record<string, unknown>;
    if (!msg) return;
    switch (msg.type) {
      case 'locale':
        if (typeof msg.locale === 'string' && msg.locale !== locale) {
          locale = msg.locale;
          mountEditor();
        }
        break;
      case 'init': {
        const fmt = (msg.format as SheetFormat) ?? 'sheet';
        const formatChanged = fmt !== format;
        format = fmt;
        // charts を pendingCharts に保持（mountEditor 呼び出し時に initialCharts として渡す）
        pendingCharts = Array.isArray(msg.charts) ? (msg.charts as ChartDefinition[]) : undefined;
        if (fmt === 'sheet' && msg.workbook) {
          workbookAdapter.applyWorkbook(msg.workbook as WorkbookSnapshot);
        } else if (fmt === 'csv' && typeof msg.text === 'string') {
          csvAdapter.applyText(msg.text);
        } else if (fmt === 'tsv' && typeof msg.text === 'string') {
          tsvAdapter.applyText(msg.text);
        }
        if (formatChanged) {
          mountEditor();
        } else if (pendingCharts && editor) {
          // フォーマット変更なし（再 mount しない）場合は直接 setCharts で同期する
          editor.setCharts(pendingCharts);
          pendingCharts = undefined;
        }
        break;
      }
      // テーマ変更は body の data-vscode-theme-kind を MutationObserver で追従する（message 経路なし）。
    }
  });

  mountEditor();
  vscodeApi.postMessage({ type: 'ready' });
}

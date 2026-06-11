import {
  mountSpreadsheetEditor,
  type SpreadsheetEditorHandle,
  type WorkbookSnapshot,
} from '@anytime-markdown/spreadsheet-viewer';
import { createVSCodeSheetAdapter } from './adapters/VSCodeSheetAdapter';
import { createVSCodeWorkbookAdapter } from './adapters/VSCodeWorkbookAdapter';
import { getVscodeApi } from './adapters/vscodeApi';

/**
 * sheet webview の vanilla bootstrap（旧 React App.tsx + index.tsx の置換）。
 * spreadsheet-viewer の脱 React に伴い、webview から react / react-dom / next-intl shim を排除した。
 */

type SheetFormat = 'sheet' | 'csv' | 'tsv';
type ThemeMode = 'light' | 'dark';

function detectLocale(): string {
  return typeof navigator !== 'undefined' && navigator.language.startsWith('ja') ? 'ja' : 'en';
}

function readBodyTheme(): ThemeMode {
  const kind = document.body.getAttribute('data-vscode-theme-kind');
  return kind === 'vscode-light' || kind === 'vscode-high-contrast-light' ? 'light' : 'dark';
}

export function startApp(container: HTMLElement): void {
  let format: SheetFormat = 'sheet';
  let locale = detectLocale();
  let themeMode = readBodyTheme();
  let editor: SpreadsheetEditorHandle | null = null;

  const csvAdapter = createVSCodeSheetAdapter('csv');
  const tsvAdapter = createVSCodeSheetAdapter('tsv');
  const workbookAdapter = createVSCodeWorkbookAdapter();

  const mountEditor = (): void => {
    editor?.destroy();
    editor = mountSpreadsheetEditor(container, {
      locale,
      themeMode,
      ...(format === 'sheet'
        ? { workbookAdapter }
        : { adapter: format === 'tsv' ? tsvAdapter : csvAdapter }),
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
        if (fmt === 'sheet' && msg.workbook) {
          workbookAdapter.applyWorkbook(msg.workbook as WorkbookSnapshot);
        } else if (fmt === 'csv' && typeof msg.text === 'string') {
          csvAdapter.applyText(msg.text);
        } else if (fmt === 'tsv' && typeof msg.text === 'string') {
          tsvAdapter.applyText(msg.text);
        }
        if (formatChanged) mountEditor();
        break;
      }
      case 'theme':
        break;
    }
  });

  mountEditor();
  getVscodeApi().postMessage({ type: 'ready' });
}

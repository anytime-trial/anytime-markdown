/* next-intl shim for VS Code webview (webpack) */
import { createNextIntlShim } from '@anytime-markdown/vscode-common/webview';
import messagesEn from '../../../../markdown-core/src/i18n/en.json';
import messagesJa from '../../../../markdown-core/src/i18n/ja.json';
import spreadsheetMessagesEn from '../../../../spreadsheet-viewer/src/i18n/en.json';
import spreadsheetMessagesJa from '../../../../spreadsheet-viewer/src/i18n/ja.json';

type Messages = Record<string, Record<string, string>>;

const mergedJa = { ...messagesJa, ...spreadsheetMessagesJa };
const mergedEn = { ...messagesEn, ...spreadsheetMessagesEn };

export const { setLocale, useTranslations, useLocale } = createNextIntlShim(
  {
    ja: mergedJa as unknown as Messages,
    en: mergedEn as unknown as Messages,
  },
  'ja',
);

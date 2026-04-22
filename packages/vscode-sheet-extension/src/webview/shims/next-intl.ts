/* next-intl shim for VS Code webview (webpack) */
import { createNextIntlShim } from '@anytime-markdown/vscode-common/webview';
import messagesEn from '../../../../spreadsheet-viewer/src/i18n/en.json';
import messagesJa from '../../../../spreadsheet-viewer/src/i18n/ja.json';

type Messages = Record<string, Record<string, string>>;

export const { setLocale, useTranslations, useLocale } = createNextIntlShim(
  {
    ja: messagesJa as unknown as Messages,
    en: messagesEn as unknown as Messages,
  },
  'ja',
);

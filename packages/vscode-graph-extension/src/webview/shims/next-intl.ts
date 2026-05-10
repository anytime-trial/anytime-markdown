/* next-intl shim for VS Code webview (webpack) */
import { createNextIntlShim } from '@anytime-markdown/vscode-common/webview';
import { enMessages as messagesEn, jaMessages as messagesJa } from '@anytime-markdown/graph-viewer/src/i18n';

type Messages = Record<string, Record<string, string>>;

export const { setLocale, useTranslations, useLocale } = createNextIntlShim(
  {
    ja: messagesJa as unknown as Messages,
    en: messagesEn as unknown as Messages,
  },
  'ja',
);

/* next-intl shim for VS Code webview (webpack alias 先。'next-intl' / 'next-intl/server' の実体をこれに差し替える) */
import { createNextIntlShim } from '@anytime-markdown/vscode-common/webview';
import { ticketsMessagesEn, ticketsMessagesJa } from '@anytime-markdown/tickets-viewer';

const shim = createNextIntlShim(
  { ja: { tickets: ticketsMessagesJa }, en: { tickets: ticketsMessagesEn } },
  'en',
);

export const setLocale = shim.setLocale;
export const useLocale = shim.useLocale;
export const useTranslations = shim.useTranslations;

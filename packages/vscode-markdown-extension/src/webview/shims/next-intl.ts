/* next-intl shim for VS Code webview (webpack) */
import messagesEn from '../../../../markdown-core/src/i18n/en.json';
import messagesJa from '../../../../markdown-core/src/i18n/ja.json';

type Messages = Record<string, Record<string, string>>;
const allMessages: Record<string, Messages> = {
  ja: messagesJa as unknown as Messages,
  en: messagesEn as unknown as Messages,
};

let currentLocale = 'ja';

export function setLocale(locale: string): void {
  currentLocale = locale;
}

export function useTranslations(namespace: string) {
  const messages = allMessages[currentLocale] ?? allMessages.ja;
  const ns = (messages as Record<string, unknown>)[namespace] as Record<string, string> | undefined;
  return function t(key: string): string {
    return ns?.[key] ?? key;
  };
}

export function useLocale(): string {
  return currentLocale;
}

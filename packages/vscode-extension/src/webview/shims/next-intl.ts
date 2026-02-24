/* next-intl shim for VS Code webview (webpack) */
import messagesJa from '../../../../editor-core/src/i18n/ja.json';

type Messages = Record<string, Record<string, string>>;
const messages: Messages = messagesJa as unknown as Messages;

export function useTranslations(namespace: string) {
  const ns = (messages as Record<string, unknown>)[namespace] as Record<string, string> | undefined;
  return function t(key: string): string {
    return ns?.[key] ?? key;
  };
}

export function useLocale(): string {
  return 'ja';
}

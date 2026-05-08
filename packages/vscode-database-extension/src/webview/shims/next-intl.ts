/* next-intl shim for VS Code webview (webpack) with parameter substitution */
import dbMessagesEn from '../../../../database-viewer/src/i18n/en.json';
import dbMessagesJa from '../../../../database-viewer/src/i18n/ja.json';
import sheetMessagesEn from '../../../../spreadsheet-viewer/src/i18n/en.json';
import sheetMessagesJa from '../../../../spreadsheet-viewer/src/i18n/ja.json';

type Messages = Record<string, Record<string, string>>;
type Vars = Record<string, string | number>;

const merge = (a: Messages, b: Messages): Messages => ({ ...a, ...b });

const locales: Record<string, Messages> = {
    ja: merge(sheetMessagesJa as unknown as Messages, dbMessagesJa as unknown as Messages),
    en: merge(sheetMessagesEn as unknown as Messages, dbMessagesEn as unknown as Messages),
};

const fallback = 'ja';
let current: string = fallback;

function applyVars(template: string, vars?: Vars): string {
    if (!vars) return template;
    let v = template;
    for (const [k, val] of Object.entries(vars)) {
        v = v.replace(new RegExp(`\\{${k}\\}`, 'g'), String(val));
    }
    return v;
}

export function setLocale(locale: string): void {
    current = locale;
}

export function useLocale(): string {
    return current;
}

export function useTranslations(namespace: string): (key: string, vars?: Vars) => string {
    const active = locales[current];
    const fb = locales[fallback];
    const ns = active?.[namespace] ?? fb?.[namespace];
    return function t(key: string, vars?: Vars): string {
        const template = ns?.[key] ?? fb?.[namespace]?.[key] ?? key;
        return applyVars(template, vars);
    };
}

// next-intl provides NextIntlClientProvider; provide a no-op for compatibility
export const NextIntlClientProvider: React.FC<{ children?: React.ReactNode }> = ({ children }) =>
    children as React.ReactElement;

// for type compat (next-intl types)
import type React from 'react';

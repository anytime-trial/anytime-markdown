import React, { createContext, useContext, useMemo } from "react";

import { enMessages, jaMessages } from "./index";

type Namespace = keyof typeof jaMessages;
type NsMessages = Record<string, string>;

const SUPPORTED_LOCALES = ["ja", "en"] as const;
type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

function resolveLocale(raw: string | undefined): SupportedLocale {
  if (!raw) return "ja";
  const base = raw.split("-")[0];
  return (SUPPORTED_LOCALES as readonly string[]).includes(base)
    ? (base as SupportedLocale)
    : "ja";
}

function detectLocale(): SupportedLocale {
  if (typeof navigator !== "undefined") return resolveLocale(navigator.language);
  return "ja";
}

const messagesByLocale: Record<SupportedLocale, typeof jaMessages> = {
  ja: jaMessages,
  en: enMessages as unknown as typeof jaMessages,
};

/** null = 未設定（自動検出に委ねる） */
const SpreadsheetLocaleContext = createContext<SupportedLocale | null>(null);

interface SpreadsheetI18nProviderProps {
  readonly locale?: string;
  readonly children: React.ReactNode;
}

export function SpreadsheetI18nProvider({ locale, children }: SpreadsheetI18nProviderProps) {
  const parentLocale = useContext(SpreadsheetLocaleContext);
  const resolved = useMemo(
    () => (locale ? resolveLocale(locale) : (parentLocale ?? detectLocale())),
    [locale, parentLocale],
  );
  return (
    <SpreadsheetLocaleContext.Provider value={resolved}>
      {children}
    </SpreadsheetLocaleContext.Provider>
  );
}

export function useSpreadsheetT(namespace: Namespace) {
  const locale = useContext(SpreadsheetLocaleContext) ?? detectLocale();
  const ns: NsMessages = messagesByLocale[locale][namespace] as unknown as NsMessages;
  const fallbackNs: NsMessages = messagesByLocale["ja"][namespace] as unknown as NsMessages;

  return function t(key: string, vars?: Record<string, string | number>): string {
    const template = ns?.[key] ?? fallbackNs?.[key] ?? key;
    if (!vars) return template;
    return Object.entries(vars).reduce(
      (s, [k, v]) => s.replaceAll(`{${k}}`, String(v)),
      template,
    );
  };
}

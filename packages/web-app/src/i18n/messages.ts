import markdownCoreEnMessages from '@anytime-markdown/markdown-viewer/src/i18n/en.json';
import markdownCoreJaMessages from '@anytime-markdown/markdown-viewer/src/i18n/ja.json';

import authErrorEnMessages from '../app/auth/error/i18n/en.json';
import authErrorJaMessages from '../app/auth/error/i18n/ja.json';
import pressEnMessages from '../app/press/i18n/en.json';
import pressJaMessages from '../app/press/i18n/ja.json';
import privacyServicesEnMessages from '../app/privacy/services/i18n/en.json';
import privacyServicesJaMessages from '../app/privacy/services/i18n/ja.json';

/**
 * next-intl のメッセージを構築する単一の真実源。
 *
 * サーバー（`i18n/request.ts` の getRequestConfig）とクライアント（`app/LocaleProvider.tsx` の
 * NextIntlClientProvider）の双方がここを参照する。過去に両者が個別にマージしていたため
 * 名前空間がドリフトし、クライアントで MISSING_MESSAGE が発生した。名前空間を追加するときは
 * 必ずこのファイルだけを編集する。
 */
export const supportedLocales = ['ja', 'en'] as const;
export type Locale = (typeof supportedLocales)[number];
export const defaultLocale: Locale = 'ja';

const mergedJa = {
  ...markdownCoreJaMessages,
  AuthError: authErrorJaMessages,
  press: pressJaMessages,
  PrivacyServices: privacyServicesJaMessages,
};
const mergedEn = {
  ...markdownCoreEnMessages,
  AuthError: authErrorEnMessages,
  press: pressEnMessages,
  PrivacyServices: privacyServicesEnMessages,
};

export const messagesByLocale: Record<Locale, typeof mergedJa> = {
  ja: mergedJa,
  en: mergedEn,
};

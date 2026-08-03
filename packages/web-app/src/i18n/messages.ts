import {
  enMessages as markdownCoreEnMessages,
  jaMessages as markdownCoreJaMessages,
} from '@anytime-markdown/markdown-editor/i18n/messages';
import { ticketsMessagesEn } from '@anytime-markdown/tickets-viewer/i18n/en';
import { ticketsMessagesJa } from '@anytime-markdown/tickets-viewer/i18n/ja';

import authErrorEnMessages from '../app/[locale]/auth/error/i18n/en.json';
import authErrorJaMessages from '../app/[locale]/auth/error/i18n/ja.json';
import editorTopicsEnMessages from '../app/[locale]/markdown/[topic]/i18n/en.json';
import editorTopicsJaMessages from '../app/[locale]/markdown/[topic]/i18n/ja.json';
import editorEnMessages from '../app/[locale]/markdown/i18n/en.json';
import editorJaMessages from '../app/[locale]/markdown/i18n/ja.json';
import pressEnMessages from '../app/[locale]/press/i18n/en.json';
import pressJaMessages from '../app/[locale]/press/i18n/ja.json';
import privacyServicesEnMessages from '../app/[locale]/privacy/services/i18n/en.json';
import privacyServicesJaMessages from '../app/[locale]/privacy/services/i18n/ja.json';
import reportEnMessages from '../app/[locale]/report/i18n/en.json';
import reportJaMessages from '../app/[locale]/report/i18n/ja.json';
import { routing } from './routing';

/**
 * next-intl のメッセージを構築する単一の真実源。
 *
 * サーバー（`i18n/request.ts` の getRequestConfig）とクライアント（`app/LocaleProvider.tsx` の
 * NextIntlClientProvider）の双方がここを参照する。過去に両者が個別にマージしていたため
 * 名前空間がドリフトし、クライアントで MISSING_MESSAGE が発生した。名前空間を追加するときは
 * 必ずこのファイルだけを編集する。
 */
// ロケール一覧と既定ロケールの定義は routing.ts が単一の正。ここでは再エクスポートに留める
// （両方にリテラルを置くとドリフトし、URL 側と messages 側で対応が食い違う）。
export const supportedLocales = routing.locales;
export type Locale = (typeof routing.locales)[number];
export const defaultLocale: Locale = routing.defaultLocale;

const mergedJa = {
  ...markdownCoreJaMessages,
  AuthError: authErrorJaMessages,
  Editor: editorJaMessages,
  EditorTopics: editorTopicsJaMessages,
  press: pressJaMessages,
  PrivacyServices: privacyServicesJaMessages,
  Report: reportJaMessages,
  tickets: ticketsMessagesJa,
};
const mergedEn = {
  ...markdownCoreEnMessages,
  AuthError: authErrorEnMessages,
  Editor: editorEnMessages,
  EditorTopics: editorTopicsEnMessages,
  press: pressEnMessages,
  PrivacyServices: privacyServicesEnMessages,
  Report: reportEnMessages,
  tickets: ticketsMessagesEn,
};

export const messagesByLocale: Record<Locale, typeof mergedJa> = {
  ja: mergedJa,
  en: mergedEn,
};

/* next-intl shim for VS Code webview (webpack alias 先。'next-intl' / 'next-intl/server' の実体をこれに差し替える) */
import { createNextIntlShim } from '@anytime-markdown/vscode-common/webview';
// Why not: バレル（'@anytime-markdown/tickets-viewer'）から import しないこと。
// バレルは TicketsPanel を re-export し、TicketsPanel は 'next-intl' を import する。
// webpack はそれを本ファイルへ alias するため
// バレル → TicketsPanel → next-intl(=本ファイル) → バレル の循環が閉じ、
// バレルの初期化完了前に messages を読みに行って実行時エラーになる
// （production ビルドでは "Cannot access 'sn' before initialization"、
// mode:none では "Cannot read properties of undefined"）。実機で発生した。
// i18n の各モジュールは import を持たない葉であり、サブパス export 経由なら循環しない。
import { ticketsMessagesJa } from '@anytime-markdown/tickets-viewer/i18n/ja';
import { ticketsMessagesEn } from '@anytime-markdown/tickets-viewer/i18n/en';

const shim = createNextIntlShim(
  { ja: { tickets: ticketsMessagesJa }, en: { tickets: ticketsMessagesEn } },
  'en',
);

export const setLocale = shim.setLocale;
export const useLocale = shim.useLocale;
export const useTranslations = shim.useTranslations;

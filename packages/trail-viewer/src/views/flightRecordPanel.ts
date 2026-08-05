/**
 * flightRecordPanel — Flight Record タブ（指示単位の一覧 + フィルタ + CSV + 詳細）。
 *
 * 行の単位は**指示**であってセッションではない。1 つの指示が複数セッションにまたがるため、
 * セッション単位で並べると同じ作業が別々の行へ散る。指示 : セッションの対応は
 * エージェントの明示宣言（MCP record_instruction）が作り、宣言の無いセッションは
 * サーバー側が 1 セッション = 1 指示の暗黙グループとして返す。
 *
 * 設計の要点（要件書 §14.3 / §14.5）:
 *   - store を購読して一覧・詳細を再描画する。フィルタバーは静的 DOM として一度だけ構築し、
 *     再描画で入力中の値を消さない（ラベル文言のみ render() で props.t から毎回更新する —
 *     t の関数識別子は update ごとに変わり得るため識別子比較に依存しない）。
 *   - props.t / props.store は常に最新 props から参照する（mount 時の閉じ込め禁止）。
 *     update() で store が差し替わったら購読を張り替える（serverUrl 変更時の再生成に追従）。
 *   - サーバー不達（loadFailed）は空一覧と別の顔で表示する（障害を「0 件」に見せない）。
 *   - outcome は色 + テキストの冗長表示（色のみで情報を伝えない）。
 *   - 色はテーマトークンから取り、要素側へインラインで置かない（ダーク / ライト両対応）。
 *   - セッション単位の振り返り・訂正（retrospectiveView）は詳細ペインの中に残す。
 *     成否の訂正はセッション単位の記録であり、指示単位へ畳むと出所の優先順位が壊れる。
 */
import { createSelect } from '@anytime-markdown/ui-core';
import { escapeHtml } from '../shared/escapeHtml';
import type { VanillaViewHandle } from '../shared/vanillaIsland';
import type { FlightReviewOutcome, FlightReviewStore } from '../data/flightReviewStore';
import type {
  InstructionDeliverableDto,
  InstructionRecordDto,
  InstructionStore,
  InstructionTokenUsageDto,
} from '../data/instructionStore';
import type { FlightFindingStore } from '../data/flightFindingStore';
import {
  findingCountCell,
  renderFindingSection,
  renderFindingTable,
  wireFindingLinks,
} from './flightReviewFindingsView';
import { MemoryReader } from '../data/readers/MemoryReader';
import type { MemoryBugHistoryRow } from '../data/types';
import { mountBugHistoryPanel } from './memory/bugHistoryPanel';
import { buildFlightRecordCsv, downloadCsv } from '../data/flightReviewCsv';
import { mountDriftSection, type DriftSectionProps } from './memory/driftSection';
import { formatDurationSeconds, mountRetrospectiveView, type RetrospectiveViewProps } from './retrospectiveView';
import type { TrailThemeTokens } from '../theme/designTokens';
import { applyThinScrollbar } from '../theme/thinScrollbar';

export interface FlightRecordPanelProps {
  readonly isDark: boolean;
  readonly tokens: TrailThemeTokens;
  readonly t: (key: string) => string;
  /**
   * memory-core の API 基点。Bug Fixed / Drift サブタブが `MemoryReader` を作るために要る。
   * 空文字なら取りに行かず空状態を出す（押せない画面を出さない）。
   */
  readonly serverUrl: string;
  /** 指示単位の一覧・所属セッション。 */
  readonly store: InstructionStore;
  /** セッション単位の振り返り・訂正（詳細ペイン内）。 */
  readonly reviewStore: FlightReviewStore;
  /** 指示単位へ畳んだレビュー指摘（件数列・詳細の指摘節・Review サブタブ）。 */
  readonly findingStore: FlightFindingStore;
  /**
   * 指摘の対象ファイルを開く。webview の host（VS Code 拡張）だけが実行できるため、
   * 渡されない環境ではファイルパスをテキストとして出す（押せないボタンを出さない）。
   */
  readonly onOpenFile?: (filePath: string) => void;
  /** バグ行から該当セッションの会話を開く。webview の host だけが実行できる。 */
  readonly onOpenSessionMessages?: (sessionId: string) => void;
}

/**
 * Flight Record のサブタブ。指示（運航記録）・Bug Fixed（バグ修正履歴）・Review（指摘）・
 * Drift（会話 / 設計書 / コードの乖離）。
 *
 * Bug Fixed / Drift は 2026-08-05 に Memory から移設した。「どの指示が何を潰したか」「何が
 * ずれたか」はいずれも運航記録の関心であり、指摘（Review）との相互リンクも同一パネル内で閉じる。
 */
export type FlightRecordTabValue = 'instruction' | 'bugfix' | 'review' | 'drift';

const FLIGHT_TAB_VALUES: readonly FlightRecordTabValue[] = ['instruction', 'bugfix', 'review', 'drift'];

const STYLE_ID = 'am-flight-record-style';

const OUTCOME_VALUES: readonly FlightReviewOutcome[] = ['achieved', 'partial', 'unachieved', 'unknown'];

/** 成否フィルタの値。空文字は「すべて」（絞り込みなし）。 */
type OutcomeFilterValue = FlightReviewOutcome | '';

/**
 * スタイルは 1 度だけ注入する。状態色は data-* 属性 + 注入スタイルシートが正本
 * （インラインは注入スタイルを上書きして状態表現を壊す）。
 */
function ensureStyle(doc: Document, tokens: TrailThemeTokens): void {
  const existing = doc.getElementById(STYLE_ID);
  if (existing) existing.remove();
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  const c = tokens.colors;
  style.textContent = `
/* タブパネルの器（trailViewer の getPanelContainer）は overflow:hidden で、シェル側にも
   スクロール領域が無い。パネル自身が内部スクロールを持たないと、はみ出した一覧は
   どこにもスクロールできず切り落とされる。root → body → list/detail の各段に
   min-height:0 を置くのは、flex アイテムの既定 min-height:auto が中身の高さを
   下限にしてしまい、親が縮まらず overflow が発火しないため。 */
[data-am-flight-root] {
  display: flex; flex-direction: column; gap: 12px; padding: 12px; color: ${c.textPrimary};
  flex: 1 1 auto; min-height: 0; box-sizing: border-box; overflow: hidden;
}
/* サブタブ（指示 / Review）。選択は色だけでなく下線と aria-selected でも示す。 */
[data-am-flight-tabs] { display: flex; gap: 4px; border-bottom: 1px solid ${c.border}; }
[data-am-flight-tabs] button {
  padding: 6px 14px; font-size: 13px; cursor: pointer; background: transparent;
  border: none; border-bottom: 2px solid transparent; color: ${c.textSecondary};
}
[data-am-flight-tabs] button[aria-selected="true"] {
  color: ${c.textPrimary}; border-bottom-color: ${c.info}; font-weight: 600;
}
[data-am-flight-review] { flex: 1 1 auto; min-height: 0; overflow-y: auto; }
/* Bug Fixed サブタブ。中身は memory 由来のバグ履歴パネルがそのまま描く。 */
[data-am-flight-bugfix] { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; overflow: hidden; }
/* 詳細ペインの Bug Fixed 節。指示が潰したバグを行で並べ、クリックでタブへ送る。 */
[data-am-bugfix-list] { list-style: none; margin: 0; padding: 0; font-size: 12px; }
[data-am-bugfix-list] li { padding: 2px 0; }
button[data-am-bugfix-row] {
  display: flex; gap: 6px; align-items: baseline; width: 100%; text-align: left; cursor: pointer;
  border: none; background: transparent; color: ${c.textPrimary}; padding: 2px 4px; border-radius: 4px;
  font-size: 12px; font-family: inherit;
}
button[data-am-bugfix-row]:hover { background: ${c.charcoal}; }
[data-am-bugfix-category] {
  flex: 0 0 auto; padding: 1px 6px; border-radius: 4px; font-size: 10px; border: 1px solid ${c.border};
  color: ${c.textSecondary};
}
[data-am-bugfix-category][data-category="regression"] { color: ${c.error}; border-color: ${c.error}; }
[data-am-bugfix-category][data-category="spec"] { color: ${c.info}; border-color: ${c.info}; }
[data-am-bugfix-category][data-category="logic"] { color: ${c.warning}; border-color: ${c.warning}; }
[data-am-bugfix-sha] { flex: 0 0 auto; font-family: ui-monospace, monospace; color: ${c.textSecondary}; }
[data-am-bugfix-summary] { flex: 1 1 auto; min-width: 0; word-break: break-word; }
button[data-am-bugfix-all] {
  margin-top: 6px; padding: 3px 8px; border-radius: 4px; font-size: 11px; cursor: pointer;
  border: 1px solid ${c.border}; background: transparent; color: ${c.textPrimary};
}
/* レビュー指摘。severity は色 + テキストの冗長表現（色のみで情報を伝えない）。 */
[data-am-finding-note] { margin: 0 0 8px; font-size: 11px; color: ${c.textSecondary}; }
[data-am-finding-table] { width: 100%; border-collapse: collapse; font-size: 12px; }
[data-am-finding-table] th, [data-am-finding-table] td {
  text-align: left; padding: 6px 8px; border-bottom: 1px solid ${c.border}; vertical-align: top;
}
[data-am-finding-table] th { color: ${c.textSecondary}; font-weight: 600; white-space: nowrap; }
[data-am-finding-table] tbody tr { cursor: pointer; }
[data-am-finding-table] tbody tr:hover { background: ${c.sectionBg}; }
[data-am-finding-table] td[data-am-finding-text-cell] { white-space: normal; min-width: 240px; max-width: 520px; }
[data-am-finding-list] { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
[data-am-finding-item] { border: 1px solid ${c.border}; border-radius: 4px; padding: 8px; }
[data-am-finding-head] { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
[data-am-finding-text] { margin: 6px 0 0; font-size: 12px; white-space: pre-wrap; }
[data-am-finding-severity] {
  display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 600;
}
[data-am-finding-severity][data-severity="error"] { background: ${c.errorBg}; color: ${c.error}; }
[data-am-finding-severity][data-severity="warn"] { background: ${c.warningBg}; color: ${c.warning}; }
[data-am-finding-severity][data-severity="info"] { background: ${c.infoBg}; color: ${c.info}; }
[data-am-finding-category] { font-size: 11px; color: ${c.textSecondary}; }
[data-am-finding-target] { font-size: 11px; color: ${c.textSecondary}; word-break: break-all; }
[data-am-finding-target][data-unresolved="true"] { font-style: italic; }
button[data-am-finding-open] {
  font-size: 11px; padding: 2px 6px; border-radius: 4px; cursor: pointer; word-break: break-all;
  border: 1px solid ${c.border}; background: ${c.sectionBg}; color: ${c.textPrimary}; text-align: left;
}
[data-am-finding-status] { font-size: 11px; }
[data-am-finding-status][data-addressed="true"] { color: ${c.success}; }
[data-am-finding-status][data-addressed="false"] { color: ${c.textSecondary}; }
[data-am-finding-count] {
  display: inline-block; min-width: 18px; margin-right: 4px; padding: 1px 6px;
  border-radius: 10px; font-size: 11px; font-weight: 600; text-align: center;
}
[data-am-finding-count][data-state="error"] { background: ${c.errorBg}; color: ${c.error}; }
[data-am-finding-count][data-state="warn"] { background: ${c.warningBg}; color: ${c.warning}; }
[data-am-finding-count][data-state="info"] { background: ${c.infoBg}; color: ${c.info}; }
[data-am-finding-count][data-state="none"] { color: ${c.textSecondary}; }
/* 取得できていない状態は 0 件と別の顔にする（レビュー漏れを「指摘なし」と読ませない）。 */
[data-am-finding-count][data-state="unknown"] { color: ${c.textSecondary}; font-style: italic; }
[data-am-finding-empty], [data-am-finding-load-failed] { font-size: 12px; color: ${c.textSecondary}; }
[data-am-flight-toolbar] { display: flex; gap: 8px; align-items: end; flex-wrap: wrap; }
[data-am-flight-toolbar] label { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: ${c.textSecondary}; }
[data-am-flight-toolbar] input {
  padding: 6px 8px; font-size: 13px; background: ${c.sectionBg}; color: ${c.textPrimary};
  border: 1px solid ${c.border}; border-radius: 4px;
}
/* 成否フィルタは ui-core Select（combobox ボタン）で、配色は Select 自身が持つ。
   button セレクタを広く当てると意図が読みにくくなるため、CSV ボタンだけに絞る。 */
[data-am-flight-toolbar] button[data-am-flight-export] {
  padding: 7px 14px; border-radius: 4px; font-size: 13px; cursor: pointer;
  border: 1px solid ${c.border}; background: ${c.sectionBg}; color: ${c.textPrimary};
}
[data-am-flight-body] { display: flex; gap: 16px; align-items: stretch; flex: 1 1 auto; min-height: 0; }
[data-am-flight-list] { flex: 1 1 55%; min-width: 0; min-height: 0; overflow-y: auto; }
[data-am-flight-table] { width: 100%; border-collapse: collapse; font-size: 12px; }
[data-am-flight-table] th, [data-am-flight-table] td {
  text-align: left; padding: 6px 8px; border-bottom: 1px solid ${c.border}; white-space: nowrap;
}
[data-am-flight-table] th { color: ${c.textSecondary}; font-weight: 600; }
[data-am-flight-table] tbody tr { cursor: pointer; }
[data-am-flight-table] tbody tr:hover { background: ${c.sectionBg}; }
[data-am-flight-table] tbody tr[aria-selected="true"] { background: ${c.sectionBg}; outline: 1px solid ${c.border}; }
/* 指示概要の列だけは折り返す。nowrap のままだと 1 行が横に伸び、他の列が画面外へ出る。 */
[data-am-flight-table] td[data-am-summary-cell] {
  white-space: normal; min-width: 220px; max-width: 420px;
}
[data-am-instruction-summary] { display: block; font-weight: 600; }
[data-am-instruction-origin] {
  display: block; margin-top: 2px; font-size: 11px; color: ${c.textSecondary};
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
/* 宣言の無いセッション（暗黙グループ）は概要が空。推測した見出しを人が書いた概要と
   同じ顔で出さないため、専用の淡い表示にする。 */
[data-am-instruction-undeclared] { color: ${c.textSecondary}; font-style: italic; font-weight: 400; }
[data-am-outcome-badge] {
  display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 600;
}
[data-am-outcome-badge][data-outcome="achieved"] { background: ${c.successBg}; color: ${c.success}; }
[data-am-outcome-badge][data-outcome="partial"] { background: ${c.warningBg}; color: ${c.warning}; }
[data-am-outcome-badge][data-outcome="unachieved"] { background: ${c.errorBg}; color: ${c.error}; }
[data-am-outcome-badge][data-outcome="unknown"] { background: ${c.sectionBg}; color: ${c.textSecondary}; }
[data-am-source-badge], [data-am-workspace-badge] {
  display: inline-block; padding: 2px 6px; border-radius: 4px; font-size: 11px;
  border: 1px solid ${c.border}; color: ${c.textSecondary};
}
[data-am-flight-tag] {
  display: inline-block; margin-right: 4px; padding: 1px 6px; border-radius: 8px;
  font-size: 11px; background: ${c.sectionBg}; border: 1px solid ${c.border};
}
[data-am-flight-empty], [data-am-flight-load-failed] { font-size: 13px; padding: 16px; color: ${c.textSecondary}; }
[data-am-flight-load-failed] {
  background: ${c.warningBg}; color: ${c.warning}; border: 1px solid ${c.warning}; border-radius: 6px;
}
[data-am-flight-detail] {
  flex: 1 1 45%; min-width: 280px; background: ${c.sectionBg};
  border: 1px solid ${c.border}; border-radius: 8px; padding: 16px;
  min-height: 0; overflow-y: auto;
}
[data-am-flight-detail] h3 { margin: 0; font-size: 14px; }
[data-am-flight-detail] h4 { margin: 16px 0 6px; font-size: 12px; color: ${c.textSecondary}; }
[data-am-flight-detail] ul { margin: 0; padding-left: 18px; font-size: 12px; }
[data-am-instruction-head] { display: flex; justify-content: space-between; align-items: start; gap: 8px; }
[data-am-instruction-head] button {
  border: 1px solid ${c.border}; background: transparent; color: ${c.textPrimary};
  border-radius: 4px; cursor: pointer; padding: 4px 8px;
}
[data-am-instruction-prompt] {
  margin: 8px 0 0; padding: 8px; font-size: 12px; white-space: pre-wrap; word-break: break-word;
  background: ${c.charcoal}; border: 1px solid ${c.border}; border-radius: 4px;
  max-height: 120px; overflow-y: auto;
}
[data-am-instruction-facts] {
  display: grid; grid-template-columns: auto 1fr; gap: 2px 12px; font-size: 12px; margin: 8px 0 0;
}
[data-am-instruction-facts] dt { color: ${c.textSecondary}; }
[data-am-instruction-facts] dd { margin: 0; }
[data-am-deliverable-list] { list-style: none; margin: 0; padding: 0; font-size: 12px; }
[data-am-deliverable-list] li { display: flex; gap: 6px; align-items: baseline; padding: 2px 0; }
[data-am-deliverable-path] { font-family: ui-monospace, monospace; word-break: break-all; }
[data-am-deliverable-badge] {
  flex: 0 0 auto; padding: 1px 6px; border-radius: 4px; font-size: 10px; border: 1px solid ${c.border};
}
[data-am-deliverable-badge][data-committed="false"] { color: ${c.warning}; border-color: ${c.warning}; }
[data-am-deliverable-badge][data-committed="true"] { color: ${c.textSecondary}; }
[data-am-token-table] { width: 100%; border-collapse: collapse; font-size: 11px; }
[data-am-token-table] th, [data-am-token-table] td {
  text-align: right; padding: 3px 6px; border-bottom: 1px solid ${c.border};
}
[data-am-token-table] th:first-child, [data-am-token-table] td:first-child { text-align: left; }
[data-am-token-table] th { color: ${c.textSecondary}; font-weight: 600; }
[data-am-session-switch] { display: flex; gap: 6px; flex-wrap: wrap; margin: 8px 0 0; }
[data-am-session-switch] button {
  padding: 3px 8px; border-radius: 4px; font-size: 11px; cursor: pointer;
  border: 1px solid ${c.border}; background: transparent; color: ${c.textPrimary};
}
[data-am-session-switch] button[aria-pressed="true"] { background: ${c.sectionBg}; border-color: ${c.textSecondary}; }
[data-am-retro-header] { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
[data-am-retro-header] button { border: 1px solid ${c.border}; background: transparent; color: ${c.textPrimary}; border-radius: 4px; cursor: pointer; padding: 4px 8px; }
[data-am-retro-outcome] { display: flex; gap: 8px; margin-top: 8px; }
[data-am-retro-events] { display: grid; grid-template-columns: auto 1fr; gap: 2px 12px; font-size: 12px; margin: 0; }
[data-am-retro-events] dt { color: ${c.textSecondary}; }
[data-am-retro-events] dd { margin: 0; }
[data-am-retro-empty] { font-size: 12px; color: ${c.textSecondary}; margin: 0; }
[data-am-retro-edit] label { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: ${c.textSecondary}; margin-bottom: 8px; }
[data-am-retro-edit] input, [data-am-retro-edit] textarea {
  padding: 6px 8px; font-size: 13px; background: ${c.charcoal}; color: ${c.textPrimary};
  border: 1px solid ${c.border}; border-radius: 4px; font-family: inherit;
}
[data-am-retro-actions] button {
  padding: 7px 14px; border-radius: 4px; font-size: 13px; cursor: pointer;
  border: 1px solid ${c.border}; background: ${c.sectionBg}; color: ${c.textPrimary};
}
[data-am-retro-feedback] { margin: 8px 0 0; font-size: 12px; padding: 6px 8px; border-radius: 4px; }
[data-am-retro-feedback][data-kind="success"] { background: ${c.successBg}; color: ${c.success}; }
[data-am-retro-feedback][data-kind="error"] { background: ${c.errorBg}; color: ${c.error}; }
[data-am-audit-badge], [data-am-confidence-badge] {
  display: inline-block; padding: 2px 6px; border-radius: 4px; font-size: 11px; border: 1px solid ${c.border};
}
[data-am-audit-badge][data-audit="unaudited"] { color: ${c.textSecondary}; background: ${c.sectionBg}; }
[data-am-audit-badge][data-audit="valid"] { color: ${c.success}; background: ${c.successBg}; border-color: ${c.success}; }
[data-am-audit-badge][data-audit="needs_fix"] { color: ${c.warning}; background: ${c.warningBg}; border-color: ${c.warning}; }
[data-am-audit-badge][data-audit="rejected"] { color: ${c.error}; background: ${c.errorBg}; border-color: ${c.error}; }
[data-am-confidence-badge] { color: ${c.textSecondary}; margin: 0 4px; }
[data-am-rationale-controls] { display: flex; gap: 8px; align-items: end; flex-wrap: wrap; margin-bottom: 8px; }
[data-am-rationale-controls] label { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: ${c.textSecondary}; }
[data-am-rationale-controls] button[data-am-audit-save] {
  padding: 7px 14px; border-radius: 4px; font-size: 13px; cursor: pointer;
  border: 1px solid ${c.border}; background: ${c.sectionBg}; color: ${c.textPrimary};
}
[data-am-rationale-list] { margin: 0; padding-left: 18px; font-size: 12px; }
[data-am-rationale-list] code { font-family: ui-monospace, monospace; font-size: 11px; }
`;
  doc.head.appendChild(style);
}

function formatDateTime(iso: string | null): string {
  if (iso === null || iso === '') return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

/** `<input type="date">` の値（YYYY-MM-DD・ローカル日付）を UTC ISO へ。不正・空は undefined。 */
function dateInputToIso(value: string, endOfDay: boolean): string | undefined {
  if (value === '') return undefined;
  const date = new Date(endOfDay ? `${value}T23:59:59.999` : `${value}T00:00:00.000`);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString();
}

/** 大きな桁を読みやすくする（キャッシュ読取は億の桁になる）。 */
function formatCount(value: number): string {
  return new Intl.NumberFormat().format(value);
}

function formatUsd(value: number): string {
  return `$${value.toFixed(2)}`;
}

/** 一覧の成果物列は件数だけを出す（パスの列挙は詳細ペインが担う）。 */
function deliverableCounts(deliverables: readonly InstructionDeliverableDto[]): { docs: number; code: number } {
  let docs = 0;
  let code = 0;
  for (const d of deliverables) {
    if (d.kind === 'doc') docs += 1;
    else code += 1;
  }
  return { docs, code };
}

/** トークンの総量。input / output / cache を合算した「動かした量」を 1 列で示す。 */
function totalTokens(usage: InstructionTokenUsageDto): number {
  return usage.inputTokens + usage.outputTokens + usage.cacheReadTokens + usage.cacheCreationTokens;
}

export function mountFlightRecordPanel(
  container: HTMLElement,
  initialProps: FlightRecordPanelProps,
): VanillaViewHandle<FlightRecordPanelProps> {
  let props = initialProps;
  let destroyed = false;
  let detailHandle: VanillaViewHandle<RetrospectiveViewProps> | null = null;
  let detailSessionId: string | null = null;

  // ── Bug Fixed サブタブの状態 ──
  // reader は serverUrl ごとに作り直す（接続先が変わったら前の接続の結果を混ぜない）。
  let bugReader: MemoryReader | null = props.serverUrl === '' ? null : new MemoryReader(props.serverUrl);
  let bugPanelHandle: VanillaViewHandle<Parameters<typeof mountBugHistoryPanel>[1]> | null = null;
  /** 一覧を特定のバグ集合へ絞る（詳細ペイン・「同じ原因の過去バグ」からの遷移）。 */
  let pendingBugFilter: { bugEntityIds: readonly string[] } | null = null;
  /** Review サブタブを特定の指摘へ絞る（バグ行の「事前指摘」からの遷移）。 */
  let pendingFindingFilter: { findingEntityIds: readonly string[] } | null = null;

  // ── 詳細ペインの Bug Fixed 節（選択中の指示が潰したバグ） ──
  /** 取得済みの行。null は「まだ引いていない」で、空配列（0 件）とは別の状態。 */
  let detailBugs: readonly MemoryBugHistoryRow[] | null = null;
  let detailBugsFailed = false;
  /** 取得済みの対象キー。同じキーでは引き直さない（描画のたびの再取得を止める）。 */
  let detailBugsKey: string | null = null;

  ensureStyle(container.ownerDocument, props.tokens);

  const root = document.createElement('div');
  root.dataset['amFlightRoot'] = '';
  container.appendChild(root);

  // ── サブタブ（指示 / Review）。静的 DOM で作り、文言だけ render() で更新する ──
  let activeTab: FlightRecordTabValue = 'instruction';
  const tablist = document.createElement('div');
  tablist.dataset['amFlightTabs'] = '';
  tablist.setAttribute('role', 'tablist');
  tablist.innerHTML = FLIGHT_TAB_VALUES.map(
    (value) => `<button type="button" role="tab" id="flight-tab-${value}"
      aria-controls="flight-panel-${value}" data-am-flight-tab="${value}" aria-selected="false"></button>`,
  ).join('');
  root.appendChild(tablist);
  for (const button of tablist.querySelectorAll<HTMLButtonElement>('[data-am-flight-tab]')) {
    button.addEventListener('click', () => {
      const next = button.dataset['amFlightTab'] as FlightRecordTabValue | undefined;
      if (!next || next === activeTab) return;
      activeTab = next;
      // Review タブを開いた時点でまだ取れていなければ取りに行く（開くまで引かない）
      if (next === 'review') void props.findingStore.refresh();
      // 手で切り替えたときは前の遷移で置いた絞り込みを解く（絞られた理由が画面に無いため）
      if (next === 'bugfix') pendingBugFilter = null;
      if (next === 'review') pendingFindingFilter = null;
      render();
    });
  }

  // ── フィルタバー（静的 DOM。値・リスナーは維持し、文言のみ render() で更新） ──
  const toolbar = document.createElement('div');
  toolbar.dataset['amFlightToolbar'] = '';
  toolbar.innerHTML = `
    <label><span data-am-flight-label="filter.outcome"></span>
      <span data-am-flight-filter-outcome></span>
    </label>
    <label><span data-am-flight-label="filter.since"></span>
      <input type="date" data-am-flight-filter-since />
    </label>
    <label><span data-am-flight-label="filter.until"></span>
      <input type="date" data-am-flight-filter-until />
    </label>
    <label><span data-am-flight-label="filter.tag"></span>
      <input type="text" data-am-flight-filter-tag />
    </label>
    <button type="button" data-am-flight-export></button>
  `;
  root.appendChild(toolbar);

  const body = document.createElement('div');
  body.dataset['amFlightBody'] = '';
  const listRegion = document.createElement('div');
  listRegion.dataset['amFlightList'] = '';
  const detailRegion = document.createElement('div');
  detailRegion.dataset['amFlightDetail'] = '';
  detailRegion.hidden = true;
  // 一覧・詳細はそれぞれ独立にスクロールする。スクロールバーの意匠はテーマ変数追従の
  // 共有スタイルへ寄せる（ダーク／ライトのどちらでも同じ経路で色が決まる）。
  applyThinScrollbar(listRegion);
  applyThinScrollbar(detailRegion);
  body.appendChild(listRegion);
  body.appendChild(detailRegion);
  body.id = 'flight-panel-instruction';
  body.setAttribute('role', 'tabpanel');
  body.setAttribute('aria-labelledby', 'flight-tab-instruction');
  root.appendChild(body);

  // Review サブタブ（全指示横断の指摘一覧）。指示タブとは別の器で、切替は hidden で行う。
  const reviewRegion = document.createElement('div');
  reviewRegion.dataset['amFlightReview'] = '';
  reviewRegion.id = 'flight-panel-review';
  reviewRegion.setAttribute('role', 'tabpanel');
  reviewRegion.setAttribute('aria-labelledby', 'flight-tab-review');
  reviewRegion.hidden = true;
  applyThinScrollbar(reviewRegion);
  root.appendChild(reviewRegion);

  // Bug Fixed サブタブ（バグ修正履歴）。中身は memory 由来のパネルを再利用し、
  // 初回に開いた時だけマウントする（開かないタブのために memory-core を叩かない）。
  const bugfixRegion = document.createElement('div');
  bugfixRegion.dataset['amFlightBugfix'] = '';
  bugfixRegion.id = 'flight-panel-bugfix';
  bugfixRegion.setAttribute('role', 'tabpanel');
  bugfixRegion.setAttribute('aria-labelledby', 'flight-tab-bugfix');
  bugfixRegion.hidden = true;
  root.appendChild(bugfixRegion);

  // Drift サブタブ。こちらも開くまでマウントしない。一度マウントしたら破棄せず hidden で
  // 切り替える（フィルタ・スクロール位置を保持する）。
  const driftRegion = document.createElement('div');
  driftRegion.dataset['amFlightDrift'] = '';
  driftRegion.id = 'flight-panel-drift';
  driftRegion.setAttribute('role', 'tabpanel');
  driftRegion.setAttribute('aria-labelledby', 'flight-tab-drift');
  driftRegion.hidden = true;
  driftRegion.style.cssText = 'flex:1;min-height:0;display:flex;flex-direction:column;overflow:hidden;';
  root.appendChild(driftRegion);

  let driftHandle: VanillaViewHandle<DriftSectionProps> | null = null;

  function driftSectionProps(): DriftSectionProps {
    return { serverUrl: props.serverUrl, t: props.t, isDark: props.isDark };
  }

  /** Drift タブが可視になった時点で初回マウントし、以降は最新 props を流す。 */
  function renderDriftTab(): void {
    if (driftHandle === null) {
      driftHandle = mountDriftSection(driftRegion, driftSectionProps());
      return;
    }
    driftHandle.update(driftSectionProps());
  }

  const sinceInput = toolbar.querySelector<HTMLInputElement>('[data-am-flight-filter-since]');
  const untilInput = toolbar.querySelector<HTMLInputElement>('[data-am-flight-filter-until]');
  const tagInput = toolbar.querySelector<HTMLInputElement>('[data-am-flight-filter-tag]');

  // 成否フィルタの選択値はここで保持する（生の `<select>` の value を正本にしない）。
  let outcomeFilter: OutcomeFilterValue = '';

  function outcomeOptions(): ReadonlyArray<{ value: OutcomeFilterValue; label: string }> {
    const { t } = props;
    return [
      { value: '', label: t('flightRecord.filter.outcomeAll') },
      ...OUTCOME_VALUES.map((o) => ({ value: o as OutcomeFilterValue, label: t(`flightRecord.outcome.${o}`) })),
    ];
  }

  /**
   * 生の `<select>` を使わないのは、ネイティブの popup が OS 既定の背景色で描かれ、
   * ダークテーマでは白地に白文字になって選択肢が読めないため。
   * createSelect は button + ポータル listbox で、配色は `--am-color-*` に追従する。
   */
  const outcomeSelect = createSelect<OutcomeFilterValue>({
    value: outcomeFilter,
    options: outcomeOptions(),
    ariaLabel: props.t('flightRecord.filter.outcome'),
    fullWidth: false,
    minWidth: 132,
    onChange: (value) => {
      outcomeFilter = value;
      applyFilter();
    },
  });
  let outcomeLabelsKey = outcomeOptions()
    .map((o) => o.label)
    .join(' ');
  toolbar.querySelector<HTMLElement>('[data-am-flight-filter-outcome]')?.appendChild(outcomeSelect.el);

  /** ラベル・option・aria-label を最新の props.t で更新する（入力値・リスナーは維持）。 */
  function updateToolbarLabels(): void {
    const { t } = props;
    for (const span of toolbar.querySelectorAll<HTMLElement>('[data-am-flight-label]')) {
      span.textContent = t(`flightRecord.${span.dataset['amFlightLabel'] ?? ''}`);
    }
    // 文言が変わったときだけ差し替える。render() は store の通知（ポーリング）ごとに走るため、
    // 無条件に update すると開いている listbox が閉じて開き直される。
    const options = outcomeOptions();
    const labelsKey = options.map((o) => o.label).join(' ');
    if (labelsKey !== outcomeLabelsKey) {
      outcomeLabelsKey = labelsKey;
      outcomeSelect.update({ options, ariaLabel: t('flightRecord.filter.outcome') });
    }
    sinceInput?.setAttribute('aria-label', t('flightRecord.filter.since'));
    untilInput?.setAttribute('aria-label', t('flightRecord.filter.until'));
    tagInput?.setAttribute('aria-label', t('flightRecord.filter.tag'));
    const exportButton = toolbar.querySelector<HTMLButtonElement>('[data-am-flight-export]');
    if (exportButton) exportButton.textContent = t('flightRecord.exportCsv');
  }

  function applyFilter(): void {
    const outcome = outcomeFilter;
    const tag = (tagInput?.value ?? '').trim();
    props.store.setFilter({
      ...(outcome === '' ? {} : { outcome }),
      since: dateInputToIso(sinceInput?.value ?? '', false),
      until: dateInputToIso(untilInput?.value ?? '', true),
      ...(tag === '' ? {} : { tag }),
    });
  }

  sinceInput?.addEventListener('change', applyFilter);
  untilInput?.addEventListener('change', applyFilter);
  tagInput?.addEventListener('change', applyFilter);
  toolbar.querySelector<HTMLButtonElement>('[data-am-flight-export]')?.addEventListener('click', () => {
    const instructions = props.store.getState().instructions;
    const stamp = new Date().toISOString().slice(0, 10);
    downloadCsv(
      container.ownerDocument,
      `flight-records-${stamp}.csv`,
      buildFlightRecordCsv(instructions, props.findingStore.getState().counts),
    );
  });

  function selectRow(instructionId: string): void {
    void props.store.select(instructionId);
  }

  /** 概要が空（宣言の無いセッション）なら、推測せず「未宣言」と明示する。 */
  function summaryCell(record: InstructionRecordDto): string {
    const { t } = props;
    if (record.summary === '') {
      return `<span data-am-instruction-summary data-am-instruction-undeclared>${escapeHtml(t('flightRecord.undeclared'))}</span>
              <span data-am-instruction-origin>${escapeHtml(record.instructionId.slice(0, 8))}</span>`;
    }
    return `<span data-am-instruction-summary>${escapeHtml(record.summary)}</span>
            ${record.originPrompt === '' ? '' : `<span data-am-instruction-origin>${escapeHtml(record.originPrompt)}</span>`}`;
  }

  function renderList(): void {
    const { t } = props;
    const state = props.store.getState();
    if (state.loadFailed) {
      listRegion.innerHTML = `<p data-am-flight-load-failed role="status">${escapeHtml(t('flightRecord.loadFailed'))}</p>`;
      return;
    }
    if (state.instructions.length === 0) {
      listRegion.innerHTML = `<p data-am-flight-empty>${escapeHtml(t('flightRecord.empty'))}</p>`;
      return;
    }
    const rows = state.instructions
      .map((r) => {
        const selected = r.instructionId === state.selectedInstructionId;
        const tags = r.tags.map((tag) => `<span data-am-flight-tag>${escapeHtml(tag)}</span>`).join('');
        const counts = deliverableCounts(r.deliverables);
        // 未取込（session_costs にまだ行が無い）を 0 と書かない
        const tokens = r.tokenUsage.imported ? formatCount(totalTokens(r.tokenUsage)) : t('flightRecord.notImported');
        const cost = r.tokenUsage.imported ? formatUsd(r.tokenUsage.estimatedCostUsd) : '';
        const deliverableLabel = t('flightRecord.deliverableCounts')
          .replace('{docs}', String(counts.docs))
          .replace('{code}', String(counts.code));
        return `
        <tr data-instruction-id="${escapeHtml(r.instructionId)}" tabindex="0" aria-selected="${selected}">
          <td data-am-summary-cell>${summaryCell(r)}</td>
          <td><span data-am-workspace-badge>${escapeHtml(r.workspaceName)}</span></td>
          <td>${escapeHtml(formatDateTime(r.endedAt))}</td>
          <td>${escapeHtml(formatDurationSeconds(r.durationSeconds))}</td>
          <td><span data-am-outcome-badge data-outcome="${r.outcome}">${escapeHtml(t(`flightRecord.outcome.${r.outcome}`))}</span></td>
          <td><span data-am-source-badge data-source="${r.outcomeSource}">${escapeHtml(t(`flightRecord.source.${r.outcomeSource}`))}</span></td>
          <td>${r.sessionCount}</td>
          <td>${escapeHtml(deliverableLabel)}</td>
          <td>${escapeHtml(tokens)}</td>
          <td>${escapeHtml(cost)}</td>
          <td>${r.reworkCount}</td>
          <td>${r.toolFailureCount}</td>
          <td data-am-finding-count-cell>${findingCountCell(
            t,
            props.findingStore.countsFor(r.instructionId),
            props.findingStore.getState().loadFailed,
          )}</td>
          <td>${tags}</td>
        </tr>`;
      })
      .join('');
    listRegion.innerHTML = `
      <table data-am-flight-table aria-label="${escapeHtml(t('viewer.tab.flightRecord'))}">
        <thead>
          <tr>
            <th>${escapeHtml(t('flightRecord.column.instruction'))}</th>
            <th>${escapeHtml(t('flightRecord.column.workspace'))}</th>
            <th>${escapeHtml(t('flightRecord.column.endedAt'))}</th>
            <th>${escapeHtml(t('flightRecord.column.duration'))}</th>
            <th>${escapeHtml(t('flightRecord.column.outcome'))}</th>
            <th>${escapeHtml(t('flightRecord.column.source'))}</th>
            <th>${escapeHtml(t('flightRecord.column.sessions'))}</th>
            <th>${escapeHtml(t('flightRecord.column.deliverables'))}</th>
            <th>${escapeHtml(t('flightRecord.column.tokens'))}</th>
            <th>${escapeHtml(t('flightRecord.column.cost'))}</th>
            <th>${escapeHtml(t('flightRecord.column.rework'))}</th>
            <th>${escapeHtml(t('flightRecord.column.toolFailures'))}</th>
            <th>${escapeHtml(t('flightRecord.column.findings'))}</th>
            <th>${escapeHtml(t('flightRecord.column.tags'))}</th>
          </tr>
        </thead>
        <tbody></tbody>
      </table>`;
    const tbody = listRegion.querySelector('tbody');
    if (tbody) tbody.innerHTML = rows;
    for (const tr of listRegion.querySelectorAll<HTMLTableRowElement>('tbody tr')) {
      const instructionId = tr.dataset['instructionId'] ?? '';
      tr.addEventListener('click', () => selectRow(instructionId));
      tr.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') {
          ev.preventDefault();
          selectRow(instructionId);
        }
      });
    }
  }

  function renderDeliverables(record: InstructionRecordDto): string {
    const { t } = props;
    if (record.deliverables.length === 0) {
      return `<p data-am-retro-empty>${escapeHtml(t('flightRecord.detail.none'))}</p>`;
    }
    // ドキュメントを先に出す（未コミットを含み、作業の成果として最初に見たいのはこちら）
    const ordered = [...record.deliverables].sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'doc' ? -1 : 1;
      return a.filePath < b.filePath ? -1 : 1;
    });
    const items = ordered
      .map((d) => {
        const badge = d.committed ? d.commitHash : t('flightRecord.detail.uncommitted');
        return `<li>
          <span data-am-deliverable-badge data-committed="${d.committed}">${escapeHtml(badge)}</span>
          <span data-am-deliverable-path>${escapeHtml(d.filePath)}</span>
        </li>`;
      })
      .join('');
    return `<ul data-am-deliverable-list>${items}</ul>`;
  }

  /**
   * 選択中の指示に属するセッション ID。
   *
   * 宣言の無いセッションは暗黙グループで `/sessions` が空を返すため、指示 ID 自身を
   * セッションとして扱う（instructionStore.select と同じ規則）。
   */
  function selectedSessionIds(): readonly string[] {
    const state = props.store.getState();
    if (state.selectedSessions.length > 0) return state.selectedSessions.map((s) => s.sessionId);
    return state.selectedInstructionId === null ? [] : [state.selectedInstructionId];
  }

  /**
   * 詳細ペイン用のバグ履歴を取りに行く。
   *
   * 絞り込みはサーバ側で行う（クライアントで最新 N 件から選ぶと、上限に入らない
   * 古い指示のバグが「0 件」に化けて、無いのか出ていないのか区別できなくなる）。
   */
  function ensureDetailBugs(): void {
    const sessionIds = selectedSessionIds();
    const key = sessionIds.join(',');
    if (key === detailBugsKey) return;
    detailBugsKey = key;
    detailBugs = null;
    detailBugsFailed = false;
    const reader = bugReader;
    if (reader === null || sessionIds.length === 0) {
      detailBugs = [];
      return;
    }
    void reader
      .getBugHistoryStrict({ sessionIds })
      .then((rows) => {
        if (destroyed || detailBugsKey !== key) return;
        detailBugs = rows;
        render();
      })
      .catch((err: unknown) => {
        if (destroyed || detailBugsKey !== key) return;
        // サーバ不達を「バグ 0 件」に見せない（障害と実績を区別する）
        console.warn(`[flightRecord] failed to load bug history for ${key}: ${String(err)}`);
        detailBugsFailed = true;
        render();
      });
  }

  /** 詳細ペインの Bug Fixed 節。この指示が潰したバグを行で並べる。 */
  function renderBugFixedSection(): string {
    const { t } = props;
    if (detailBugsFailed) {
      return `<p data-am-finding-load-failed>${escapeHtml(t('flightRecord.loadFailed'))}</p>`;
    }
    if (detailBugs === null) {
      return `<p data-am-retro-empty>${escapeHtml(t('flightRecord.loading'))}</p>`;
    }
    if (detailBugs.length === 0) {
      return `<p data-am-retro-empty>${escapeHtml(t('flightRecord.detail.none'))}</p>`;
    }
    const items = detailBugs
      .map(
        (b) => `<li>
          <button type="button" data-am-bugfix-row data-bug-entity-id="${escapeHtml(b.bugEntityId)}">
            <span data-am-bugfix-category data-category="${escapeHtml(b.category)}">${escapeHtml(b.category)}</span>
            <span data-am-bugfix-sha>${escapeHtml(b.commitSha.slice(0, 7))}</span>
            <span data-am-bugfix-summary>${escapeHtml(b.subjectSummary)}</span>
          </button>
        </li>`,
      )
      .join('');
    return `<ul data-am-bugfix-list>${items}</ul>
      <button type="button" data-am-bugfix-all>${escapeHtml(t('flightRecord.detail.bugFixedAll'))}</button>`;
  }

  function renderTokenUsage(usage: InstructionTokenUsageDto): string {
    const { t } = props;
    if (!usage.imported) {
      return `<p data-am-retro-empty>${escapeHtml(t('flightRecord.notImported'))}</p>`;
    }
    const rows = usage.byModel
      .map(
        (m) => `<tr>
          <td>${escapeHtml(m.model)}</td>
          <td>${escapeHtml(formatCount(m.inputTokens))}</td>
          <td>${escapeHtml(formatCount(m.outputTokens))}</td>
          <td>${escapeHtml(formatCount(m.cacheReadTokens))}</td>
          <td>${escapeHtml(formatCount(m.cacheCreationTokens))}</td>
          <td>${escapeHtml(formatUsd(m.estimatedCostUsd))}</td>
        </tr>`,
      )
      .join('');
    return `<table data-am-token-table>
      <thead><tr>
        <th>${escapeHtml(t('flightRecord.token.model'))}</th>
        <th>${escapeHtml(t('flightRecord.token.input'))}</th>
        <th>${escapeHtml(t('flightRecord.token.output'))}</th>
        <th>${escapeHtml(t('flightRecord.token.cacheRead'))}</th>
        <th>${escapeHtml(t('flightRecord.token.cacheCreation'))}</th>
        <th>${escapeHtml(t('flightRecord.token.cost'))}</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
  }

  /** 指示の要約ブロック（詳細ペインの上段。所属セッションの切替もここに置く）。 */
  function renderInstructionHeader(record: InstructionRecordDto): string {
    const { t } = props;
    const state = props.store.getState();
    const sessions = state.selectedSessions;
    const title = record.summary === '' ? t('flightRecord.undeclared') : record.summary;
    const switchButtons =
      sessions.length <= 1
        ? ''
        : `<div data-am-session-switch role="group" aria-label="${escapeHtml(t('flightRecord.detail.sessions'))}">
            ${sessions
              .map(
                (s) => `<button type="button" data-am-session-pick="${escapeHtml(s.sessionId)}"
                  aria-pressed="${s.sessionId === state.selectedSessionId}">${escapeHtml(String(s.sequence))}. ${escapeHtml(s.sessionId.slice(0, 8))}</button>`,
              )
              .join('')}
          </div>`;
    return `
      <div data-am-instruction-head>
        <h3>${escapeHtml(title)}</h3>
        <button type="button" data-am-instruction-close>${escapeHtml(t('flightRecord.detail.close'))}</button>
      </div>
      ${record.originPrompt === '' ? '' : `<p data-am-instruction-prompt>${escapeHtml(record.originPrompt)}</p>`}
      <dl data-am-instruction-facts>
        <dt>${escapeHtml(t('flightRecord.column.workspace'))}</dt><dd>${escapeHtml(record.workspaceName)}</dd>
        <dt>${escapeHtml(t('flightRecord.detail.startedAt'))}</dt><dd>${escapeHtml(formatDateTime(record.startedAt))}</dd>
        <dt>${escapeHtml(t('flightRecord.column.endedAt'))}</dt><dd>${escapeHtml(formatDateTime(record.endedAt))}</dd>
        <dt>${escapeHtml(t('flightRecord.column.duration'))}</dt><dd>${escapeHtml(formatDurationSeconds(record.durationSeconds))}</dd>
        <dt>${escapeHtml(t('flightRecord.column.sessions'))}</dt><dd>${record.sessionCount}</dd>
      </dl>
      <h4>${escapeHtml(t('flightRecord.detail.deliverables'))}</h4>
      ${renderDeliverables(record)}
      <h4>${escapeHtml(t('flightRecord.detail.bugFixed'))}</h4>
      ${renderBugFixedSection()}
      <h4>${escapeHtml(t('flightRecord.detail.tokenUsage'))}</h4>
      ${renderTokenUsage(record.tokenUsage)}
      <h4>${escapeHtml(t('flightRecord.findings.title'))}</h4>
      ${renderFindingSection({
        t,
        findings: props.findingStore.findingsFor(record.instructionId),
        loadFailed: props.findingStore.getState().loadFailed,
        linkable: props.onOpenFile !== undefined,
      })}
      <h4>${escapeHtml(t('flightRecord.detail.sessions'))}</h4>
      ${switchButtons}
    `;
  }

  /** 指示 ID → 一覧に出す名前。宣言が無ければ ID 先頭 8 桁（推測した見出しを作らない）。 */
  function instructionLabel(instructionId: string): string {
    const record = props.store
      .getState()
      .instructions.find((r) => r.instructionId === instructionId);
    if (record === undefined) return instructionId.slice(0, 8);
    return record.summary === '' ? instructionId.slice(0, 8) : record.summary;
  }

  /** Bug Fixed サブタブへ、指定のバグだけを出した状態で移る。 */
  function openBugFixed(bugEntityIds: readonly string[]): void {
    pendingBugFilter = { bugEntityIds };
    activeTab = 'bugfix';
    render();
  }

  /** Review サブタブへ、指定の指摘だけを出した状態で移る（バグ行の「事前指摘」）。 */
  function openPrecedingFindings(findingEntityIds: readonly string[]): void {
    pendingFindingFilter = { findingEntityIds };
    activeTab = 'review';
    void props.findingStore.refresh();
    render();
  }

  function bugPanelProps(): Parameters<typeof mountBugHistoryPanel>[1] {
    return {
      t: props.t,
      reader: bugReader,
      onOpenSessionMessages: props.onOpenSessionMessages,
      onOpenPrecedingReviews: openPrecedingFindings,
      onOpenSiblingBugs: openBugFixed,
      pendingBugFilter,
    };
  }

  /** Bug Fixed サブタブ。初回に開いた時だけマウントし、以降は update で更新する。 */
  function renderBugfixTab(): void {
    if (bugPanelHandle === null) {
      bugPanelHandle = mountBugHistoryPanel(bugfixRegion, bugPanelProps());
      return;
    }
    bugPanelHandle.update(bugPanelProps());
  }

  /** Review サブタブ。全指示の指摘をフラットに出し、行から指示を選び直せるようにする。 */
  function renderReviewTab(): void {
    const { t } = props;
    const state = props.findingStore.getState();
    // バグ行から来たときは、その `precedes` が指す指摘だけに絞る。
    const pendingIds = pendingFindingFilter?.findingEntityIds ?? null;
    const findings = pendingIds === null
      ? state.findings
      : state.findings.filter((f) => pendingIds.includes(f.findingEntityId));
    reviewRegion.innerHTML = renderFindingTable({
      t,
      findings,
      loadFailed: state.loadFailed,
      linkable: props.onOpenFile !== undefined,
      labelOf: instructionLabel,
    });
    const onOpenFile = props.onOpenFile;
    if (onOpenFile) wireFindingLinks(reviewRegion, onOpenFile);
    for (const tr of reviewRegion.querySelectorAll<HTMLTableRowElement>('[data-am-finding-row]')) {
      tr.addEventListener('click', () => {
        const instructionId = tr.dataset['instructionId'] ?? '';
        if (instructionId === '') return;
        activeTab = 'instruction';
        selectRow(instructionId);
        render();
      });
    }
  }

  function renderDetail(): void {
    const state = props.store.getState();
    const selected =
      state.instructions.find((r) => r.instructionId === state.selectedInstructionId) ?? null;
    if (selected === null) {
      detailHandle?.destroy();
      detailHandle = null;
      detailSessionId = null;
      detailRegion.hidden = true;
      detailRegion.innerHTML = '';
      return;
    }
    detailRegion.hidden = false;
    // 選択が変わっていれば、この指示のバグ履歴を取り直す（同じ対象では引き直さない）
    ensureDetailBugs();

    // 上段（指示の要約）は毎回描き直し、下段（セッション単位の振り返り）は別の器へ
    // マウントして生かす。1 つの innerHTML で両方描くと、retrospectiveView の
    // 入力中フォームが再描画のたびに消える。
    let headerEl = detailRegion.querySelector<HTMLElement>('[data-am-instruction-header]');
    let retroEl = detailRegion.querySelector<HTMLElement>('[data-am-instruction-retro]');
    if (headerEl === null || retroEl === null) {
      detailRegion.innerHTML = '<div data-am-instruction-header></div><div data-am-instruction-retro></div>';
      headerEl = detailRegion.querySelector<HTMLElement>('[data-am-instruction-header]');
      retroEl = detailRegion.querySelector<HTMLElement>('[data-am-instruction-retro]');
      detailHandle = null;
      detailSessionId = null;
    }
    if (headerEl === null || retroEl === null) return;

    headerEl.innerHTML = renderInstructionHeader(selected);
    const onOpenFile = props.onOpenFile;
    if (onOpenFile) wireFindingLinks(headerEl, onOpenFile);
    headerEl.querySelector<HTMLButtonElement>('[data-am-instruction-close]')?.addEventListener('click', () => {
      void props.store.select(null);
    });
    for (const button of headerEl.querySelectorAll<HTMLButtonElement>('[data-am-session-pick]')) {
      button.addEventListener('click', () => {
        props.store.selectSession(button.dataset['amSessionPick'] ?? null);
      });
    }
    for (const button of headerEl.querySelectorAll<HTMLButtonElement>('[data-am-bugfix-row]')) {
      button.addEventListener('click', () => {
        const bugEntityId = button.dataset['bugEntityId'] ?? '';
        if (bugEntityId === '') return;
        openBugFixed([bugEntityId]);
      });
    }
    headerEl.querySelector<HTMLButtonElement>('[data-am-bugfix-all]')?.addEventListener('click', () => {
      openBugFixed((detailBugs ?? []).map((b) => b.bugEntityId));
    });

    renderSessionRetrospective(retroEl);
  }

  /** 選択セッションの振り返り・訂正。セッション単位の記録なので reviewStore が正本。 */
  function renderSessionRetrospective(host: HTMLElement): void {
    const sessionId = props.store.getState().selectedSessionId;
    if (sessionId === null) {
      detailHandle?.destroy();
      detailHandle = null;
      detailSessionId = null;
      host.innerHTML = '';
      return;
    }
    if (props.reviewStore.getState().selectedSessionId !== sessionId) {
      void props.reviewStore.select(sessionId);
    }
    const reviewState = props.reviewStore.getState();
    const review = reviewState.selectedReview;
    if (review === null) {
      // 取得前・記録なしはフォームを出さない（空のフォームを訂正対象に見せない）
      detailHandle?.destroy();
      detailHandle = null;
      detailSessionId = null;
      host.innerHTML = '';
      return;
    }
    const detailProps: RetrospectiveViewProps = {
      tokens: props.tokens,
      t: props.t,
      review,
      feedback: reviewState.selectedFeedback,
      rationale: reviewState.selectedRationale,
      saving: reviewState.saving,
      onSave: (patch) => props.reviewStore.saveManual(review.sessionId, patch),
      onEditingChange: (editing) => props.reviewStore.setEditing(editing),
      onClose: () => props.store.selectSession(null),
    };
    if (detailHandle === null || detailSessionId !== review.sessionId) {
      detailHandle?.destroy();
      host.innerHTML = '';
      detailHandle = mountRetrospectiveView(host, detailProps);
      detailSessionId = review.sessionId;
      return;
    }
    detailHandle.update(detailProps);
  }

  /** サブタブのラベルと選択状態、表示中の器を最新化する。 */
  function renderTabs(): void {
    const { t } = props;
    for (const button of tablist.querySelectorAll<HTMLButtonElement>('[data-am-flight-tab]')) {
      const value = button.dataset['amFlightTab'] as FlightRecordTabValue | undefined;
      if (!value) continue;
      button.textContent = t(`flightRecord.tab.${value}`);
      button.setAttribute('aria-selected', String(value === activeTab));
    }
    toolbar.hidden = activeTab !== 'instruction';
    body.hidden = activeTab !== 'instruction';
    reviewRegion.hidden = activeTab !== 'review';
    bugfixRegion.hidden = activeTab !== 'bugfix';
    driftRegion.hidden = activeTab !== 'drift';
  }

  function render(): void {
    if (destroyed) return;
    updateToolbarLabels();
    renderTabs();
    if (activeTab === 'instruction') {
      renderList();
      renderDetail();
    } else if (activeTab === 'bugfix') {
      renderBugfixTab();
    } else if (activeTab === 'review') {
      renderReviewTab();
    } else {
      renderDriftTab();
    }
    // マウント済みなら非表示中も props（テーマ・言語）を流す。再表示時に古い文言で出さない。
    if (activeTab !== 'drift' && driftHandle !== null) {
      driftHandle.update(driftSectionProps());
    }
  }

  let unsubscribe = props.store.subscribe(render);
  let unsubscribeReview = props.reviewStore.subscribe(render);
  let unsubscribeFinding = props.findingStore.subscribe(render);
  render();
  void props.store.refresh();
  // 件数列は指示タブの一覧に出るため、Review タブを開く前から必要になる
  void props.findingStore.refresh();

  return {
    update(next) {
      const prevStore = props.store;
      const prevReviewStore = props.reviewStore;
      const prevFindingStore = props.findingStore;
      const prevServerUrl = props.serverUrl;
      props = next;
      ensureStyle(container.ownerDocument, next.tokens);
      if (next.serverUrl !== prevServerUrl) {
        // 接続先が変わったら reader を作り直し、前の接続先で取った結果を捨てる
        bugReader = next.serverUrl === '' ? null : new MemoryReader(next.serverUrl);
        detailBugs = null;
        detailBugsFailed = false;
        detailBugsKey = null;
      }
      if (next.store !== prevStore) {
        // serverUrl 変更などで store が再生成された場合は購読を張り替えて取り直す
        unsubscribe();
        unsubscribe = next.store.subscribe(render);
        void next.store.refresh();
      }
      if (next.reviewStore !== prevReviewStore) {
        unsubscribeReview();
        unsubscribeReview = next.reviewStore.subscribe(render);
      }
      if (next.findingStore !== prevFindingStore) {
        unsubscribeFinding();
        unsubscribeFinding = next.findingStore.subscribe(render);
        void next.findingStore.refresh();
      }
      render();
    },
    destroy() {
      destroyed = true;
      unsubscribe();
      unsubscribeReview();
      unsubscribeFinding();
      // Select は open 中の overlay を document.body へ出しているため、destroy しないと
      // パネルを閉じても listbox / backdrop が残る。
      outcomeSelect.destroy();
      detailHandle?.destroy();
      detailHandle = null;
      bugPanelHandle?.destroy();
      bugPanelHandle = null;
      driftHandle?.destroy();
      driftHandle = null;
      root.remove();
    },
  };
}

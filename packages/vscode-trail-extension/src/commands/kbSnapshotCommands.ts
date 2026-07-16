// Phase 5 S3 (KB Persistence): KB スナップショットの復元導線と Shrink 警告通知。
//
// - 復元は trail.db 全体を当該時点へ戻す（グラフ以外のテーブルも巻き戻る）ため、
//   確認 modal でその旨を明示する。
// - 復元結果の上書き防止: 復元前に管理下の daemon を停止し（stopDaemon）、
//   TrailDatabase.restoreKnowledgeBaseSnapshot が close → ファイル復元 → 再 init →
//   rollback_executed 記録の順で行う（拡張側メモリと復元後 DB の整合を保つ）。
// SHORTCUT: 外部 daemon モード (anytimeTrail.daemon.useExternal) の daemon は停止できず、
// 復元結果を上書きし得る. ceiling: 管理下 daemon は停止済みのため残る競合は外部 daemon のみ.
// upgrade: 外部 daemon 運用で復元を使う要望が出たら daemon 側に HTTP shutdown ルートを追加する.
// 注: vscode.l10n.t は l10n バンドル未配線（package.json に "l10n" フィールドなし）のため
// runtime メッセージは英語固定（既存 emergencyCommands.ts と同方針）。command title のみ nls で ja/en 対応。
import type { TrailDatabase } from '@anytime-markdown/trail-db';
import type { KbShrinkAlert } from '@anytime-markdown/trail-core';
import * as vscode from 'vscode';

import { TrailLogger } from '../utils/TrailLogger';

const RESTORE_LABEL = 'Restore';
const RELOAD_LABEL = 'Reload Window';
const RESTORE_ACTION_LABEL = 'Restore Snapshot…';

export interface KbSnapshotCommandDeps {
	getTrailDb: () => TrailDatabase | undefined;
	/** 管理下の trail-daemon を停止する（外部 daemon モードでは no-op）。復元前の上書き防止用。 */
	stopDaemon: () => Promise<void>;
}

async function restoreKnowledgeBaseSnapshotCommand(deps: KbSnapshotCommandDeps): Promise<void> {
	const db = deps.getTrailDb();
	if (!db) {
		void vscode.window.showWarningMessage(vscode.l10n.t('Trail DB is not initialized.'));
		return;
	}
	const entries = db.listKnowledgeBaseSnapshots();
	if (entries.length === 0) {
		void vscode.window.showInformationMessage(
			vscode.l10n.t('No knowledge base snapshots found. They are created automatically before graph rewrites.'),
		);
		return;
	}
	const picked = await vscode.window.showQuickPick(
		entries.map((e) => ({
			label: `#${e.generation}  ${e.mtime.toISOString()}`,
			description: `${Math.max(1, Math.round(e.compressedSize / 1024))} KB`,
			generation: e.generation,
		})),
		{ title: vscode.l10n.t('Restore knowledge base snapshot (1 = newest)') },
	);
	if (!picked) return;
	const confirm = await vscode.window.showWarningMessage(
		vscode.l10n.t(
			'Restore trail.db from snapshot #{0}? The ENTIRE database (not only graphs) rolls back to that point, and the trail daemon is stopped until the window reloads. A safety copy of the current file is kept.',
			picked.generation,
		),
		{ modal: true },
		vscode.l10n.t(RESTORE_LABEL),
	);
	if (confirm !== vscode.l10n.t(RESTORE_LABEL)) return;
	try {
		// 復元結果の上書き防止: 同じ DB を開いている管理下 daemon を先に止める
		await deps.stopDaemon();
		// close → ファイル復元 → 再 init → rollback_executed 記録（TrailDatabase 側で一体実行）
		const result = await db.restoreKnowledgeBaseSnapshot(picked.generation);
		TrailLogger.info(
			`[kb-restore] restored from ${result.restoredFrom}; safety copy: ${result.safetyCopy ?? '(none)'}`,
		);
		const reload = await vscode.window.showInformationMessage(
			vscode.l10n.t('Restored from snapshot #{0}. Reload the window to restart the trail daemon.', picked.generation),
			vscode.l10n.t(RELOAD_LABEL),
		);
		if (reload === vscode.l10n.t(RELOAD_LABEL)) {
			await vscode.commands.executeCommand('workbench.action.reloadWindow');
		}
	} catch (err) {
		TrailLogger.error('[kb-restore] failed', err);
		void vscode.window.showErrorMessage(
			vscode.l10n.t(
				'Restore failed: {0}. Reload the window to restart the trail daemon.',
				err instanceof Error ? err.message : String(err),
			),
		);
	}
}

export function registerKbSnapshotCommands(
	context: vscode.ExtensionContext,
	deps: KbSnapshotCommandDeps,
): void {
	context.subscriptions.push(
		vscode.commands.registerCommand('anytime-trail.restoreKnowledgeBaseSnapshot', () =>
			restoreKnowledgeBaseSnapshotCommand(deps),
		),
	);
}

/** Shrink Audit 警告の通知。extension.ts が TrailDatabase.setKbShrinkAlertHandler に配線する。 */
export function notifyKbShrink(alert: KbShrinkAlert): void {
	TrailLogger.warn(
		`[kb-audit] shrink detected: ${alert.table} (${alert.repoName}) ${alert.before} -> ${alert.after} (loss ${(alert.lossRate * 100).toFixed(0)}%)`,
	);
	void vscode.window
		.showWarningMessage(
			vscode.l10n.t(
				'Knowledge base shrank sharply: {0} ({1}) {2} -> {3}. If this was intentional (e.g. package removal), you can ignore this warning.',
				alert.table,
				alert.repoName,
				alert.before,
				alert.after,
			),
			vscode.l10n.t(RESTORE_ACTION_LABEL),
		)
		.then((selection) => {
			if (selection === vscode.l10n.t(RESTORE_ACTION_LABEL)) {
				void vscode.commands.executeCommand('anytime-trail.restoreKnowledgeBaseSnapshot');
			}
		});
}

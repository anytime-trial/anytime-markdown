// Phase 5 S3 (KB Persistence): KB スナップショットの復元導線と Shrink 警告通知。
//
// - 復元は trail.db 全体を当該時点へ戻す（グラフ以外のテーブルも巻き戻る）ため、
//   確認 modal でその旨を明示する。
// - 復元記録（rollback_executed / kind:'kb_restore'）は復元「前」に書く:
//   復元後に save() が走るとメモリ上の古い DB が復元結果を上書きするため、
//   復元後はウィンドウリロードの案内のみ行う。
// SHORTCUT: 復元中も daemon (trail-server) が同一 DB を開いたままで、daemon 側の次回 save が
// 復元結果を上書きし得る. ceiling: database 拡張の既存復元フローと同じ既知の競合窓.
// upgrade: 復元頻度が運用上問題になったら daemon 停止 API を復元前に挟む.
import type { TrailDatabase } from '@anytime-markdown/trail-db';
import type { KbShrinkAlert } from '@anytime-markdown/trail-core';
import * as vscode from 'vscode';

import { TrailLogger } from '../utils/TrailLogger';

const RESTORE_LABEL = 'Restore';
const RELOAD_LABEL = 'Reload Window';
const RESTORE_ACTION_LABEL = 'Restore Snapshot…';

export interface KbSnapshotCommandDeps {
	getTrailDb: () => TrailDatabase | undefined;
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
			'Restore trail.db from snapshot #{0}? The ENTIRE database (not only graphs) rolls back to that point. A safety copy of the current file is kept.',
			picked.generation,
		),
		{ modal: true },
		vscode.l10n.t(RESTORE_LABEL),
	);
	if (confirm !== vscode.l10n.t(RESTORE_LABEL)) return;
	try {
		// 復元前に記録を残す（復元後の save は復元結果を上書きするため禁止）
		db.recordEmergencyEvent({
			occurredAt: new Date().toISOString(),
			event: 'rollback_executed',
			reason: `KB snapshot restore (generation ${picked.generation})`,
			actor: 'human',
			sessionId: null,
			detailJson: JSON.stringify({ kind: 'kb_restore', generation: picked.generation }),
		});
		db.save();
		const result = db.restoreKnowledgeBaseSnapshot(picked.generation);
		TrailLogger.info(
			`[kb-restore] restored from ${result.restoredFrom}; safety copy: ${result.safetyCopy ?? '(none)'}`,
		);
		const reload = await vscode.window.showInformationMessage(
			vscode.l10n.t('Restored from snapshot #{0}. Reload the window to reopen the database.', picked.generation),
			vscode.l10n.t(RELOAD_LABEL),
		);
		if (reload === vscode.l10n.t(RELOAD_LABEL)) {
			await vscode.commands.executeCommand('workbench.action.reloadWindow');
		}
	} catch (err) {
		TrailLogger.error('[kb-restore] failed', err);
		void vscode.window.showErrorMessage(
			vscode.l10n.t('Restore failed: {0}', err instanceof Error ? err.message : String(err)),
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

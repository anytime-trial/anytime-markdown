import * as vscode from 'vscode';

/**
 * 拡張の OutputChannel 経由のログ出力。CLAUDE.md のログ規約に従う:
 * - `vscode.OutputChannel` 経由（`console.*` はユーザーから見えないため使わない）
 * - 各行先頭に UTC ISO 8601 時刻
 * - `error` は `Error.stack` を含める
 *
 * `init(channel)` で activate() が生成済みの 'Anytime Graph' チャンネルを共有する。
 * 未 init の場合は遅延生成にフォールバックする。
 */
let _channel: vscode.OutputChannel | undefined;
/** 遅延生成したチャンネルか。init() で差し替えるとき、これだけを dispose する。 */
let _channelIsFallback = false;

function getChannel(): vscode.OutputChannel {
	if (_channel === undefined) {
		_channel = vscode.window.createOutputChannel('Anytime Graph');
		_channelIsFallback = true;
	}
	return _channel;
}

function ts(): string {
	return new Date().toISOString();
}

export const GraphLogger = {
	/**
	 * activate() で生成済みの OutputChannel を共有する。
	 *
	 * init 前にログを書くと遅延生成が走る。そのチャンネルは context.subscriptions に
	 * 入らず破棄されないうえ、activate 側の同名チャンネルと 2 系統に分かれて
	 * 「見ているチャンネルに目的の行が無い」状態になるため、ここで捨てる。
	 */
	init(channel: vscode.OutputChannel): void {
		if (_channelIsFallback) {
			_channel?.dispose();
		}
		_channel = channel;
		_channelIsFallback = false;
	},

	info(msg: string): void {
		getChannel().appendLine(`[${ts()}] [INFO] ${msg}`);
	},

	warn(msg: string): void {
		getChannel().appendLine(`[${ts()}] [WARN] ${msg}`);
	},

	error(msg: string, err?: unknown): void {
		// `err ? ...` にすると 0・空文字・false が握り潰される。undefined だけを「無し」とする。
		const detail =
			err instanceof Error ? `: ${err.message}` : err !== undefined ? `: ${String(err)}` : '';
		getChannel().appendLine(`[${ts()}] [ERROR] ${msg}${detail}`);
		if (err instanceof Error && err.stack) {
			getChannel().appendLine(err.stack);
		}
	},
};

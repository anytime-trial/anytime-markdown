// Extension Host 内で実行されるスモーク検査本体（@vscode/test-electron の extensionTestsPath）。
// インストール済み vsix の拡張を activate し、主要コマンドがコマンドパレットへ登録されることを検査する。
// コマンドの「実行」はしない — 実行はワークスペース状態や外部リソースに依存し、
// 拡張自体の健全性と無関係な理由で fail し得るため、疎通検査は「activate 成功 + コマンド登録」に限定する。

"use strict";

exports.run = async function run() {
  // vscode モジュールは Extension Host 内でのみ解決できる
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const vscode = require("vscode");
  const extId = process.env.VSIX_SMOKE_EXT_ID;
  const command = process.env.VSIX_SMOKE_COMMAND;
  if (!extId || !command) {
    throw new Error("VSIX_SMOKE_EXT_ID / VSIX_SMOKE_COMMAND is not set");
  }
  const ext = vscode.extensions.getExtension(extId);
  if (!ext) {
    throw new Error(`extension not installed: ${extId}`);
  }
  await ext.activate();
  const commands = await vscode.commands.getCommands(true);
  if (!commands.includes(command)) {
    throw new Error(`command not registered after activate: ${command}`);
  }
};

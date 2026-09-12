#!/usr/bin/env node
// anytime-dev-audit — ingest 配線診断の外部プロセス起動（実行ファイル解決と失敗種別）。
//
// 監査対象は任意のユーザーリポジトリなので、コマンド名だけで起動しない。解決規則の根拠は
// trail-activity の gitExecutable.ts にある（本スクリプトは拡張へバンドルされず単体展開される
// ため、同等の解決を自己完結で持つ）。

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

function logWarn(message) {
  console.error(`[${new Date().toISOString()}] [WARN] ingest-wiring-check: ${message}`);
}

/**
 * PATH の絶対パス要素だけを走査して実行ファイルを絶対パスで解決する（S4036）。
 *
 * Why not コマンド名だけを execFileSync へ渡さない: 探索が OS に委ねられ、Windows の
 * CreateProcess はカレントディレクトリを PATH より先に探すため、監査対象のリポジトリに
 * コミットされた git.exe が実行され得る。POSIX でも PATH の空要素・相対要素は cwd を指す。
 * 本スクリプトはユーザー設定と lep.json から来た任意のディレクトリを -C に渡して git を回すので、
 * この経路は現実に開く。trail-activity の gitExecutable.ts が同じ理由で同じ対策を採っており、
 * 本スクリプトは拡張へバンドルされず単体展開されるため、同等の解決を自己完結で持つ。
 * git は ANYTIME_GIT_PATH（絶対パス）で差し替えられる。
 */
function resolveExecutable(name, env = process.env) {
  const override = name === 'git' ? env.ANYTIME_GIT_PATH : undefined;
  if (typeof override === 'string' && path.isAbsolute(override)) return override;
  const extensions = process.platform === 'win32' ? ['.COM', '.EXE'] : [''];
  for (const dir of (env.PATH ?? '').split(path.delimiter)) {
    // 空要素・相対要素は cwd を指すので捨てる（フォールバックしない = fail-closed）。
    if (!path.isAbsolute(dir)) continue;
    for (const ext of extensions) {
      const candidate = path.join(dir, name + ext);
      try {
        fs.accessSync(candidate, fs.constants.X_OK);
        return candidate;
      } catch {
        // 次の候補へ。アクセス不能は「この候補ではない」以上の意味を持たない。
      }
    }
  }
  return null;
}

/**
 * 実行ファイルを絶対パスで解決してから起動し、失敗の種別まで返す。
 *
 * 「実行ファイルが無い」と「コマンドが否定を返した」を同じ null へ畳むと、測れなかったことが
 * 断定に化ける（D1 が正当な git リポジトリを「git working tree でない」と報告する）。
 */
function runCommand(name, args, env = process.env) {
  const executable = resolveExecutable(name, env);
  if (executable === null) {
    return { ok: false, kind: 'not-found', message: `${name} 実行ファイルを PATH の絶対パス要素から解決できない` };
  }
  try {
    return { ok: true, stdout: execFileSync(executable, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim() };
  } catch (err) {
    if (err?.status === null || err?.status === undefined) {
      logWarn(`${executable} ${args.join(' ')} — ${err?.message ?? err}`);
      return { ok: false, kind: 'spawn-failed', message: err?.message ?? String(err) };
    }
    return { ok: false, kind: 'exit', message: (err?.stderr ?? '').toString().trim() || `exit ${err.status}` };
  }
}

/** 成功時の stdout だけが要る呼び出し用（失敗はすべて null）。 */
function tryExec(cmd, args) {
  const result = runCommand(cmd, args);
  return result.ok ? result.stdout : null;
}

/**
 * git working tree かを三値で返す。true / false / { unknown: 理由 }。
 * unknown は「測れなかった」であって「working tree でない」ではない。
 */
function gitWorkTreeProbe(dir) {
  const result = runCommand('git', ['-C', dir, 'rev-parse', '--is-inside-work-tree']);
  if (result.ok) return result.stdout === 'true';
  if (result.kind === 'exit') {
    // git が明確に否定したのか、アクセスを拒否したのかを stderr で分ける。
    // dubious ownership は監視設定ではなく safe.directory を直す話なので、理由を取り違えない。
    if (/dubious ownership|safe\.directory|detected dubious/i.test(result.message)) {
      return { unknown: `git がリポジトリへのアクセスを拒否した（safe.directory を疑う）: ${result.message}` };
    }
    return false;
  }
  return { unknown: result.message };
}

module.exports = { resolveExecutable, runCommand, tryExec, gitWorkTreeProbe };

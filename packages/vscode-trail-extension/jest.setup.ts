// Jest グローバルセットアップ: 保護領域（ユーザーホーム配下の永続データ）への
// 書き込みを全テストで禁止する。2026-04-20 の本番 DB 破壊事故を受けて追加。
//
// 保護領域:
//   - ~/.claude/**                                     — Claude Code 本体のデータ
//   - ~/.vscode-server/data/User/globalStorage/**      — VS Code 拡張機能のデータ
//
// テストが保護領域に書き込もうとした場合、即座に例外で失敗する。
// 個別クラスの save() ガード（TrailDatabase.save の assertNotProductionWriteDuringTests）と
// 多層防御を構成する最外殻の網。
// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs = require('node:fs') as typeof import('node:fs');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const os = require('node:os') as typeof import('node:os');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const path = require('node:path') as typeof import('node:path');

const PROTECTED_PREFIXES = [
  path.join(os.homedir(), '.claude'),
  path.join(os.homedir(), '.vscode-server', 'data', 'User', 'globalStorage'),
];

function isProtectedPath(target: string): boolean {
  for (const prefix of PROTECTED_PREFIXES) {
    if (target.startsWith(prefix)) return true;
  }
  return false;
}

function pathFromArg(arg: unknown): string {
  if (typeof arg === 'string') return arg;
  if (arg instanceof URL) return arg.pathname;
  if (Buffer.isBuffer(arg)) return arg.toString('utf-8');
  if (typeof arg === 'number') return '';
  return String(arg ?? '');
}

// CommonJS の fs モジュールはプロパティが writable=true なため require 経由なら再代入可能。
// as unknown as Record<string, unknown> にキャストして代入する。
const fsMutable = fs as unknown as Record<string, unknown>;

const origWriteFileSync = fs.writeFileSync;
fsMutable.writeFileSync = (file: unknown, data: unknown, options?: unknown) => {
  const target = pathFromArg(file);
  if (isProtectedPath(target)) {
    throw new Error(`[jest.setup] Blocked writeFileSync to protected path: ${target}`);
  }
  return origWriteFileSync(file as never, data as never, options as never);
};

const origAppendFileSync = fs.appendFileSync;
fsMutable.appendFileSync = (file: unknown, data: unknown, options?: unknown) => {
  const target = pathFromArg(file);
  if (isProtectedPath(target)) {
    throw new Error(`[jest.setup] Blocked appendFileSync to protected path: ${target}`);
  }
  return origAppendFileSync(file as never, data as never, options as never);
};

const origRenameSync = fs.renameSync;
fsMutable.renameSync = (oldPath: unknown, newPath: unknown) => {
  const src = pathFromArg(oldPath);
  const dst = pathFromArg(newPath);
  if (isProtectedPath(src) || isProtectedPath(dst)) {
    throw new Error(`[jest.setup] Blocked renameSync involving protected path: ${src} -> ${dst}`);
  }
  return origRenameSync(oldPath as never, newPath as never);
};

const origUnlinkSync = fs.unlinkSync;
fsMutable.unlinkSync = (p: unknown) => {
  const target = pathFromArg(p);
  if (isProtectedPath(target)) {
    throw new Error(`[jest.setup] Blocked unlinkSync on protected path: ${target}`);
  }
  return origUnlinkSync(p as never);
};

// 非同期 API (fs.promises) も同様にフック
const promisesMutable = fs.promises as unknown as Record<string, unknown>;
const origWriteFile = fs.promises.writeFile;
promisesMutable.writeFile = async (file: unknown, data: unknown, options?: unknown) => {
  const target = pathFromArg(file);
  if (isProtectedPath(target)) {
    throw new Error(`[jest.setup] Blocked promises.writeFile to protected path: ${target}`);
  }
  return origWriteFile(file as never, data as never, options as never);
};

const origAppendFile = fs.promises.appendFile;
promisesMutable.appendFile = async (file: unknown, data: unknown, options?: unknown) => {
  const target = pathFromArg(file);
  if (isProtectedPath(target)) {
    throw new Error(`[jest.setup] Blocked promises.appendFile to protected path: ${target}`);
  }
  return origAppendFile(file as never, data as never, options as never);
};

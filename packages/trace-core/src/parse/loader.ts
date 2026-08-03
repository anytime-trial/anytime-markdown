import * as fs from 'node:fs/promises';
import type { TraceFile } from '../types';
import { migrateTraceFile } from './migrate';

/**
 * Node 環境専用の trace ファイルローダ。読み込んだ JSON は `migrateTraceFile` を通すため、
 * 旧バージョン（v1）のファイルも現行スキーマとして返る。
 *
 * `node:fs/promises` に依存するため、webview / ブラウザ向けの barrel からは公開しない
 * （バンドラが Node 組み込みを解決できず落ちる）。移送規則が要る consumer は
 * `migrateTraceFile` を直接 import する。
 */
export async function loadTraceFile(filePath: string): Promise<TraceFile> {
    const text = await fs.readFile(filePath, 'utf-8');
    return migrateTraceFile(JSON.parse(text));
}

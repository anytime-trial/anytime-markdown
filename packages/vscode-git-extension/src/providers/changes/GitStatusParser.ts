import * as path from 'node:path';
import { execFileSync } from 'node:child_process';

import type { ParsedChange } from './types';
import { parseStatusCode } from './types';
import { GitLogger } from '../../utils/GitLogger';

/** git status の1行をパースして staged/unstaged に振り分ける */
export function parseStatusLine(line: string, gitRoot: string): { staged?: ParsedChange; unstaged?: ParsedChange } {
	const x = line[0]; // index status
	const y = line[1]; // working tree status
	const filePath = line.substring(3).trim();
	const result: { staged?: ParsedChange; unstaged?: ParsedChange } = {};

	if (x !== ' ' && x !== '?') {
		result.staged = {
			filePath,
			absPath: path.join(gitRoot, filePath),
			status: parseStatusCode(x, 'staged'),
			group: 'staged',
		};
	}
	if (y !== ' ' || x === '?') {
		result.unstaged = {
			filePath,
			absPath: path.join(gitRoot, filePath),
			status: x === '?' ? parseStatusCode('?', 'changes') : parseStatusCode(y, 'changes'),
			group: 'changes',
		};
	}
	return result;
}

/** 未追跡ディレクトリ内のファイルを個別に展開する */
export function expandUntrackedDir(gitRoot: string, dirPath: string): ParsedChange[] {
	try {
		const files = execFileSync(
			'git', ['ls-files', '--others', '--exclude-standard', '--', dirPath],
			{ cwd: gitRoot, encoding: 'utf-8' },
		);
		return files.split('\n')
			.map(f => f.trim())
			.filter(f => f.length > 0)
			.map(f => ({
				filePath: f,
				absPath: path.join(gitRoot, f),
				status: parseStatusCode('?', 'changes'),
				group: 'changes' as const,
			}));
	} catch { return []; }
}

/** git status --porcelain の結果をパースして staged/unstaged に分類する */
export function getChanges(gitRoot: string): { staged: ParsedChange[]; unstaged: ParsedChange[] } {
	let output: string;
	try {
		output = execFileSync('git', ['status', '--porcelain'], { cwd: gitRoot, encoding: 'utf-8' });
	} catch {
		return { staged: [], unstaged: [] };
	}

	const staged: ParsedChange[] = [];
	const unstaged: ParsedChange[] = [];

	for (const line of output.split('\n')) {
		if (!line || line.length < 4) continue;
		const filePath = line.substring(3).trim();

		// 未追跡ディレクトリ（?? dir/）は中のファイルを個別に展開
		if (filePath.endsWith('/') && line.startsWith('?')) {
			unstaged.push(...expandUntrackedDir(gitRoot, filePath));
			continue;
		}

		const parsed = parseStatusLine(line, gitRoot);
		if (parsed.staged) staged.push(parsed.staged);
		if (parsed.unstaged) unstaged.push(parsed.unstaged);
	}

	return { staged, unstaged };
}

/** リモートとの差分（ahead/behind）を取得 */
export function getSyncInfo(gitRoot: string): { ahead: number; behind: number } {
	let ahead = 0;
	let behind = 0;
	try {
		const aheadOut = execFileSync('git', ['rev-list', '@{u}..HEAD', '--count'], { cwd: gitRoot, encoding: 'utf-8' }).trim();
		ahead = Number.parseInt(aheadOut, 10) || 0;
	} catch { /* no upstream */ }
	try {
		const behindOut = execFileSync('git', ['rev-list', 'HEAD..@{u}', '--count'], { cwd: gitRoot, encoding: 'utf-8' }).trim();
		behind = Number.parseInt(behindOut, 10) || 0;
	} catch { /* no upstream */ }
	return { ahead, behind };
}

/** gitRoot のリポジトリ名とブランチ名を取得 */
export function getRepoInfo(gitRoot: string): { repoName: string; branchName: string } {
	const repoName = path.basename(gitRoot);
	let branchName = '';
	try {
		branchName = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: gitRoot, encoding: 'utf-8' }).trim();
	} catch (err) { GitLogger.warn(`Failed to get branch name for ${gitRoot}`); }
	return { repoName, branchName };
}

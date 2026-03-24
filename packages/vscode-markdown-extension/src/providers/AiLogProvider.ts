import * as vscode from 'vscode';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as readline from 'node:readline';
import { execFileSync } from 'node:child_process';

/** セッション一覧の TreeItem */
export class AiLogItem extends vscode.TreeItem {
	constructor(
		public readonly sessionId: string,
		public readonly filePath: string,
		public readonly dateLabel: string,
		public readonly messageCount: number,
	) {
		super(dateLabel, vscode.TreeItemCollapsibleState.None);
		this.description = `${messageCount} messages`;
		this.tooltip = `${dateLabel}\n${messageCount} messages\n${sessionId}`;
		this.iconPath = new vscode.ThemeIcon('file-text');
		this.command = {
			command: 'anytime-markdown.openAiLog',
			title: 'Open AI Log',
			arguments: [this],
		};
	}
}

interface JsonlRecord {
	type: string;
	version?: string;
	message?: {
		role?: string;
		model?: string;
		content: string | ContentBlock[];
	};
	parentUuid?: string;
	isSidechain?: boolean;
	timestamp?: string;
}

interface ContentBlock {
	type: string;
	text?: string;
	name?: string;
	input?: Record<string, unknown>;
}

/** セッション一覧を提供する TreeDataProvider */
export class AiLogProvider implements vscode.TreeDataProvider<AiLogItem> {
	private _onDidChangeTreeData = new vscode.EventEmitter<void>();
	readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

	constructor(private readonly sessionsDir: string) {}

	refresh(): void {
		this._onDidChangeTreeData.fire();
	}

	getTreeItem(element: AiLogItem): vscode.TreeItem {
		return element;
	}

	async getChildren(): Promise<AiLogItem[]> {
		if (!fs.existsSync(this.sessionsDir)) { return []; }

		const files = fs.readdirSync(this.sessionsDir)
			.filter(f => f.endsWith('.jsonl'))
			.map(f => {
				const full = path.join(this.sessionsDir, f);
				const stat = fs.statSync(full);
				return { name: f, full, mtime: stat.mtimeMs };
			})
			.sort((a, b) => b.mtime - a.mtime);

		const items: AiLogItem[] = [];
		for (const f of files) {
			const count = await this.countMessages(f.full);
			if (count === 0) { continue; }
			const date = new Date(f.mtime);
			const dateLabel = date.toLocaleDateString('ja-JP', {
				year: 'numeric', month: '2-digit', day: '2-digit',
				hour: '2-digit', minute: '2-digit',
			});
			const sessionId = f.name.replace('.jsonl', '');
			items.push(new AiLogItem(sessionId, f.full, dateLabel, count));
		}
		return items;
	}

	/** user/assistant メッセージ数を高速カウント（先頭数行で判定） */
	private countMessages(filePath: string): Promise<number> {
		return new Promise(resolve => {
			let count = 0;
			const stream = fs.createReadStream(filePath, { encoding: 'utf-8' });
			const rl = readline.createInterface({ input: stream });
			rl.on('line', line => {
				// 高速な文字列マッチで型判定
				if (line.includes('"type":"user"') || line.includes('"type":"assistant"')) {
					// user の tool_result と progress はスキップ
					if (!line.includes('"tool_result"')) {
						count++;
					}
				}
			});
			rl.on('close', () => resolve(count));
			rl.on('error', () => resolve(0));
		});
	}

	/** JSONL → Markdown 変換 */
	static async convertToMarkdown(filePath: string): Promise<string> {
		const lines: string[] = [];
		const stream = fs.createReadStream(filePath, { encoding: 'utf-8' });
		const rl = readline.createInterface({ input: stream });

		// セッション日時
		const stat = fs.statSync(filePath);
		const date = new Date(stat.mtimeMs);
		const dateStr = date.toLocaleDateString('ja-JP', {
			year: 'numeric', month: '2-digit', day: '2-digit',
			hour: '2-digit', minute: '2-digit',
		});
		lines.push(`# AI Log — ${dateStr}\n`);

		let gitUserName = 'User';
		try {
			gitUserName = execFileSync('git', ['config', 'user.name'], { encoding: 'utf-8' }).trim() || 'User';
		} catch { /* fallback */ }

		let lastRole = '';

		for await (const rawLine of rl) {
			let record: JsonlRecord;
			try { record = JSON.parse(rawLine); } catch { continue; }

			if (record.type === 'user' && record.message) {
				const content = record.message.content;
				const text = extractUserText(content);
				if (!text) { continue; }
				if (lastRole !== 'user') {
					lines.push(`\n## ${gitUserName}\n`);
				}
				lines.push(text + '\n');
				lastRole = 'user';
			} else if (record.type === 'assistant' && record.message) {
				const content = record.message.content;
				if (!Array.isArray(content)) { continue; }

				const textParts: string[] = [];
				const toolParts: string[] = [];

				for (const block of content) {
					if (block.type === 'text' && block.text?.trim()) {
						textParts.push(block.text.trim());
					} else if (block.type === 'tool_use' && block.name) {
						toolParts.push(formatToolUse(block));
					}
					// thinking ブロックはスキップ
				}

				if (textParts.length === 0 && toolParts.length === 0) { continue; }

				if (lastRole !== 'assistant') {
					const model = record.message.model || '';
					const ver = record.version || '';
					const meta = [model, ver ? `v${ver}` : ''].filter(Boolean).join(' / ');
					lines.push(`\n## Assistant${meta ? ` (${meta})` : ''}\n`);
				}

				if (textParts.length > 0) {
					lines.push(textParts.join('\n\n') + '\n');
				}
				if (toolParts.length > 0) {
					lines.push(toolParts.join('\n') + '\n');
				}
				lastRole = 'assistant';
			}
		}

		return lines.join('\n');
	}
}

/** ユーザーメッセージからテキストを抽出（system-reminder 等を除去） */
function extractUserText(content: string | ContentBlock[]): string {
	let raw = '';
	if (typeof content === 'string') {
		raw = content;
	} else if (Array.isArray(content)) {
		const texts: string[] = [];
		for (const block of content) {
			if (block.type === 'text' && block.text) {
				texts.push(block.text);
			}
			// tool_result はスキップ
		}
		raw = texts.join('\n');
	}

	// XML タグ（system-reminder, local-command-caveat 等）を除去
	raw = raw.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '');
	raw = raw.replace(/<local-command-caveat>[\s\S]*?<\/local-command-caveat>/g, '');
	raw = raw.replace(/<command-name>[\s\S]*?<\/command-name>/g, '');
	raw = raw.replace(/<command-message>[\s\S]*?<\/command-message>/g, '');
	raw = raw.replace(/<command-args>[\s\S]*?<\/command-args>/g, '');
	raw = raw.replace(/<local-command-stdout>[\s\S]*?<\/local-command-stdout>/g, '');

	return raw.trim();
}

/** tool_use を1行の概要に変換 */
function formatToolUse(block: ContentBlock): string {
	const name = block.name || 'unknown';
	const input = block.input || {};

	switch (name) {
		case 'Read':
			return `> 📖 Read: \`${input.file_path || ''}\``;
		case 'Write':
			return `> 📝 Write: \`${input.file_path || ''}\``;
		case 'Edit':
			return `> ✏️ Edit: \`${input.file_path || ''}\``;
		case 'Glob':
			return `> 🔍 Glob: \`${input.pattern || ''}\``;
		case 'Grep':
			return `> 🔍 Grep: \`${input.pattern || ''}\``;
		case 'Bash': {
			const cmd = String(input.command || '').slice(0, 100);
			return `> 💻 Bash: \`${cmd}\``;
		}
		case 'Agent':
			return `> 🤖 Agent: ${input.description || ''}`;
		default:
			return `> 🔧 ${name}`;
	}
}

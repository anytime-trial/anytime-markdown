import * as fs from 'fs';
import * as path from 'path';

/**
 * 全ツールが DB パス解決へ `workspacePath` を渡していることを静的に固定する。
 *
 * 配線テスト（`workspacePathPassthrough.test.ts`）はモック負荷の都合で代表ツールしか
 * 通せない。引数なし呼び出し（`resolveCaravanDbPath({})`）へ戻る退行は 1 ファイル単位で
 * 起きるため、ここでは全ファイルを走査して形で塞ぐ。
 *
 * 引数を渡さないと解決は cwd 基準に落ち、別ワークスペースの DB を掴んでも
 * 「該当なし」と区別が付かない（呼び出し側に失敗として現れない）。
 */
const TOOLS_DIR = path.join(__dirname, '..', '..', 'tools');

/** `resolveCaravanDbPath(...)` / `resolveDbPath(...)` の引数テキストを列挙する。 */
function collectResolveCalls(text: string): string[] {
    const calls: string[] = [];
    const re = /resolve(?:Caravan)?DbPath\(([^)]*)\)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
        calls.push(m[1].trim());
    }
    return calls;
}

describe('DB パス解決の workspacePath 受け渡し（全ツール走査）', () => {
    const files = fs
        .readdirSync(TOOLS_DIR)
        .filter((f) => f.endsWith('.ts') && f !== 'workspaceParam.ts')
        .map((f) => path.join(TOOLS_DIR, f));

    it('走査対象のツールが存在する（グロブ切れの空振り防止）', () => {
        expect(files.length).toBeGreaterThan(10);
    });

    it('引数なしの resolveDbPath({}) / resolveCaravanDbPath({}) が存在しない', () => {
        const offenders: string[] = [];

        for (const file of files) {
            const text = fs.readFileSync(file, 'utf-8');
            for (const args of collectResolveCalls(text)) {
                // 空オブジェクト・引数なしはワークスペース指定の手段が無い呼び出し。
                if (args === '' || args === '{}') {
                    offenders.push(`${path.basename(file)}: resolve...DbPath(${args})`);
                    continue;
                }
                // 文字列変数を渡す形（verificationStatus のローカル resolveDbPath）は対象外。
                if (!args.includes('{')) continue;
                if (!args.includes('workspacePath')) {
                    offenders.push(`${path.basename(file)}: resolve...DbPath(${args})`);
                }
            }
        }

        expect(offenders).toEqual([]);
    });

    it('DB を解決するツールは workspacePath を input schema に持つ', () => {
        const offenders: string[] = [];

        for (const file of files) {
            const text = fs.readFileSync(file, 'utf-8');
            if (!/resolve(?:Caravan)?DbPath\(/.test(text)) continue;
            if (!text.includes('workspacePath:')) {
                offenders.push(path.basename(file));
            }
        }

        expect(offenders).toEqual([]);
    });
});

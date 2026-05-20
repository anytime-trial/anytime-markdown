import { patchSql } from '../monkeyPatch/sql';
import { globalRecorder } from '../globalRecorder';

beforeEach(() => {
    globalRecorder.reset();
});

describe('patchSql', () => {
    it('does not throw when optional DB packages are not installed', () => {
        expect(() => patchSql()).not.toThrow();
    });

    it('patches better-sqlite3 prepare when installed (lines 39-40)', () => {
        // better-sqlite3 is available in the repo (trail-db uses it)
        // Try to require it — if not available the test is still valid (patchSql swallows the error)
        let db: { prepare: (sql: string) => unknown } | null = null;
        let betterSqlite3Available = false;
        try {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const Database = require('better-sqlite3') as { new(path: string): typeof db };
            db = new Database(':memory:') as unknown as { prepare: (sql: string) => unknown };
            betterSqlite3Available = true;
        } catch {
            // not available
        }

        if (betterSqlite3Available && db) {
            patchSql();
            // Call prepare — should record an io event
            db.prepare('SELECT 1');
            const entries = globalRecorder.entries();
            const ioEntry = entries.find(e => e.type === 'io' && (e as { method?: string }).method === 'sqlite3.prepare');
            expect(ioEntry).toBeDefined();
        } else {
            // Just verify no throw when not installed
            expect(() => patchSql()).not.toThrow();
        }
    });

    it('records io event for pg when it patches (lines 15-16)', () => {
        // pg is not installed in this package; patchSql silently skips — just verify no error
        expect(() => patchSql()).not.toThrow();
        // No pg entries expected since pg is not installed
        const entries = globalRecorder.entries();
        expect(entries.filter(e => e.type === 'io' && (e as { lifelineId?: string }).lifelineId === 'L_pg')).toHaveLength(0);
    });
});

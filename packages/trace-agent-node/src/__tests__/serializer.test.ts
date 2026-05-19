import { safeSerialize } from '../serializer';

describe('safeSerialize', () => {
    it('passes through primitives unchanged', () => {
        expect(safeSerialize(42)).toBe(42);
        expect(safeSerialize('hello')).toBe('hello');
        expect(safeSerialize(null)).toBeNull();
        expect(safeSerialize(true)).toBe(true);
    });

    it('serializes plain objects', () => {
        expect(safeSerialize({ a: 1 })).toEqual({ a: 1 });
    });

    it('replaces circular references', () => {
        const obj: Record<string, unknown> = { x: 1 };
        obj['self'] = obj;
        const result = safeSerialize(obj) as Record<string, unknown>;
        expect(result['self']).toEqual({ $circular: true });
    });

    it('truncates strings longer than 1000 chars', () => {
        const long = 'a'.repeat(2000);
        const result = safeSerialize(long) as string;
        expect(result.length).toBeLessThan(2000);
        expect(result).toContain('$truncated');
    });

    it('truncates arrays longer than 20 elements', () => {
        const arr = Array.from({ length: 30 }, (_, i) => i);
        const result = safeSerialize(arr) as unknown[];
        expect(result.length).toBeLessThanOrEqual(21);
    });

    it('serializes functions with their name (line 14)', () => {
        function myFunc() { return 1; }
        const result = safeSerialize(myFunc) as { $fn: string };
        expect(result.$fn).toBe('myFunc');
    });

    it('serializes anonymous functions as "anonymous" (line 14)', () => {
        const result = safeSerialize(function () { return 1; }) as { $fn: string };
        expect(result.$fn).toBe('anonymous');
    });

    it('converts non-object non-string types to string (line 15 — symbol)', () => {
        const sym = Symbol('test');
        const result = safeSerialize(sym) as string;
        expect(typeof result).toBe('string');
        expect(result).toContain('test');
    });

    it('returns truncated marker when depth exceeds MAX_DEPTH (line 16)', () => {
        // Build a deeply nested object to hit depth >= 5
        const deep: Record<string, unknown> = {};
        let current = deep;
        for (let i = 0; i < 7; i++) {
            current['child'] = {};
            current = current['child'] as Record<string, unknown>;
        }
        const result = safeSerialize(deep) as Record<string, unknown>;
        // At depth 5 the value should have $truncated
        function findTruncated(val: unknown): boolean {
            if (val && typeof val === 'object') {
                if ((val as Record<string, unknown>)['$truncated']) return true;
                return Object.values(val).some(findTruncated);
            }
            return false;
        }
        expect(findTruncated(result)).toBe(true);
    });

    it('undefined is treated as null', () => {
        expect(safeSerialize(undefined)).toBeNull();
    });
});

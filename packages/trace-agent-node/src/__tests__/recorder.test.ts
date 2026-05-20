import { Recorder } from '../recorder';

describe('Recorder', () => {
    let rec: Recorder;

    beforeEach(() => {
        rec = new Recorder({ depthLimit: 3 });
    });

    it('enter increments depth and returns an id', () => {
        const id = rec.enter('L0', null, 'foo', [1, 2], 0);
        expect(id).toBeGreaterThan(0);
        expect(rec.entries()).toHaveLength(1);
    });

    it('exit records return event', () => {
        const id = rec.enter('L0', null, 'foo', [], 0);
        rec.exit(id, 42);
        expect(rec.entries()[1]).toMatchObject({ type: 'return', ofId: id });
    });

    it('throw records throw event', () => {
        const id = rec.enter('L0', null, 'foo', [], 0);
        rec.throw(id, new Error('oops'));
        expect(rec.entries()[1]).toMatchObject({ type: 'throw', ofId: id });
    });

    it('skips enter when depth exceeds depthLimit', () => {
        const id = rec.enter('L0', null, 'f', [], 4);
        expect(id).toBe(-1);
        expect(rec.entries()).toHaveLength(0);
    });

    it('reset clears all entries', () => {
        rec.enter('L0', null, 'foo', [], 0);
        rec.reset();
        expect(rec.entries()).toHaveLength(0);
    });

    it('io records an io entry (lines 23-32)', () => {
        rec.io('__process__', 'L_http', 'http.request', { url: 'http://example.com' });
        const entries = rec.entries();
        expect(entries).toHaveLength(1);
        expect(entries[0]).toMatchObject({
            type: 'io',
            lifelineId: 'L_http',
            fromLifelineId: '__process__',
            method: 'http.request',
        });
    });

    it('throw with non-Error value wraps it in Error', () => {
        const id = rec.enter('L0', null, 'foo', [], 0);
        rec.throw(id, 'plain string error');
        const entry = rec.entries()[1] as { error?: { message: string } };
        expect(entry.error?.message).toBe('plain string error');
    });

    it('exit is a no-op when ofId is -1 (depth exceeded)', () => {
        const skippedId = rec.enter('L0', null, 'f', [], 4); // returns -1
        rec.exit(skippedId, 'result');
        expect(rec.entries()).toHaveLength(0);
    });

    it('throw is a no-op when ofId is -1', () => {
        const skippedId = rec.enter('L0', null, 'f', [], 4); // returns -1
        rec.throw(skippedId, new Error('ignored'));
        expect(rec.entries()).toHaveLength(0);
    });
});

import { DisposableStore, type Disposable } from '../Disposable';

describe('DisposableStore', () => {
  it('disposes children in reverse order', () => {
    const calls: string[] = [];
    const store = new DisposableStore();
    store.add({ dispose: () => calls.push('a') });
    store.add({ dispose: () => calls.push('b') });
    store.dispose();
    expect(calls).toEqual(['b', 'a']);
  });

  it('continues disposing remaining items after error', () => {
    const calls: string[] = [];
    const store = new DisposableStore();
    store.add({ dispose: () => calls.push('a') });
    store.add({ dispose: () => { throw new Error('boom'); } });
    store.add({ dispose: () => calls.push('c') });
    store.dispose();
    expect(calls).toEqual(['c', 'a']);
  });
});

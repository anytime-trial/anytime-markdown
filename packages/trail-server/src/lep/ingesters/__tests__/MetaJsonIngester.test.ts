import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import type { AnalyzerContext, AnalyzerEvent, EventBusPublisher } from '@anytime-markdown/memory-core';

import { MetaJsonIngester } from '../MetaJsonIngester';

function makeBus(): { bus: EventBusPublisher; events: AnalyzerEvent[] } {
  const events: AnalyzerEvent[] = [];
  return { events, bus: { publish: async (e) => { events.push(e); } } };
}

function makeCtx(bus: EventBusPublisher): AnalyzerContext {
  return {
    runId: 'r1',
    reason: 'manual',
    logger: { info: () => undefined, error: () => undefined },
    bus,
  };
}

function tmpDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `meta-json-ingester-${prefix}-`));
}

describe('MetaJsonIngester', () => {
  it('emits meta_json for each subagent meta.json', async () => {
    const base = tmpDir('claude');
    const sid1 = '11111111-1111-1111-1111-111111111111';
    const sid2 = '22222222-2222-2222-2222-222222222222';
    const dir1 = path.join(base, 'projA', sid1, 'subagents');
    const dir2 = path.join(base, 'projA', sid2, 'subagents');
    fs.mkdirSync(dir1, { recursive: true });
    fs.mkdirSync(dir2, { recursive: true });
    const meta1 = path.join(dir1, 'agent-foo.meta.json');
    const meta2 = path.join(dir2, 'agent-bar.meta.json');
    fs.writeFileSync(meta1, JSON.stringify({ agentType: 'general-purpose' }));
    fs.writeFileSync(meta2, JSON.stringify({ agentType: 'code-reviewer' }));

    const ingester = new MetaJsonIngester({ claudeProjectsDir: base });
    const { bus, events } = makeBus();
    await ingester.onRunStart(makeCtx(bus));

    const metas = events.filter((e) => e.kind === 'meta_json');
    expect(metas).toHaveLength(2);
    const keyed = new Map<string, { sessionId: string; agentType: string }>();
    for (const e of metas) {
      if (e.kind === 'meta_json') keyed.set(e.agentId, { sessionId: e.sessionId, agentType: e.agentType });
    }
    expect(keyed.get('foo')).toEqual({ sessionId: sid1, agentType: 'general-purpose' });
    expect(keyed.get('bar')).toEqual({ sessionId: sid2, agentType: 'code-reviewer' });
  });

  it('skips non-matching filenames and entries without agentType', async () => {
    const base = tmpDir('skip');
    const sid = '33333333-3333-3333-3333-333333333333';
    const dir = path.join(base, 'p', sid, 'subagents');
    fs.mkdirSync(dir, { recursive: true });

    fs.writeFileSync(path.join(dir, 'agent-ok.meta.json'), JSON.stringify({ agentType: 'haiku-search' }));
    fs.writeFileSync(path.join(dir, 'agent-empty.meta.json'), JSON.stringify({ agentType: '' }));
    fs.writeFileSync(path.join(dir, 'agent-wrong-type.meta.json'), JSON.stringify({ agentType: 123 }));
    fs.writeFileSync(path.join(dir, 'agent-no-type.meta.json'), JSON.stringify({ other: 'x' }));
    fs.writeFileSync(path.join(dir, 'not-agent.json'), JSON.stringify({ agentType: 'x' }));
    fs.writeFileSync(path.join(dir, 'agent-bad.meta.json'), 'not json{}');

    const ingester = new MetaJsonIngester({ claudeProjectsDir: base });
    const { bus, events } = makeBus();
    await ingester.onRunStart(makeCtx(bus));

    const metas = events.filter((e) => e.kind === 'meta_json');
    expect(metas).toHaveLength(1);
    if (metas[0].kind === 'meta_json') {
      expect(metas[0].agentId).toBe('ok');
      expect(metas[0].agentType).toBe('haiku-search');
    }
  });

  it('skips sessions without subagents dir', async () => {
    const base = tmpDir('no-subagent');
    fs.mkdirSync(path.join(base, 'p', 'no-meta-here'), { recursive: true });

    const ingester = new MetaJsonIngester({ claudeProjectsDir: base });
    const { bus, events } = makeBus();
    await ingester.onRunStart(makeCtx(bus));
    expect(events).toEqual([]);
  });

  it('handles missing projects dir', async () => {
    const ingester = new MetaJsonIngester({ claudeProjectsDir: '/nonexistent/path' });
    const { bus, events } = makeBus();
    await ingester.onRunStart(makeCtx(bus));
    expect(events).toEqual([]);
  });

  it('exposes tier=1 and proper emits', () => {
    const ingester = new MetaJsonIngester();
    expect(ingester.tier).toBe(1);
    expect(ingester.id).toBe('MetaJsonIngester');
    expect(ingester.subscribes).toEqual([]);
    expect(ingester.emits).toEqual(['meta_json']);
  });
});

import { computeSessionCoupling } from '../../temporalCoupling/computeSessionCoupling';
import { computeSubagentTypeCoupling } from '../../temporalCoupling/computeSubagentTypeCoupling';
import type {
  ComputeTemporalCouplingOptions,
  SessionFileRow,
  SubagentTypeFileRow,
} from '../../temporalCoupling/types';

const looseOptions: ComputeTemporalCouplingOptions = {
  minChangeCount: 1,
  jaccardThreshold: 0,
  topK: 100,
  maxFilesPerCommit: 50,
};

describe('temporalCoupling integration: subagentType-grain divergence from session-grain', () => {
  it('reveals role-based clustering that session-grain misses', () => {
    // Scenario: 3 sessions, each split between two subagent_types
    //   s1 (Explore): finds files src/auth.ts, src/login.ts
    //   s1 (code-reviewer): reviews src/auth.test.ts, src/login.test.ts
    //   s2 (Explore): finds src/auth.ts, src/profile.ts
    //   s2 (code-reviewer): reviews src/auth.test.ts, src/profile.test.ts
    //   s3 (Explore): finds src/login.ts, src/profile.ts
    // session-grain (per session): each session sees a mix of source + test, so source<->test pairs co-appear
    // subagentType-grain: code-reviewer is purely test files, Explore is purely source files
    //   → Explore集合 = {auth.ts, login.ts, profile.ts}, code-reviewer集合 = {auth.test.ts, login.test.ts, profile.test.ts}
    //   → cross-domain ペア（auth.ts <-> auth.test.ts 等）は出ず、各ドメイン内の結合のみが残る
    const sessionRows: SessionFileRow[] = [
      { sessionId: 's1', filePath: 'src/auth.ts' },
      { sessionId: 's1', filePath: 'src/login.ts' },
      { sessionId: 's1', filePath: 'src/auth.test.ts' },
      { sessionId: 's1', filePath: 'src/login.test.ts' },
      { sessionId: 's2', filePath: 'src/auth.ts' },
      { sessionId: 's2', filePath: 'src/profile.ts' },
      { sessionId: 's2', filePath: 'src/auth.test.ts' },
      { sessionId: 's2', filePath: 'src/profile.test.ts' },
      { sessionId: 's3', filePath: 'src/login.ts' },
      { sessionId: 's3', filePath: 'src/profile.ts' },
    ];
    const subagentRows: SubagentTypeFileRow[] = [
      { subagentType: 'Explore', filePath: 'src/auth.ts' },
      { subagentType: 'Explore', filePath: 'src/login.ts' },
      { subagentType: 'Explore', filePath: 'src/auth.ts' },
      { subagentType: 'Explore', filePath: 'src/profile.ts' },
      { subagentType: 'Explore', filePath: 'src/login.ts' },
      { subagentType: 'Explore', filePath: 'src/profile.ts' },
      { subagentType: 'code-reviewer', filePath: 'src/auth.test.ts' },
      { subagentType: 'code-reviewer', filePath: 'src/login.test.ts' },
      { subagentType: 'code-reviewer', filePath: 'src/auth.test.ts' },
      { subagentType: 'code-reviewer', filePath: 'src/profile.test.ts' },
    ];

    const sessionEdges = computeSessionCoupling(sessionRows, looseOptions);
    const subagentEdges = computeSubagentTypeCoupling(subagentRows, looseOptions);

    const hasCrossDomainPair = (
      edges: ReadonlyArray<{ source: string; target: string }>,
    ): boolean =>
      edges.some(
        (e) =>
          (e.source.endsWith('.ts') && !e.source.endsWith('.test.ts') && e.target.endsWith('.test.ts')) ||
          (e.target.endsWith('.ts') && !e.target.endsWith('.test.ts') && e.source.endsWith('.test.ts')),
      );

    // session 粒度: source と test が同セッション内で混在 → cross-domain ペア出現
    expect(hasCrossDomainPair(sessionEdges)).toBe(true);
    // subagent 粒度: 役割ごとに集合が分かれる → cross-domain ペア出現せず
    expect(hasCrossDomainPair(subagentEdges)).toBe(false);
  });

  it('aggregates per-role file sets across sessions and surfaces role-internal coupling', () => {
    // code-reviewer が常にテストファイル群（auth.test, login.test）を触る
    const subagentRows: SubagentTypeFileRow[] = [
      { subagentType: 'code-reviewer', filePath: 'src/auth.test.ts' },
      { subagentType: 'code-reviewer', filePath: 'src/login.test.ts' },
    ];
    const edges = computeSubagentTypeCoupling(subagentRows, looseOptions);
    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({
      source: 'src/auth.test.ts',
      target: 'src/login.test.ts',
      jaccard: 1.0,
    });
  });
});

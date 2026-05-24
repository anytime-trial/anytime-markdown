// packages/trail-core/src/analyzer/cfg/flowGraphFromCfg.ts
//
// 言語非依存 CFG-IR → FlowGraph 射影。FlowAnalyzer.buildControlFlow と完全に同一の
// 出力 (ノード id 採番順・label・edge label) を再現する。IR 走査順は抽出順 (= AST 順)
// と一致するため id 採番も一致する。

import type { FlowGraph, FlowNode, FlowEdge } from '../flowTypes';
import type { CfgFunction, CfgBlock, CfgStmt } from './cfgTypes';

export function flowGraphFromCfg(cfg: CfgFunction): FlowGraph {
  let counter = 0;
  const nextId = (prefix: string): string => `${prefix}_${++counter}`;
  const nodes: FlowNode[] = [];
  const edges: FlowEdge[] = [];

  const startId = nextId('start');
  const endId = nextId('end');
  nodes.push(
    { id: startId, label: 'start', kind: 'start' },
    { id: endId, label: 'end', kind: 'end' },
  );

  if (!cfg.hasBody) {
    edges.push({ from: startId, to: endId });
    return { nodes, edges };
  }

  const linkPrev = (prev: readonly string[], to: string): void => {
    for (const p of prev) edges.push({ from: p, to });
  };

  const visitBlock = (block: CfgBlock, prev: string[]): string[] => {
    let cur = prev;
    for (const stmt of block.stmts) cur = visitStmt(stmt, cur);
    return cur;
  };

  const visitStmt = (stmt: CfgStmt, prev: string[]): string[] => {
    switch (stmt.kind) {
      case 'if': {
        const dId = nextId('decision');
        nodes.push({ id: dId, label: stmt.condition.slice(0, 40), kind: 'decision', line: stmt.line });
        linkPrev(prev, dId);

        const tId = nextId('process');
        nodes.push({ id: tId, label: 'then', kind: 'process' });
        edges.push({ from: dId, to: tId, label: 'true' });
        const thenOut = visitBlock(stmt.then, [tId]);

        if (!stmt.else) return [...thenOut, dId];

        const eId = nextId('process');
        nodes.push({ id: eId, label: 'else', kind: 'process' });
        edges.push({ from: dId, to: eId, label: 'false' });
        const elseOut = visitBlock(stmt.else, [eId]);
        return [...thenOut, ...elseOut];
      }
      case 'loop': {
        const id = nextId('loop');
        nodes.push({ id, label: stmt.rawText.slice(0, 30) + '…', kind: 'loop', line: stmt.line });
        linkPrev(prev, id);
        return [id];
      }
      case 'block':
        return visitBlock(stmt.body, prev);
      case 'try': {
        const tId = nextId('process');
        nodes.push({ id: tId, label: 'try', kind: 'process', line: stmt.line });
        linkPrev(prev, tId);
        const tryOut = visitBlock(stmt.body, [tId]);
        if (!stmt.catch) return tryOut;
        const cId = nextId('error');
        nodes.push({ id: cId, label: 'catch', kind: 'error', line: stmt.line });
        edges.push({ from: tId, to: cId, label: 'error' });
        const catchOut = visitBlock(stmt.catch, [cId]);
        return [...tryOut, ...catchOut];
      }
      case 'return': {
        const id = nextId('return');
        nodes.push({
          id,
          label: stmt.exprText ? `return ${stmt.exprText.slice(0, 30)}` : 'return',
          kind: 'return',
          line: stmt.line,
        });
        linkPrev(prev, id);
        edges.push({ from: id, to: endId });
        return [];
      }
      case 'throw': {
        const id = nextId('error');
        nodes.push({ id, label: `throw ${stmt.exprText.slice(0, 30)}`, kind: 'error', line: stmt.line });
        linkPrev(prev, id);
        edges.push({ from: id, to: endId });
        return [];
      }
      default: {
        const id = nextId('process');
        nodes.push({ id, label: stmt.label.slice(0, 40), kind: 'process', line: stmt.line });
        linkPrev(prev, id);
        return [id];
      }
    }
  };

  const lastIds = visitBlock(cfg.body, [startId]);
  for (const id of lastIds) edges.push({ from: id, to: endId });
  return { nodes, edges };
}

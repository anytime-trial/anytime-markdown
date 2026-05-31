import {
  ExportExtractor,
  FlowAnalyzer,
  SequenceAnalyzer,
  createSourceFile,
  findFunctionNode,
} from '@anytime-markdown/trail-core/analyzer';
import type { C4Model } from '@anytime-markdown/trail-core/c4';
import type { TrailGraph } from '@anytime-markdown/trail-core';
import type { C4SourceAnalyzeRequest, C4SourceAnalyzeResult } from './analyzeChildProtocol';

const EMPTY_FLOW = { nodes: [], edges: [] };

/**
 * 対話的ソース解析（exports/flowchart/sequence）を実行する純粋関数。typescript（analyzer）に
 * 依存するため analyze-child でのみ bundle され、daemon からは排除される。
 *
 * TrailDataServer の旧ハンドラ内ロジック（createSourceFile + ExportExtractor /
 * FlowAnalyzer / SequenceAnalyzer）を移設したもの。挙動を変えないこと。
 */
export function c4SourceAnalyze(req: C4SourceAnalyzeRequest): C4SourceAnalyzeResult {
  switch (req.kind) {
    case 'exports': {
      const sfs = req.files.map((f) => createSourceFile(f.filePath, f.content));
      return { kind: 'exports', symbols: ExportExtractor.extract(sfs, req.componentId) };
    }
    case 'flowchartControl': {
      const sfs = req.files.map((f) => createSourceFile(f.filePath, f.content));
      const targetSf = sfs.find((sf) => sf.fileName === req.filePart);
      if (!targetSf) return { kind: 'flowchart', graph: EMPTY_FLOW };
      const funcNode = findFunctionNode(targetSf, req.funcName);
      if (!funcNode) return { kind: 'flowchart', graph: EMPTY_FLOW };
      return { kind: 'flowchart', graph: FlowAnalyzer.buildControlFlow(targetSf, funcNode) };
    }
    case 'flowchartCall': {
      const sfs = req.files.map((f) => createSourceFile(f.filePath, f.content));
      return { kind: 'flowchart', graph: FlowAnalyzer.buildCallGraph(sfs, req.symbolId) };
    }
    case 'sequence': {
      const sfMap = new Map(req.files.map((f) => [f.filePath, createSourceFile(f.filePath, f.content)] as const));
      const model = SequenceAnalyzer.build(
        req.elementId,
        req.model as C4Model,
        req.graph as TrailGraph,
        sfMap,
      );
      return { kind: 'sequence', model };
    }
  }
}

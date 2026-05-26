import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { computeAnalysis } from './computeAnalysis';
import type { AnalyzeChildMessage, AnalyzeHostMessage } from './analyzeChildProtocol';

function send(msg: AnalyzeChildMessage): void {
  process.send?.(msg);
}

process.on('message', (raw: AnalyzeHostMessage) => {
  if (raw?.type !== 'analyze') return;
  void run(raw);
});

async function run(msg: Extract<AnalyzeHostMessage, { type: 'analyze' }>): Promise<void> {
  try {
    const result = await computeAnalysis(msg.request, (phase, percent) =>
      send({ type: 'progress', phase, percent }),
    );
    const resultPath = path.join(os.tmpdir(), `analyze-result-${process.pid}-${Date.now()}.json`);
    fs.writeFileSync(resultPath, JSON.stringify(result));
    send({ type: 'result', resultPath });
    process.exit(0);
  } catch (err) {
    send({
      type: 'error',
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    process.exit(1);
  }
}

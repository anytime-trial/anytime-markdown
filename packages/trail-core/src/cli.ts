import path from 'node:path';
import fs from 'node:fs';
import { analyze } from './analyze';
import { toCytoscape } from './transform/toCytoscape';
import { getTrailStylesheet } from './transform/trailStylesheet';
import { toMermaid } from './transform/toMermaid';

interface CliArgs {
  tsconfigPath: string;
  output: string;
  exclude: string[];
  includeTests: boolean;
  format: 'cytoscape' | 'mermaid';
  granularity: 'module' | 'symbol';
  direction: 'TD' | 'LR';
}

function parseArgs(argv: string[]): CliArgs {
  const args = argv.slice(2);
  let tsconfigPath = './tsconfig.json';
  let output = '';
  const exclude: string[] = [];
  let includeTests = false;
  let format: 'cytoscape' | 'mermaid' = 'cytoscape';
  let granularity: 'module' | 'symbol' = 'module';
  let direction: 'TD' | 'LR' = 'TD';

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--tsconfig':
        tsconfigPath = args[++i];
        break;
      case '--output':
        output = args[++i];
        break;
      case '--exclude':
        exclude.push(args[++i]);
        break;
      case '--include-tests':
        includeTests = true;
        break;
      case '--format':
        format = args[++i] as 'cytoscape' | 'mermaid';
        break;
      case '--granularity':
        granularity = args[++i] as 'module' | 'symbol';
        break;
      case '--direction':
        direction = args[++i] as 'TD' | 'LR';
        break;
      case 'analyze':
      case 'mda':
        break;
      default:
        console.error(`Unknown argument: ${args[i]}`);
        process.exit(1);
    }
  }

  if (!output) {
    output = format === 'mermaid' ? './trail.md' : './trail.json';
  }

  return { tsconfigPath, output, exclude, includeTests, format, granularity, direction };
}

function main(): void {
  const args = parseArgs(process.argv);
  const absoluteTsconfig = path.resolve(args.tsconfigPath);

  if (!fs.existsSync(absoluteTsconfig)) {
    console.error(`tsconfig not found: ${absoluteTsconfig}`);
    process.exit(1);
  }

  console.log(`Module Dependency Analysis: ${absoluteTsconfig}`);

  const graph = analyze({
    tsconfigPath: absoluteTsconfig,
    exclude: args.exclude,
    includeTests: args.includeTests,
  });

  const outputPath = path.resolve(args.output);

  if (args.format === 'mermaid') {
    const mermaid = toMermaid(graph, {
      granularity: args.granularity,
      direction: args.direction,
    });
    fs.writeFileSync(outputPath, mermaid, 'utf-8');
  } else {
    const elements = toCytoscape(graph);
    const stylesheet = getTrailStylesheet();
    const result = { elements, stylesheet, metadata: graph.metadata };
    fs.writeFileSync(outputPath, JSON.stringify(result, null, 2), 'utf-8');
  }

  console.log(
    `Done: ${graph.metadata.fileCount} files, ` +
    `${graph.nodes.length} nodes, ${graph.edges.length} edges`,
  );
  console.log(`Output: ${outputPath}`);
}

main();

import path from 'node:path';
import fs from 'node:fs';
import { analyze } from './analyze';
import { toCytoscape } from './transform/toCytoscape';
import { getTrailStylesheet } from './transform/trailStylesheet';
import { toMermaid } from './transform/toMermaid';

export interface CliArgs {
  tsconfigPath: string;
  output: string;
  exclude: string[];
  includeTests: boolean;
  format: 'cytoscape' | 'mermaid';
}

const VALID_FORMATS = ['cytoscape', 'mermaid'] as const;
const AVAILABLE_OPTIONS = '--tsconfig, --output, --exclude, --include-tests, --format, --help';

function showHelp(): void {
  console.log(`Usage: trail [options]

Options:
  --tsconfig <path>   Path to tsconfig.json (default: ./tsconfig.json)
  --output <path>     Output file path (default: ./trail.json or ./trail.md)
  --exclude <pattern> Glob pattern to exclude (can be repeated)
  --include-tests     Include test files in analysis
  --format <type>     Output format: cytoscape, mermaid (default: cytoscape)
  -h, --help          Show this help message

Examples:
  trail --tsconfig ./tsconfig.json --format mermaid
  trail --exclude "src/generated/**" --exclude "src/__tests__/**"
  trail --format cytoscape --output ./dependency-graph.json`);
}

export function parseArgs(argv: string[]): CliArgs {
  const args = argv.slice(2);
  let tsconfigPath = './tsconfig.json';
  let output = '';
  const exclude: string[] = [];
  let includeTests = false;
  let format: 'cytoscape' | 'mermaid' = 'cytoscape';

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--help':
      case '-h':
        showHelp();
        process.exit(0);
        break;
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
      case '--format': {
        const value = args[++i];
        if (!VALID_FORMATS.includes(value as typeof VALID_FORMATS[number])) {
          console.error(`Invalid format: ${value}. Valid: cytoscape, mermaid`);
          process.exit(1);
        }
        format = value as 'cytoscape' | 'mermaid';
        break;
      }
      case 'analyze':
      case 'mda':
        break;
      default:
        console.error(`Unknown argument: ${args[i]}\nAvailable options: ${AVAILABLE_OPTIONS}`);
        process.exit(1);
    }
  }

  if (!output) {
    output = format === 'mermaid' ? './trail.md' : './trail.json';
  }

  return { tsconfigPath, output, exclude, includeTests, format };
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
    const mermaid = toMermaid(graph);
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

/* istanbul ignore next -- CLI entry point */
if (require.main === module) {
  main();
}

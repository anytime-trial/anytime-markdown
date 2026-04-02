import type { ElementDefinition, StylesheetJsonBlock } from 'cytoscape';

// ---------------------------------------------------------------------------
// Default StylesheetJsonBlock (Dracula-inspired palette)
// ---------------------------------------------------------------------------

export const defaultStylesheetJsonBlock: StylesheetJsonBlock[] = [
  {
    selector: 'node',
    style: {
      'background-color': '#6272a4',
      label: 'data(label)',
      color: '#f8f8f2',
      'font-size': 12,
      width: 40,
      height: 40,
      'text-valign': 'center',
      'text-halign': 'center',
      'text-wrap': 'wrap',
      'text-max-width': '80px',
    },
  },
  {
    selector: 'edge',
    style: {
      'line-color': '#bd93f9',
      'target-arrow-color': '#bd93f9',
      'target-arrow-shape': 'triangle',
      'curve-style': 'bezier',
      width: 2,
    },
  },
  {
    selector: ':selected',
    style: {
      'background-color': '#ff79c6',
      'line-color': '#ff79c6',
      'target-arrow-color': '#ff79c6',
    },
  },
];

// ---------------------------------------------------------------------------
// 1. Social Network (25 nodes, 35 edges)
// ---------------------------------------------------------------------------

const socialNodes: ElementDefinition[] = [
  // Engineering
  { data: { id: 'alice', label: 'Alice', group: 'engineering' } },
  { data: { id: 'bob', label: 'Bob', group: 'engineering' } },
  { data: { id: 'carol', label: 'Carol', group: 'engineering' } },
  { data: { id: 'dave', label: 'Dave', group: 'engineering' } },
  { data: { id: 'eve', label: 'Eve', group: 'engineering' } },
  { data: { id: 'frank', label: 'Frank', group: 'engineering' } },
  { data: { id: 'grace', label: 'Grace', group: 'engineering' } },
  // Design
  { data: { id: 'heidi', label: 'Heidi', group: 'design' } },
  { data: { id: 'ivan', label: 'Ivan', group: 'design' } },
  { data: { id: 'judy', label: 'Judy', group: 'design' } },
  { data: { id: 'karl', label: 'Karl', group: 'design' } },
  { data: { id: 'lily', label: 'Lily', group: 'design' } },
  // Marketing
  { data: { id: 'mike', label: 'Mike', group: 'marketing' } },
  { data: { id: 'nina', label: 'Nina', group: 'marketing' } },
  { data: { id: 'oscar', label: 'Oscar', group: 'marketing' } },
  { data: { id: 'pat', label: 'Pat', group: 'marketing' } },
  { data: { id: 'quinn', label: 'Quinn', group: 'marketing' } },
  { data: { id: 'rosa', label: 'Rosa', group: 'marketing' } },
  // Management
  { data: { id: 'sam', label: 'Sam', group: 'management' } },
  { data: { id: 'tina', label: 'Tina', group: 'management' } },
  { data: { id: 'uma', label: 'Uma', group: 'management' } },
  { data: { id: 'vic', label: 'Vic', group: 'management' } },
  { data: { id: 'wendy', label: 'Wendy', group: 'management' } },
  { data: { id: 'xander', label: 'Xander', group: 'management' } },
  { data: { id: 'yuki', label: 'Yuki', group: 'management' } },
];

const socialEdges: ElementDefinition[] = [
  { data: { source: 'alice', target: 'bob', weight: 5 } },
  { data: { source: 'alice', target: 'carol', weight: 3 } },
  { data: { source: 'bob', target: 'dave', weight: 4 } },
  { data: { source: 'carol', target: 'eve', weight: 2 } },
  { data: { source: 'dave', target: 'frank', weight: 5 } },
  { data: { source: 'eve', target: 'grace', weight: 3 } },
  { data: { source: 'frank', target: 'alice', weight: 4 } },
  { data: { source: 'grace', target: 'bob', weight: 2 } },
  { data: { source: 'heidi', target: 'ivan', weight: 5 } },
  { data: { source: 'ivan', target: 'judy', weight: 4 } },
  { data: { source: 'judy', target: 'karl', weight: 3 } },
  { data: { source: 'karl', target: 'lily', weight: 5 } },
  { data: { source: 'lily', target: 'heidi', weight: 2 } },
  { data: { source: 'mike', target: 'nina', weight: 4 } },
  { data: { source: 'nina', target: 'oscar', weight: 3 } },
  { data: { source: 'oscar', target: 'pat', weight: 5 } },
  { data: { source: 'pat', target: 'quinn', weight: 2 } },
  { data: { source: 'quinn', target: 'rosa', weight: 4 } },
  { data: { source: 'rosa', target: 'mike', weight: 3 } },
  { data: { source: 'sam', target: 'tina', weight: 5 } },
  { data: { source: 'tina', target: 'uma', weight: 4 } },
  { data: { source: 'uma', target: 'vic', weight: 3 } },
  { data: { source: 'vic', target: 'wendy', weight: 5 } },
  { data: { source: 'wendy', target: 'xander', weight: 2 } },
  { data: { source: 'xander', target: 'yuki', weight: 4 } },
  { data: { source: 'yuki', target: 'sam', weight: 3 } },
  // Cross-group connections
  { data: { source: 'alice', target: 'heidi', weight: 2 } },
  { data: { source: 'bob', target: 'mike', weight: 1 } },
  { data: { source: 'carol', target: 'sam', weight: 3 } },
  { data: { source: 'heidi', target: 'nina', weight: 2 } },
  { data: { source: 'ivan', target: 'tina', weight: 1 } },
  { data: { source: 'mike', target: 'uma', weight: 2 } },
  { data: { source: 'dave', target: 'judy', weight: 1 } },
  { data: { source: 'frank', target: 'oscar', weight: 2 } },
  { data: { source: 'grace', target: 'vic', weight: 1 } },
];

export const socialNetworkData: ElementDefinition[] = [...socialNodes, ...socialEdges];

// ---------------------------------------------------------------------------
// 2. Org Chart (18 nodes, hierarchical tree)
// ---------------------------------------------------------------------------

const orgNodes: ElementDefinition[] = [
  { data: { id: 'ceo', label: 'CEO' } },
  { data: { id: 'cto', label: 'CTO' } },
  { data: { id: 'cfo', label: 'CFO' } },
  { data: { id: 'cmo', label: 'CMO' } },
  { data: { id: 'vp-eng', label: 'VP Eng' } },
  { data: { id: 'vp-infra', label: 'VP Infra' } },
  { data: { id: 'vp-finance', label: 'VP Finance' } },
  { data: { id: 'vp-hr', label: 'VP HR' } },
  { data: { id: 'vp-sales', label: 'VP Sales' } },
  { data: { id: 'vp-brand', label: 'VP Brand' } },
  { data: { id: 'lead-fe', label: 'FE Lead' } },
  { data: { id: 'lead-be', label: 'BE Lead' } },
  { data: { id: 'lead-sre', label: 'SRE Lead' } },
  { data: { id: 'lead-sec', label: 'Sec Lead' } },
  { data: { id: 'acct-mgr', label: 'Acct Mgr' } },
  { data: { id: 'controller', label: 'Controller' } },
  { data: { id: 'sales-mgr', label: 'Sales Mgr' } },
  { data: { id: 'brand-mgr', label: 'Brand Mgr' } },
];

const orgEdges: ElementDefinition[] = [
  { data: { source: 'ceo', target: 'cto' } },
  { data: { source: 'ceo', target: 'cfo' } },
  { data: { source: 'ceo', target: 'cmo' } },
  { data: { source: 'cto', target: 'vp-eng' } },
  { data: { source: 'cto', target: 'vp-infra' } },
  { data: { source: 'cfo', target: 'vp-finance' } },
  { data: { source: 'cfo', target: 'vp-hr' } },
  { data: { source: 'cmo', target: 'vp-sales' } },
  { data: { source: 'cmo', target: 'vp-brand' } },
  { data: { source: 'vp-eng', target: 'lead-fe' } },
  { data: { source: 'vp-eng', target: 'lead-be' } },
  { data: { source: 'vp-infra', target: 'lead-sre' } },
  { data: { source: 'vp-infra', target: 'lead-sec' } },
  { data: { source: 'vp-finance', target: 'acct-mgr' } },
  { data: { source: 'vp-finance', target: 'controller' } },
  { data: { source: 'vp-sales', target: 'sales-mgr' } },
  { data: { source: 'vp-brand', target: 'brand-mgr' } },
];

export const orgChartData: ElementDefinition[] = [...orgNodes, ...orgEdges];

// ---------------------------------------------------------------------------
// 3. Flow Chart — CI/CD Pipeline (14 nodes, directed flow)
// ---------------------------------------------------------------------------

const flowNodes: ElementDefinition[] = [
  { data: { id: 'commit', label: 'Commit' } },
  { data: { id: 'lint', label: 'Lint' } },
  { data: { id: 'typecheck', label: 'Type Check' } },
  { data: { id: 'unit-test', label: 'Unit Test' } },
  { data: { id: 'build', label: 'Build' } },
  { data: { id: 'e2e', label: 'E2E Test' } },
  { data: { id: 'security', label: 'Security Scan' } },
  { data: { id: 'docker', label: 'Docker Build' } },
  { data: { id: 'staging', label: 'Deploy Staging' } },
  { data: { id: 'smoke', label: 'Smoke Test' } },
  { data: { id: 'approval', label: 'Approval' } },
  { data: { id: 'production', label: 'Deploy Prod' } },
  { data: { id: 'monitor', label: 'Monitor' } },
  { data: { id: 'rollback', label: 'Rollback' } },
];

const flowEdges: ElementDefinition[] = [
  { data: { source: 'commit', target: 'lint' } },
  { data: { source: 'commit', target: 'typecheck' } },
  { data: { source: 'lint', target: 'unit-test' } },
  { data: { source: 'typecheck', target: 'unit-test' } },
  { data: { source: 'unit-test', target: 'build' } },
  { data: { source: 'build', target: 'e2e' } },
  { data: { source: 'build', target: 'security' } },
  { data: { source: 'e2e', target: 'docker' } },
  { data: { source: 'security', target: 'docker' } },
  { data: { source: 'docker', target: 'staging' } },
  { data: { source: 'staging', target: 'smoke' } },
  { data: { source: 'smoke', target: 'approval' } },
  { data: { source: 'approval', target: 'production' } },
  { data: { source: 'production', target: 'monitor' } },
  { data: { source: 'monitor', target: 'rollback' } },
];

export const flowChartData: ElementDefinition[] = [...flowNodes, ...flowEdges];

// ---------------------------------------------------------------------------
// 4. Dependency Graph — Package dependencies (18 nodes)
// ---------------------------------------------------------------------------

const depNodes: ElementDefinition[] = [
  { data: { id: 'app', label: '@app/web' } },
  { data: { id: 'ui', label: '@app/ui' } },
  { data: { id: 'core', label: '@app/core' } },
  { data: { id: 'auth', label: '@app/auth' } },
  { data: { id: 'api', label: '@app/api' } },
  { data: { id: 'db', label: '@app/db' } },
  { data: { id: 'config', label: '@app/config' } },
  { data: { id: 'logger', label: '@app/logger' } },
  { data: { id: 'utils', label: '@app/utils' } },
  { data: { id: 'react', label: 'react' } },
  { data: { id: 'next', label: 'next' } },
  { data: { id: 'prisma', label: 'prisma' } },
  { data: { id: 'zod', label: 'zod' } },
  { data: { id: 'trpc', label: 'trpc' } },
  { data: { id: 'redis', label: 'ioredis' } },
  { data: { id: 'jose', label: 'jose' } },
  { data: { id: 'pino', label: 'pino' } },
  { data: { id: 'dotenv', label: 'dotenv' } },
];

const depEdges: ElementDefinition[] = [
  { data: { source: 'app', target: 'ui' } },
  { data: { source: 'app', target: 'core' } },
  { data: { source: 'app', target: 'auth' } },
  { data: { source: 'app', target: 'next' } },
  { data: { source: 'app', target: 'react' } },
  { data: { source: 'ui', target: 'react' } },
  { data: { source: 'ui', target: 'utils' } },
  { data: { source: 'core', target: 'api' } },
  { data: { source: 'core', target: 'zod' } },
  { data: { source: 'core', target: 'utils' } },
  { data: { source: 'auth', target: 'jose' } },
  { data: { source: 'auth', target: 'db' } },
  { data: { source: 'auth', target: 'config' } },
  { data: { source: 'api', target: 'trpc' } },
  { data: { source: 'api', target: 'db' } },
  { data: { source: 'api', target: 'zod' } },
  { data: { source: 'db', target: 'prisma' } },
  { data: { source: 'db', target: 'redis' } },
  { data: { source: 'db', target: 'config' } },
  { data: { source: 'config', target: 'dotenv' } },
  { data: { source: 'config', target: 'zod' } },
  { data: { source: 'logger', target: 'pino' } },
  { data: { source: 'logger', target: 'config' } },
  { data: { source: 'utils', target: 'zod' } },
];

export const dependencyGraphData: ElementDefinition[] = [...depNodes, ...depEdges];

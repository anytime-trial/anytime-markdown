// noop shim for Node 'fs'/'path'/'crypto' so sql.js dist can be bundled by Turbopack.
// sql.js gates these requires behind `if (ca)` Node detection at runtime, so the
// imports are dead code in the browser; we just need them to resolve to *something*.
export default {};

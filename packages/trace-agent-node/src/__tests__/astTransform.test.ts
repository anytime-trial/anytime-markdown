import { instrumentCode } from '../astTransform';

describe('instrumentCode', () => {
    it('wraps a simple function declaration', () => {
        const src = `function foo(a) { return a + 1; }`;
        const out = instrumentCode(src, 'src/foo.js');
        expect(out).toContain('__traceEnter');
        expect(out).toContain('__traceExit');
        expect(out).toContain('__traceThrow');
    });

    it('wraps an arrow function expression in variable declaration', () => {
        const src = `const bar = (x) => x * 2;`;
        const out = instrumentCode(src, 'src/bar.js');
        expect(out).toContain('__traceEnter');
    });

    it('handles TypeScript syntax without throwing', () => {
        const src = `function greet(name: string): string { return 'hi ' + name; }`;
        const out = instrumentCode(src, 'src/greet.ts');
        // TypeScript stripping is done by ts-node/SWC upstream; instrumentCode preserves TS syntax
        expect(out).toContain('__traceEnter');
        expect(out).toContain('greet');
    });

    it('injects preamble require at the top', () => {
        const src = `function noop() {}`;
        const out = instrumentCode(src, 'src/noop.js');
        expect(out).toMatch(/require.*trace-agent-node.*runtime/);
    });

    it('does not throw on empty source', () => {
        expect(() => instrumentCode('', 'src/empty.js')).not.toThrow();
    });

    // Lines 26-29: FunctionExpression and ObjectMethod handlers
    it('wraps a function expression assigned to a variable (line 26-29)', () => {
        const src = `const obj = { method: function named(a, b) { return a + b; } };`;
        const out = instrumentCode(src, 'src/obj.js');
        expect(out).toContain('__traceEnter');
        expect(out).toContain('named');
    });

    it('wraps an object method (ObjectMethod handler line 28)', () => {
        const src = `const obj = { greet(name) { return 'hi ' + name; } };`;
        const out = instrumentCode(src, 'src/obj.js');
        expect(out).toContain('__traceEnter');
        expect(out).toContain('greet');
    });

    // Lines 61-64: parameter extraction for AssignmentPattern, RestElement, TSParameterProperty
    it('handles default parameter (AssignmentPattern) in instrumented code (line 61)', () => {
        const src = `function withDefault(a = 5) { return a; }`;
        const out = instrumentCode(src, 'src/def.js');
        expect(out).toContain('__traceEnter');
    });

    it('handles rest parameters (RestElement) in instrumented code (line 62)', () => {
        const src = `function withRest(a, ...rest) { return rest; }`;
        const out = instrumentCode(src, 'src/rest.js');
        expect(out).toContain('__traceEnter');
    });

    it('handles TypeScript constructor param properties (TSParameterProperty) (line 63)', () => {
        const src = `class Foo { constructor(public name: string) { } }`;
        const out = instrumentCode(src, 'src/foo.ts');
        // TSParameterProperty params → extracted as identifier
        expect(out).toContain('__traceEnter');
    });

    // Lines 102-103: wrapReturnsInBlock when IfStatement has alternate
    it('wraps return inside if-else alternate branch (lines 102-103)', () => {
        const src = `function check(x) { if (x > 0) { return 1; } else { return -1; } }`;
        const out = instrumentCode(src, 'src/check.js');
        expect(out).toContain('__traceEnter');
        expect(out).toContain('__traceExit');
    });

    it('returns original code for ESM modules (sourceType === module)', () => {
        const src = `export function esm(x) { return x; }`;
        const out = instrumentCode(src, 'src/esm.js');
        // ESM files skip instrumentation — code is returned unchanged (no preamble)
        expect(out).toBe(src);
    });

    it('handles arrow function with block body (no expression body conversion)', () => {
        const src = `const fn = (a, b) => { const c = a + b; return c; };`;
        const out = instrumentCode(src, 'src/fn.js');
        expect(out).toContain('__traceEnter');
    });

    it('handles destructured parameter (fallthrough to _ placeholder, line 64)', () => {
        // Destructured params like { a, b } are ObjectPattern, not Identifier/Assignment/Rest/TSProp
        // This triggers the fallthrough `return t.identifier('_')` at line 64
        const src = `function withDestructure({ a, b }) { return a + b; }`;
        const out = instrumentCode(src, 'src/dest.js');
        expect(out).toContain('__traceEnter');
        expect(out).toContain('_');
    });
});

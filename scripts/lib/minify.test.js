import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { minifyCss, minifyJs } from './minify.js';

function checkSyntax(code) {
  execFileSync(process.execPath, ['--input-type=module', '--check', '-'], { input: code });
}

function braceCount(s) {
  return (s.match(/\{/g) || []).length;
}

// --- minifyCss ---------------------------------------------------------

test('minifyCss strips block comments', () => {
  assert.equal(minifyCss('/* hi */ .a { color: red; }'), '.a{color:red}');
});

test('minifyCss collapses whitespace runs to nothing at structural punctuation', () => {
  const input = '.a  ,  .b {\n  color : red ;\n  margin : 0 ;\n}';
  assert.equal(minifyCss(input), '.a,.b{color:red;margin:0}');
});

test('minifyCss drops a trailing semicolon before a closing brace', () => {
  assert.equal(minifyCss('.a { color: red; }'), '.a{color:red}');
});

test('minifyCss preserves string content verbatim, including punctuation inside it', () => {
  assert.equal(
    minifyCss('.a { font-family: "Foo , Bar" ; }'),
    '.a{font-family:"Foo , Bar"}',
  );
});

test('minifyCss does not touch a comment-like sequence inside a string', () => {
  assert.equal(minifyCss('.a { content: "/* not a comment */" ; }'), '.a{content:"/* not a comment */"}');
});

test('minifyCss handles an escaped quote inside a string', () => {
  assert.equal(minifyCss(".a { content: 'it\\'s' ; }"), ".a{content:'it\\'s'}");
});

test('minifyCss preserves mandatory spaces around calc() operators', () => {
  assert.equal(minifyCss('.a { width: calc(100% - 20px) ; }'), '.a{width:calc(100% - 20px)}');
});

test('minifyCss preserves selector-combinator spaces', () => {
  assert.equal(minifyCss('.a > .b + .c ~ .d { color: red; }'), '.a > .b + .c ~ .d{color:red}');
});

// --- minifyJs: comment stripping ----------------------------------------

test('minifyJs strips line comments', () => {
  assert.equal(minifyJs('const x = 1; // comment\nconst y = 2;'), 'const x = 1;\nconst y = 2;');
});

test('minifyJs strips block comments and replaces them with a separating space', () => {
  assert.equal(minifyJs('return/*x*/5;'), 'return 5;');
});

test('minifyJs strips per-line leading/trailing whitespace and drops empty lines', () => {
  const input = 'function f() {\n\n  const x = 1;\n\n  return x;\n}\n';
  assert.equal(minifyJs(input), 'function f() {\nconst x = 1;\nreturn x;\n}');
});

test('minifyJs is idempotent', () => {
  const input = '  const x = 1; // a\n\n  /* b */ const y = 2;\n';
  const once = minifyJs(input);
  assert.equal(minifyJs(once), once);
});

// --- minifyJs: the regex-vs-division lexer hazard ------------------------

test('minifyJs preserves a real regex literal (the actual app.js case)', () => {
  const input = "x.replace(/\\d+/, 'a');";
  assert.equal(minifyJs(input), input);
});

test('minifyJs preserves a slash inside a regex character class', () => {
  const input = 'const r = /[/]/;';
  assert.equal(minifyJs(input), input);
});

test('minifyJs treats consecutive slashes after an identifier as division, not a regex', () => {
  const input = 'const q = a / b / c;';
  assert.equal(minifyJs(input), input);
});

test('minifyJs does not treat "//" inside a single-quoted string as a comment', () => {
  const input = "const s = '// not a comment';";
  assert.equal(minifyJs(input), input);
});

test('minifyJs does not treat "/*" inside a double-quoted string as a comment', () => {
  const input = 'const s = "/* not a comment */";';
  assert.equal(minifyJs(input), input);
});

test('minifyJs does not treat comment-like text inside a template literal as a comment', () => {
  const input = 'const t = `a/*b*/c`;';
  assert.equal(minifyJs(input), input);
});

test('minifyJs does not treat a line comment inside a template interpolation as literal text, and does strip it as a real comment', () => {
  const input = 'const t = `x ${ y // z\n }`;';
  // The `// z` is genuine JS inside ${ }, so it IS a real comment and must be stripped;
  // the template body text itself ("x " and the trailing " ") must survive untouched.
  const result = minifyJs(input);
  assert.ok(!result.includes('// z'), 'the real comment inside ${ } must be stripped');
  assert.ok(result.startsWith('const t = `x ${'), 'template body prefix must survive');
  assert.ok(result.endsWith('}`;'), 'template body suffix must survive');
});

test('minifyJs does not treat an escaped slash inside a string as ending anything early', () => {
  const input = "s.split('\\\\/');";
  assert.equal(minifyJs(input), input);
});

test('minifyJs handles the real app.js template literals unchanged', () => {
  const cases = [
    "counterEl.innerHTML = groups.map((g) => `<span>${g}</span>`).join('');",
    'await navigator.clipboard.writeText(`${shareText} ${shareUrl}`);',
    "if (!res.ok) throw new Error(`state.json ${res.status}`);",
  ];
  for (const c of cases) assert.equal(minifyJs(c), c);
});

test('minifyJs does not corrupt a multi-line template literal\'s internal blank line', () => {
  const input = 'const t = `line1\n\nline3`;';
  assert.equal(minifyJs(input), input);
});

// --- minifyJs: output must remain valid JS -------------------------------

test('minifyJs output parses as valid ESM (real app.js-shaped snippet)', () => {
  const snippet = `
    // header comment
    import { a, b } from './counter.js';

    /* block
       comment */
    function greet(name) {
      // inline
      return \`Hello, \${name}!\`;
    }

    const re = /\\d+/;
    const div = 10 / 2;
    export { greet };
  `;
  const minified = minifyJs(snippet);
  assert.doesNotThrow(() => checkSyntax(minified));
});

test('minifyCss output has the same brace count as a small synthetic stylesheet', () => {
  const css = `
    /* header */
    .a, .b {
      color: red; /* trailing */
      margin: 0;
    }
    .c > .d + .e ~ .f {
      width: calc(100% - 10px);
    }
  `;
  assert.equal(braceCount(minifyCss(css)), braceCount(css));
});

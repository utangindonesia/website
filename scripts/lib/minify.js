// Hand-rolled CSS/JS minifiers. No AST, no dependency, no mangling — see
// CLAUDE.md's "zero npm packages" rule. Comment + whitespace stripping only.
// Pure functions, no I/O — same shape as the rest of scripts/lib/.

const REGEX_PRECEDING_PUNCT = new Set('(,=:[!&|?{};+-*%~^<>'.split(''));
const REGEX_PRECEDING_KEYWORDS = new Set([
  'return', 'typeof', 'case', 'in', 'of', 'new', 'delete', 'void',
  'instanceof', 'do', 'else', 'yield', 'await',
]);

/**
 * Character-scanner CSS minifier: strips /* comments *\/, collapses
 * whitespace runs, and removes whitespace immediately touching structural
 * punctuation ({ } ; : ,), plus a trailing ; right before }.
 *
 * Deliberately leaves whitespace around + - * / > ~ alone: those are
 * selector combinators, but also calc() operators, where the spaces are
 * mandatory (`calc(100% - 20px)` breaks as `calc(100%-20px)`). Costs a
 * handful of bytes; removes a whole class of future footgun.
 *
 * @param {string} source
 * @returns {string}
 */
export function minifyCss(source) {
  const out = [];
  const n = source.length;
  let i = 0;
  let pendingSpace = false;

  const flushPendingSpace = (nextChar) => {
    if (!pendingSpace) return;
    pendingSpace = false;
    const prevChar = out[out.length - 1];
    const structural = '{};:,';
    if (prevChar !== undefined && structural.includes(prevChar)) return;
    if (structural.includes(nextChar)) return;
    out.push(' ');
  };

  while (i < n) {
    const c = source[i];

    if (c === '/' && source[i + 1] === '*') {
      i += 2;
      while (i < n && !(source[i] === '*' && source[i + 1] === '/')) i++;
      i += 2;
      if (out.length > 0) pendingSpace = true;
      continue;
    }

    if (c === '"' || c === "'") {
      flushPendingSpace(c);
      const quote = c;
      out.push(c);
      i++;
      while (i < n) {
        if (source[i] === '\\' && i + 1 < n) {
          out.push(source[i], source[i + 1]);
          i += 2;
          continue;
        }
        out.push(source[i]);
        const done = source[i] === quote;
        i++;
        if (done) break;
      }
      continue;
    }

    if (/\s/.test(c)) {
      while (i < n && /\s/.test(source[i])) i++;
      if (out.length > 0) pendingSpace = true;
      continue;
    }

    flushPendingSpace(c);
    if (c === '}' && out[out.length - 1] === ';') out.pop();
    out.push(c);
    i++;
  }

  return out.join('').trim();
}

/**
 * Strips // and /* comments *\/ from JS source, tracking string, template
 * literal (including nested ${ } interpolation), and regex-literal state so
 * a comment-like sequence inside any of those is never touched. Returns the
 * comment-free source plus a same-length boolean array marking which output
 * positions fall inside a template literal body (not inside its ${ }) — the
 * caller needs this to know which lines must never be whitespace-trimmed,
 * since a template literal's newlines and indentation are part of its value.
 *
 * Block comments are replaced with a single space (never removed outright)
 * so two tokens that only had a comment between them on the same line never
 * get glued into one (`return/*x*\/5` must not become `return5`). Line
 * comments are removed outright since a newline always follows them anyway.
 *
 * @param {string} source
 * @returns {{ text: string, inTemplate: boolean[] }}
 */
function stripJsComments(source) {
  const out = [];
  const inTemplate = [];
  const n = source.length;
  let i = 0;
  // Stack of open template literals. Each frame is either the literal string
  // 'template' (we're inside backtick text) or an object { braceDepth } (we're
  // inside a ${ ... } interpolation, tracking nested { } so the right one
  // closes the interpolation instead of some inner object literal's brace).
  const stack = [];

  const push = (ch, template) => {
    out.push(ch);
    inTemplate.push(template);
  };

  const regexAllowedHere = () => {
    let j = out.length - 1;
    while (j >= 0 && /\s/.test(out[j])) j--;
    if (j < 0) return true;
    const ch = out[j];
    if (REGEX_PRECEDING_PUNCT.has(ch)) return true;
    if (/[A-Za-z0-9_$]/.test(ch)) {
      let k = j;
      while (k >= 0 && /[A-Za-z0-9_$]/.test(out[k])) k--;
      const word = out.slice(k + 1, j + 1).join('');
      return REGEX_PRECEDING_KEYWORDS.has(word);
    }
    return false;
  };

  while (i < n) {
    const inTemplateBody = stack.length > 0 && stack[stack.length - 1] === 'template';

    if (inTemplateBody) {
      const c = source[i];
      if (c === '\\' && i + 1 < n) {
        push(c, true);
        push(source[i + 1], true);
        i += 2;
        continue;
      }
      if (c === '`') {
        stack.pop();
        push(c, false);
        i++;
        continue;
      }
      if (c === '$' && source[i + 1] === '{') {
        push('$', true);
        push('{', true);
        stack.push({ braceDepth: 0 });
        i += 2;
        continue;
      }
      push(c, true);
      i++;
      continue;
    }

    // Code context: top level, or inside a ${ } interpolation.
    const c = source[i];

    if (c === '/' && source[i + 1] === '/') {
      i += 2;
      while (i < n && source[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && source[i + 1] === '*') {
      i += 2;
      while (i < n && !(source[i] === '*' && source[i + 1] === '/')) i++;
      i += 2;
      push(' ', false);
      continue;
    }
    if (c === '"' || c === "'") {
      const quote = c;
      push(c, false);
      i++;
      while (i < n) {
        if (source[i] === '\\' && i + 1 < n) {
          push(source[i], false);
          push(source[i + 1], false);
          i += 2;
          continue;
        }
        const ch = source[i];
        push(ch, false);
        i++;
        if (ch === quote) break;
      }
      continue;
    }
    if (c === '`') {
      stack.push('template');
      push(c, false);
      i++;
      continue;
    }
    if (c === '/' && regexAllowedHere()) {
      push(c, false);
      i++;
      let inClass = false;
      while (i < n) {
        const ch = source[i];
        if (ch === '\\' && i + 1 < n) {
          push(ch, false);
          push(source[i + 1], false);
          i += 2;
          continue;
        }
        if (ch === '[') inClass = true;
        else if (ch === ']') inClass = false;
        push(ch, false);
        i++;
        if (ch === '/' && !inClass) break;
      }
      while (i < n && /[a-zA-Z]/.test(source[i])) {
        push(source[i], false);
        i++;
      }
      continue;
    }
    if (stack.length > 0 && c === '{') {
      stack[stack.length - 1].braceDepth++;
      push(c, false);
      i++;
      continue;
    }
    if (stack.length > 0 && c === '}') {
      if (stack[stack.length - 1].braceDepth === 0) {
        stack.pop(); // closes the ${ ... }, back to template-body mode
      } else {
        stack[stack.length - 1].braceDepth--;
      }
      push(c, false);
      i++;
      continue;
    }
    push(c, false);
    i++;
  }

  return { text: out.join(''), inTemplate };
}

/**
 * Deliberately narrow JS minifier: strips comments, then strips per-line
 * leading/trailing whitespace and drops empty lines — and keeps every
 * remaining newline. That last part is the safety guarantee: joining lines
 * requires correctly reasoning about automatic semicolon insertion (ASI),
 * which needs a real parser to get right (a bare `return` followed by a line
 * starting with `(`, `[`, a backtick, `+`, or `-` changes meaning if the
 * newline between them disappears). Preserving every newline means ASI
 * behaves identically to the source, so this transform is
 * semantics-preserving modulo comment removal. Never extend this toward
 * joining lines or renaming identifiers — that needs a real parser.
 *
 * Lines that are (partly) inside a template literal body are left completely
 * untouched, since a template literal's newlines and whitespace are part of
 * its runtime value, not source formatting.
 *
 * @param {string} source
 * @returns {string}
 */
export function minifyJs(source) {
  const { text, inTemplate } = stripJsComments(source);

  const lines = [];
  let lineStart = 0;
  let lineHasTemplateChar = false;
  for (let i = 0; i <= text.length; i++) {
    if (i === text.length || text[i] === '\n') {
      // A blank line entirely inside a multi-line template (no content
      // characters between two newlines) never sets lineHasTemplateChar via
      // the branch below, so also check the delimiting newline itself.
      const isTemplateLine = lineHasTemplateChar || (i < text.length && inTemplate[i]);
      const line = text.slice(lineStart, i);
      if (isTemplateLine) {
        lines.push(line);
      } else {
        const trimmed = line.trim();
        if (trimmed.length > 0) lines.push(trimmed);
      }
      lineStart = i + 1;
      lineHasTemplateChar = false;
    } else if (inTemplate[i]) {
      lineHasTemplateChar = true;
    }
  }

  return lines.join('\n');
}

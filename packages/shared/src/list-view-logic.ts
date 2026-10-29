export type FilterLogicAst =
  | { type: 'ref'; id: number }
  | { type: 'not'; item: FilterLogicAst }
  | { type: 'and' | 'or'; items: FilterLogicAst[] };

type Token = { type: 'AND' | 'OR' | 'NOT' | 'LPAREN' | 'RPAREN' | 'NUM'; value?: number };

const WORD = /^[A-Za-z]+/;

function tokenize(expression: string): { ok: true; tokens: Token[] } | { ok: false; error: string } {
  const tokens: Token[] = [];
  let index = 0;
  while (index < expression.length) {
    const char = expression[index];
    if (/\s/.test(char)) {
      index += 1;
      continue;
    }
    if (char === '(') {
      tokens.push({ type: 'LPAREN' });
      index += 1;
      continue;
    }
    if (char === ')') {
      tokens.push({ type: 'RPAREN' });
      index += 1;
      continue;
    }
    if (/\d/.test(char)) {
      let digits = '';
      while (index < expression.length && /\d/.test(expression[index])) {
        digits += expression[index];
        index += 1;
      }
      const value = Number(digits);
      if (!Number.isInteger(value) || value < 1 || value > 10) {
        return { ok: false, error: 'Filter logic row numbers must be between 1 and 10' };
      }
      tokens.push({ type: 'NUM', value });
      continue;
    }
    const word = WORD.exec(expression.slice(index));
    if (!word) return { ok: false, error: 'Filter logic can only use AND, OR, NOT, parentheses, and row numbers' };
    const operator = word[0].toUpperCase();
    if (operator !== 'AND' && operator !== 'OR' && operator !== 'NOT') {
      return { ok: false, error: 'Filter logic can only use AND, OR, NOT, parentheses, and row numbers' };
    }
    tokens.push({ type: operator });
    index += word[0].length;
  }
  return { ok: true, tokens };
}

function normalizeTokens(tokens: Token[]) {
  return tokens
    .map((token) => (token.type === 'NUM' ? String(token.value) : token.type === 'LPAREN' ? '(' : token.type === 'RPAREN' ? ')' : token.type))
    .join(' ')
    .replace(/\(\s+/g, '(')
    .replace(/\s+\)/g, ')');
}

class Parser {
  private position = 0;

  constructor(private readonly tokens: Token[]) {}

  parse(): { ok: true; ast: FilterLogicAst } | { ok: false; error: string } {
    if (this.tokens.length === 0) return { ok: false, error: 'Enter filter logic' };
    const ast = this.parseOr();
    if (!ast.ok) return ast;
    if (this.position !== this.tokens.length) return { ok: false, error: 'Filter logic has an unexpected value' };
    return ast;
  }

  private peek() {
    return this.tokens[this.position];
  }

  private parseOr(): { ok: true; ast: FilterLogicAst } | { ok: false; error: string } {
    const first = this.parseAnd();
    if (!first.ok) return first;
    const items = [first.ast];
    while (this.peek()?.type === 'OR') {
      this.position += 1;
      const next = this.parseAnd();
      if (!next.ok) return next;
      items.push(next.ast);
    }
    return { ok: true, ast: items.length === 1 ? items[0] : { type: 'or', items } };
  }

  private parseAnd(): { ok: true; ast: FilterLogicAst } | { ok: false; error: string } {
    const first = this.parseUnary();
    if (!first.ok) return first;
    const items = [first.ast];
    while (this.peek()?.type === 'AND') {
      this.position += 1;
      const next = this.parseUnary();
      if (!next.ok) return next;
      items.push(next.ast);
    }
    return { ok: true, ast: items.length === 1 ? items[0] : { type: 'and', items } };
  }

  private parseUnary(): { ok: true; ast: FilterLogicAst } | { ok: false; error: string } {
    if (this.peek()?.type === 'NOT') {
      this.position += 1;
      const item = this.parseUnary();
      if (!item.ok) return item;
      return { ok: true, ast: { type: 'not', item: item.ast } };
    }
    return this.parsePrimary();
  }

  private parsePrimary(): { ok: true; ast: FilterLogicAst } | { ok: false; error: string } {
    const token = this.peek();
    if (!token) return { ok: false, error: 'Filter logic is incomplete' };
    if (token.type === 'NUM') {
      this.position += 1;
      return { ok: true, ast: { type: 'ref', id: token.value || 0 } };
    }
    if (token.type === 'LPAREN') {
      this.position += 1;
      const inner = this.parseOr();
      if (!inner.ok) return inner;
      if (this.peek()?.type !== 'RPAREN') return { ok: false, error: 'Filter logic has unbalanced parentheses' };
      this.position += 1;
      return inner;
    }
    if (token.type === 'RPAREN') return { ok: false, error: 'Filter logic has unbalanced parentheses' };
    return { ok: false, error: 'Filter logic is incomplete' };
  }
}

function referencedIds(ast: FilterLogicAst, ids: number[]) {
  if (ast.type === 'ref') ids.push(ast.id);
  else if (ast.type === 'not') referencedIds(ast.item, ids);
  else ast.items.forEach((item) => referencedIds(item, ids));
}

export function parseFilterLogic(expression: string, rowIds: number[]): { ok: true; normalized: string; ast: FilterLogicAst } | { ok: false; error: string } {
  const tokenized = tokenize(expression);
  if (!tokenized.ok) return tokenized;
  let depth = 0;
  for (const token of tokenized.tokens) {
    if (token.type === 'LPAREN') depth += 1;
    if (token.type === 'RPAREN') depth -= 1;
    if (depth < 0) return { ok: false, error: 'Filter logic has unbalanced parentheses' };
  }
  if (depth !== 0) return { ok: false, error: 'Filter logic has unbalanced parentheses' };
  const parsed = new Parser(tokenized.tokens).parse();
  if (!parsed.ok) return parsed;
  const used: number[] = [];
  referencedIds(parsed.ast, used);
  const expected = [...rowIds].sort((left, right) => left - right);
  const actual = [...used].sort((left, right) => left - right);
  if (used.length !== new Set(used).size) return { ok: false, error: 'Each filter row can be used only once' };
  if (actual.length !== expected.length || actual.some((id, index) => id !== expected[index])) {
    const missing = expected.filter((id) => !used.includes(id));
    const unknown = used.filter((id) => !expected.includes(id));
    if (unknown.length) return { ok: false, error: `Filter logic uses row ${unknown[0]}, which does not exist` };
    return { ok: false, error: `Filter logic must include row ${missing[0]}` };
  }
  return { ok: true, normalized: normalizeTokens(tokenized.tokens), ast: parsed.ast };
}

export function evaluateFilterLogic(ast: FilterLogicAst, clauses: Map<number, Record<string, unknown>>): Record<string, unknown> {
  if (ast.type === 'ref') return clauses.get(ast.id) || {};
  if (ast.type === 'not') return { NOT: evaluateFilterLogic(ast.item, clauses) };
  return ast.type === 'and'
    ? { AND: ast.items.map((item) => evaluateFilterLogic(item, clauses)) }
    : { OR: ast.items.map((item) => evaluateFilterLogic(item, clauses)) };
}

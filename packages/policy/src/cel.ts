/**
 * Common Expression Language (CEL) Parser & Evaluator
 * Deterministic, zero-dependency policy-as-code compiler for Leash Layer 1 Firewall.
 */

export class CelError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CelError";
  }
}

export type CelNode =
  | { type: "Literal"; value: string | number | boolean | null }
  | { type: "Identifier"; name: string }
  | { type: "Member"; object: CelNode; property: string }
  | { type: "List"; elements: CelNode[] }
  | { type: "Unary"; operator: "!" | "-"; operand: CelNode }
  | {
      type: "Binary";
      operator: "&&" | "||" | "==" | "!=" | "<" | "<=" | ">" | ">=" | "in";
      left: CelNode;
      right: CelNode;
    }
  | {
      type: "Macro";
      target: CelNode;
      macro: "exists" | "all" | "filter" | "map";
      variable: string;
      body: CelNode;
    }
  | { type: "Call"; target: CelNode; method: string; args: CelNode[] };

type TokenType =
  | "IDENTIFIER"
  | "NUMBER"
  | "STRING"
  | "BOOLEAN"
  | "NULL"
  | "OPERATOR"
  | "PUNCTUATION"
  | "EOF";

interface Token {
  type: TokenType;
  value: string;
  pos: number;
}

export class CelTokenizer {
  private pos = 0;

  constructor(private input: string) {}

  tokenize(): Token[] {
    const tokens: Token[] = [];
    const len = this.input.length;

    while (this.pos < len) {
      const ch = this.input[this.pos];
      if (!ch) break;

      // Whitespace
      if (/\s/.test(ch)) {
        this.pos++;
        continue;
      }

      // Two-character operators
      const two = this.input.substring(this.pos, this.pos + 2);
      if (["&&", "||", "==", "!=", "<=", ">="].includes(two)) {
        tokens.push({ type: "OPERATOR", value: two, pos: this.pos });
        this.pos += 2;
        continue;
      }

      // Single-character operators
      if (["<", ">", "!", "-"].includes(ch)) {
        tokens.push({ type: "OPERATOR", value: ch, pos: this.pos });
        this.pos++;
        continue;
      }

      // Punctuation
      if (["(", ")", "[", "]", ",", "."].includes(ch)) {
        tokens.push({ type: "PUNCTUATION", value: ch, pos: this.pos });
        this.pos++;
        continue;
      }

      // String literals: '...' or "..."
      if (ch === "'" || ch === '"') {
        const quote = ch;
        let str = "";
        const startPos = this.pos;
        this.pos++;
        let closed = false;

        while (this.pos < len) {
          const curr = this.input[this.pos];
          if (!curr) break;

          if (curr === "\\") {
            this.pos++;
            const nextCh = this.input[this.pos];
            if (nextCh) {
              str += nextCh;
            }
          } else if (curr === quote) {
            closed = true;
            this.pos++;
            break;
          } else {
            str += curr;
          }
          this.pos++;
        }

        if (!closed) {
          throw new CelError(
            `Unterminated string literal starting at position ${startPos}`,
          );
        }

        tokens.push({ type: "STRING", value: str, pos: startPos });
        continue;
      }

      // Number literals
      if (/[0-9]/.test(ch)) {
        const startPos = this.pos;
        let numStr = "";
        while (this.pos < len) {
          const digit = this.input[this.pos];
          if (digit && /[0-9.]/.test(digit)) {
            numStr += digit;
            this.pos++;
          } else {
            break;
          }
        }
        tokens.push({ type: "NUMBER", value: numStr, pos: startPos });
        continue;
      }

      // Identifiers & keywords
      if (/[a-zA-Z_]/.test(ch)) {
        const startPos = this.pos;
        let ident = "";
        while (this.pos < len) {
          const letter = this.input[this.pos];
          if (letter && /[a-zA-Z0-9_]/.test(letter)) {
            ident += letter;
            this.pos++;
          } else {
            break;
          }
        }

        if (ident === "true" || ident === "false") {
          tokens.push({ type: "BOOLEAN", value: ident, pos: startPos });
        } else if (ident === "null") {
          tokens.push({ type: "NULL", value: ident, pos: startPos });
        } else if (ident === "in") {
          tokens.push({ type: "OPERATOR", value: ident, pos: startPos });
        } else {
          tokens.push({ type: "IDENTIFIER", value: ident, pos: startPos });
        }
        continue;
      }

      throw new CelError(
        `Unexpected character '${ch}' at position ${this.pos}`,
      );
    }

    tokens.push({ type: "EOF", value: "", pos: this.pos });
    return tokens;
  }
}

export class CelParser {
  private current = 0;
  private tokens: Token[];

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  parse(): CelNode {
    const node = this.parseOr();
    if (!this.isAtEnd()) {
      throw new CelError(
        `Unexpected token '${this.peek().value}' at position ${this.peek().pos}`,
      );
    }
    return node;
  }

  // Precedence: OR (||)
  private parseOr(): CelNode {
    let left = this.parseAnd();

    while (this.matchOperator("||")) {
      const right = this.parseAnd();
      left = { type: "Binary", operator: "||", left, right };
    }

    return left;
  }

  // Precedence: AND (&&)
  private parseAnd(): CelNode {
    let left = this.parseRelational();

    while (this.matchOperator("&&")) {
      const right = this.parseRelational();
      left = { type: "Binary", operator: "&&", left, right };
    }

    return left;
  }

  // Precedence: Relational (==, !=, <, <=, >, >=, in)
  private parseRelational(): CelNode {
    let left = this.parseUnary();

    while (
      this.checkOperator("==") ||
      this.checkOperator("!=") ||
      this.checkOperator("<") ||
      this.checkOperator("<=") ||
      this.checkOperator(">") ||
      this.checkOperator(">=") ||
      this.checkOperator("in")
    ) {
      const op = this.advance().value as
        "==" | "!=" | "<" | "<=" | ">" | ">=" | "in";
      const right = this.parseUnary();
      left = { type: "Binary", operator: op, left, right };
    }

    return left;
  }

  // Precedence: Unary (!, -)
  private parseUnary(): CelNode {
    if (this.matchOperator("!")) {
      const operand = this.parseUnary();
      return { type: "Unary", operator: "!", operand };
    }

    if (this.matchOperator("-")) {
      const operand = this.parseUnary();
      return { type: "Unary", operator: "-", operand };
    }

    return this.parseMemberOrCall();
  }

  // Member access and method/macro calls
  private parseMemberOrCall(): CelNode {
    let expr = this.parsePrimary();

    while (true) {
      if (this.matchPunctuation(".")) {
        const propToken = this.consume(
          "IDENTIFIER",
          "Expected identifier after '.'",
        );
        const name = propToken.value;

        // Method or Macro call: .name(...)
        if (this.matchPunctuation("(")) {
          // Macro checks: .exists(x, expr), .all(x, expr)
          if (["exists", "all", "filter", "map"].includes(name)) {
            const varToken = this.consume(
              "IDENTIFIER",
              `Macro '.${name}' requires a variable name as first argument`,
            );
            this.consume(
              "PUNCTUATION",
              "Expected ',' after macro variable name",
              ",",
            );
            const body = this.parseOr();
            this.consume("PUNCTUATION", "Expected ')' closing macro call", ")");
            expr = {
              type: "Macro",
              target: expr,
              macro: name as "exists" | "all" | "filter" | "map",
              variable: varToken.value,
              body,
            };
          } else {
            // General method call: .size(), .lowerAscii(), .contains(...)
            const args: CelNode[] = [];
            if (!this.checkPunctuation(")")) {
              do {
                args.push(this.parseOr());
              } while (this.matchPunctuation(","));
            }
            this.consume(
              "PUNCTUATION",
              "Expected ')' after method arguments",
              ")",
            );
            expr = {
              type: "Call",
              target: expr,
              method: name,
              args,
            };
          }
        } else {
          // Member property access: expr.prop
          expr = { type: "Member", object: expr, property: name };
        }
      } else {
        break;
      }
    }

    return expr;
  }

  // Primary literals, identifiers, lists, parenthesized expressions
  private parsePrimary(): CelNode {
    const token = this.peek();

    if (this.matchPunctuation("(")) {
      const expr = this.parseOr();
      this.consume("PUNCTUATION", "Expected ')' after expression", ")");
      return expr;
    }

    if (this.matchPunctuation("[")) {
      const elements: CelNode[] = [];
      if (!this.checkPunctuation("]")) {
        do {
          elements.push(this.parseOr());
        } while (this.matchPunctuation(","));
      }
      this.consume("PUNCTUATION", "Expected ']' closing list literal", "]");
      return { type: "List", elements };
    }

    if (token.type === "STRING") {
      this.advance();
      return { type: "Literal", value: token.value };
    }

    if (token.type === "NUMBER") {
      this.advance();
      const num = Number(token.value);
      if (isNaN(num)) {
        throw new CelError(
          `Invalid number literal '${token.value}' at position ${token.pos}`,
        );
      }
      return { type: "Literal", value: num };
    }

    if (token.type === "BOOLEAN") {
      this.advance();
      return { type: "Literal", value: token.value === "true" };
    }

    if (token.type === "NULL") {
      this.advance();
      return { type: "Literal", value: null };
    }

    if (token.type === "IDENTIFIER") {
      this.advance();
      return { type: "Identifier", name: token.value };
    }

    throw new CelError(
      `Unexpected token '${token.value}' at position ${token.pos}`,
    );
  }

  private peek(): Token {
    return this.tokens[this.current]!;
  }

  private isAtEnd(): boolean {
    return this.peek().type === "EOF";
  }

  private advance(): Token {
    if (!this.isAtEnd()) this.current++;
    return this.tokens[this.current - 1]!;
  }

  private checkOperator(op: string): boolean {
    if (this.isAtEnd()) return false;
    return this.peek().type === "OPERATOR" && this.peek().value === op;
  }

  private matchOperator(op: string): boolean {
    if (this.checkOperator(op)) {
      this.advance();
      return true;
    }
    return false;
  }

  private checkPunctuation(p: string): boolean {
    if (this.isAtEnd()) return false;
    return this.peek().type === "PUNCTUATION" && this.peek().value === p;
  }

  private matchPunctuation(p: string): boolean {
    if (this.checkPunctuation(p)) {
      this.advance();
      return true;
    }
    return false;
  }

  private consume(
    type: TokenType,
    errorMsg: string,
    expectedVal?: string,
  ): Token {
    const token = this.peek();
    if (token.type === type && (!expectedVal || token.value === expectedVal)) {
      return this.advance();
    }
    throw new CelError(
      `${errorMsg}. Found '${token.value}' at position ${token.pos}`,
    );
  }
}

/**
 * Evaluates an AST node against an evaluation context.
 */
export function evaluateCelAst(
  node: CelNode,
  context: Record<string, unknown>,
): unknown {
  switch (node.type) {
    case "Literal":
      return node.value;

    case "Identifier": {
      if (node.name in context) {
        return context[node.name];
      }
      return undefined;
    }

    case "Member": {
      const obj = evaluateCelAst(node.object, context);
      if (obj === null || obj === undefined) {
        return undefined;
      }
      return (obj as Record<string, unknown>)[node.property];
    }

    case "List":
      return node.elements.map((el) => evaluateCelAst(el, context));

    case "Unary": {
      const val = evaluateCelAst(node.operand, context);
      if (node.operator === "!") {
        return !val;
      }
      if (node.operator === "-") {
        return -Number(val);
      }
      throw new CelError(`Unsupported unary operator: '${node.operator}'`);
    }

    case "Binary": {
      // Short-circuiting for logical operators
      if (node.operator === "&&") {
        const leftVal = evaluateCelAst(node.left, context);
        if (!leftVal) return false;
        return Boolean(evaluateCelAst(node.right, context));
      }

      if (node.operator === "||") {
        const leftVal = evaluateCelAst(node.left, context);
        if (leftVal) return true;
        return Boolean(evaluateCelAst(node.right, context));
      }

      const left = evaluateCelAst(node.left, context);
      const right = evaluateCelAst(node.right, context);

      switch (node.operator) {
        case "==":
          return left === right;
        case "!=":
          return left !== right;
        case "<":
        case "<=":
        case ">":
        case ">=": {
          if (
            left === null ||
            left === undefined ||
            right === null ||
            right === undefined
          ) {
            return false;
          }
          const numLeft = Number(left);
          const numRight = Number(right);
          if (Number.isNaN(numLeft) || Number.isNaN(numRight)) {
            throw new CelError(
              `Relational comparison '${node.operator}' requires numeric operands, received left=${typeof left} (${String(left)}) and right=${typeof right} (${String(right)})`,
            );
          }
          if (node.operator === "<") return numLeft < numRight;
          if (node.operator === "<=") return numLeft <= numRight;
          if (node.operator === ">") return numLeft > numRight;
          return numLeft >= numRight;
        }
        case "in": {
          if (Array.isArray(right)) {
            // Case-insensitive comparison if left is string
            if (typeof left === "string") {
              const lowerLeft = left.toLowerCase();
              return right.some(
                (item) =>
                  String(item).toLowerCase() === lowerLeft || item === left,
              );
            }
            return right.includes(left);
          }
          if (typeof right === "string" && typeof left === "string") {
            return right.includes(left);
          }
          return false;
        }
        default:
          throw new CelError(`Unsupported binary operator: '${node.operator}'`);
      }
    }

    case "Call": {
      const targetVal = evaluateCelAst(node.target, context);

      if (node.method === "size") {
        if (Array.isArray(targetVal) || typeof targetVal === "string") {
          return targetVal.length;
        }
        return 0;
      }

      if (node.method === "lowerAscii" || node.method === "toLowerCase") {
        return String(targetVal || "").toLowerCase();
      }

      if (node.method === "contains") {
        const substr = evaluateCelAst(node.args[0]!, context);
        return String(targetVal || "").includes(String(substr));
      }

      throw new CelError(`Unsupported CEL method call: '.${node.method}()'`);
    }

    case "Macro": {
      const listVal = evaluateCelAst(node.target, context);
      if (!Array.isArray(listVal)) {
        return false;
      }

      if (node.macro === "exists") {
        return listVal.some((item) => {
          const subCtx = { ...context, [node.variable]: item };
          return Boolean(evaluateCelAst(node.body, subCtx));
        });
      }

      if (node.macro === "all") {
        return listVal.every((item) => {
          const subCtx = { ...context, [node.variable]: item };
          return Boolean(evaluateCelAst(node.body, subCtx));
        });
      }

      throw new CelError(`Unsupported CEL macro: '.${node.macro}()'`);
    }

    default:
      throw new CelError(`Unknown AST node type: ${(node as CelNode).type}`);
  }
}

/**
 * Compiles a CEL expression string into an executable predicate function.
 */
export function compileCel(
  expression: string,
): (context: Record<string, unknown>) => boolean {
  const tokenizer = new CelTokenizer(expression);
  const tokens = tokenizer.tokenize();
  const parser = new CelParser(tokens);
  const ast = parser.parse();

  return (context: Record<string, unknown>): boolean => {
    const result = evaluateCelAst(ast, context);
    return Boolean(result);
  };
}

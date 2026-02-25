# just-expression

> Traverse and transform JavaScript AST to make sure it's **JUST** an expression.

## Motivation

Sometimes we need to receive some user-defined JavaScript code, and execute it safely.

This package receives a parsed JavaScript AST, traverses and transforms it, make sure it's **JUST** an expression.

It only accepts a small subset of JavaScript AST (specifically expression node types and some related ones), then traverses it to guarantee it's a pure expression.

Besides, all variables will be captured, and only user-specified variables are allowed.

Finally, it compiles the AST into a function that users can call safely.

## Installation

```bash
npm i just-expression
```

## Usage

```typescript
import type { Expression } from 'estree'
import { generate } from 'astring'
import { compile } from 'just-expression'
import { parse } from 'meriyah'

function to_ast(code: string): Expression {
    const prog = parse(code)
    assert(prog.body.length === 1, 'too complex program')
    assert(prog.body[0].type === 'ExpressionStatement', 'not pure expression')
    return prog.body[0].expression
}

// Compile the AST to a function
const calc = compile(generate, to_ast('a + b'), ['a', 'b'])
calc(3, 4) // => 7

// Can't compile an expression with unscoped variables
compile(generate, to_ast('Math.max(1, 2)')) // ReferenceError: variable 'Math' is not defined

// Must provide usable variable manually
// So that variable 'Math' is visible
compile(generate, to_ast('Math.max(1, 2)'), ['Math'])(Math) // => 2

// Using global to capture all unscoped variables
// Specify name '_' in param list to be global variable
// So unscoped variable 'a' becomes _.a
compile(generate, to_ast('Math.max(a, 2)'), ['Math', '_'], '_')(Math, { a: 5 }) // => 5

// Pass the global object as the global variable to remove all limitations
compile(generate, to_ast('eval("123")'), ['_'], '_')(globalThis) // => 123

// Can return arrow function with expression body
compile(generate, to_ast('(a, b) => a + b'))()(1, 2) // => 3
```

## API

### .transform(ast, params, global, enables)

Core API that traverses and transforms JavaScript AST.

JavaScript AST should be ESTree-compatible; it can come from parsers like [acorn](https://github.com/acornjs/acorn) or [meriyah](https://github.com/meriyah/meriyah).

#### ast

Type: Expression

The JavaScript expression AST.

#### params

Type: string[]

Default: []

List of allowed variables.

If `global` is not set, variables in `ast` that are not in this list will throw an error.

#### global

Type: string | 'this' | null

Default: null

Specify a variable in `params` to be global variable; any variables in `ast` that are not listed in `params` will become property accesses on this global variable.

#### enables

Type: object

Switches to enable or disable some syntax.

#### enables.this

Type: boolean

Default: false

Enable `this` expression.

#### enables.call

Type: boolean

Default: true

Enable function call, including normal function call (`f()`), new operator (`new f()`), and tagged template (``tag`text` ``).

#### enables.arrow

Type: boolean

Default: true

Enable arrow function expression (`()=>1`), function body must be expression.

#### enables.update

Type: boolean

Default: false

Enable update operations, including the delete operator, update operators (++, --), and assignment operators (=, += ,-=, etc.).

These operations may modify original data.

#### enables.inspect

Type: boolean

Default: false

Enable the typeof, in and instanceof operators.

These operations inspect the data structure, which seems unnecessary.

#### Return

Return the transformed AST. The returned AST reuses unmodified parts of the original AST.

### .compile(codegen, ast, params, global, enables)

Traverses and transforms the AST, then compiles it into a function.

The compiled function receives the same parameters as listed in `params`.

#### codegen

Type: (ast: Expression) => string

A function that generates JavaScript code from an ESTree-compliant AST.

#### ast, params, global, enables

Same as `.transform()`.

#### Return

Returns a function equivalent to `ast`, with parameters matching `params`.

## Limitation

just-expression only supports the following expressions (ESTree Nodes):

- Identifier
- Literal
- ArrayExpression
- ObjectExpression
- MemberExpression
- ChainExpression
- LogicalExpression
- SequenceExpression
- ConditionalExpression
- TemplateLiteral

The following expressions are affected by options:

- ThisExpression
- UnaryExpression
- BinaryExpression
- UpdateExpression
- AssignmentExpression
- NewExpression
- CallExpression
- TaggedTemplateExpression
- ArrowFunctionExpression (function body must be expression)

The following expressions are not supported:

- AwaitExpression
- FunctionExpression
- ClassExpression
- MetaProperty
- YieldExpression
- ImportExpression

## License

MIT

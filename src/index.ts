import type {
  Node as AnyNode,
  ArrowFunctionExpression,
  Expression,
  MemberExpression,
  Pattern,
  Property,
} from 'estree'
import { ok } from 'devlop'
import { ENTER, walker } from 'immer-walker'

import { isIdent } from './util.js'

function extractDeclaration(pattern: Pattern, scope: string[]): void {
  switch (pattern.type) {
    case 'Identifier':
      scope.push(pattern.name)
      break
    case 'ObjectPattern':
      for (const p of pattern.properties) {
        switch (p.type) {
          case 'RestElement':
            extractDeclaration(p.argument, scope)
            break
          case 'Property':
            extractDeclaration(p.value, scope)
            break
          default:
            throw new SyntaxError('unknown ObjectPattern syntax')
        }
      }
      break
    case 'ArrayPattern':
      for (const e of pattern.elements) {
        if (e) {
          extractDeclaration(e, scope)
        }
      }
      break
    case 'RestElement':
      extractDeclaration(pattern.argument, scope)
      break
    case 'AssignmentPattern':
      extractDeclaration(pattern.left, scope)
      break
    default:
      throw new Error('unknown Pattern syntax')
  }
}

export function transform(
  ast: Expression,
  params: string[] = [],
  global?: string | 'this' | null,
  {
    this: enableThis = false,
    call: enableCall = true,
    arrow: enableArrow = true,
    // await: enableAwait = false,
    update: enableUpdate = false,
    inspect: enableInspect = false,
  } = {}
): Expression {
  for (const [idx, param] of params.entries()) {
    if (!isIdent(param)) {
      throw new SyntaxError(`parameter name '${param}' is not a valid identifier`)
    }
    if (params.indexOf(param, idx + 1) + 1) {
      throw new SyntaxError(`duplicate parameter name '${param}'`)
    }
  }
  if (global != null && global !== 'this' && !params.includes(global)) {
    throw new SyntaxError(`global object name '${global}' is not in parameter list`)
  }

  const walk = walker({
    [ENTER](node) {
      function test(cond: boolean, err: string): undefined {
        if (!cond) {
          throw new SyntaxError(err)
        }
      }
      const expr = node as AnyNode
      switch (expr.type) {
        case 'Identifier':
        case 'Literal':
        case 'ArrayExpression':
        case 'ObjectExpression':
        case 'MemberExpression':
        case 'ChainExpression':
        case 'LogicalExpression':
        case 'SequenceExpression':
        case 'ConditionalExpression':
        case 'TemplateLiteral':
          return
        case 'ArrowFunctionExpression':
          return test(enableArrow, `expression ${expr.type} is disabled`)
        case 'UnaryExpression':
        case 'BinaryExpression':
          return test(
            (enableUpdate || expr.operator !== 'delete')
            &&
            (enableInspect || (
              expr.operator !== 'typeof'
              && expr.operator !== 'in'
              && expr.operator !== 'instanceof'
            )),
            `operator ${expr.operator} is disabled`)
        case 'UpdateExpression':
        case 'AssignmentExpression':
          return test(enableUpdate, `operator ${expr.operator} is disabled`)
        case 'NewExpression':
        case 'CallExpression':
        case 'TaggedTemplateExpression':
          return test(enableCall, `expression ${expr.type} is disabled`)
        case 'ThisExpression':
          return test(enableThis, `expression ${expr.type} is disabled`)
        case 'FunctionExpression':
        case 'ClassExpression':
        case 'MetaProperty':
        case 'YieldExpression':
        case 'AwaitExpression':
        case 'ImportExpression':
          return test(false, `expression ${expr.type} is not supported`)
        case 'Property':
        case 'ObjectPattern':
        case 'ArrayPattern':
        case 'RestElement':
        case 'AssignmentPattern':
        case 'SpreadElement':
        case 'TemplateElement':
          return
        default:
          throw new SyntaxError(`unknown node type ${expr.type}`)
      }
    },
    ArrowFunctionExpression(node, state): ArrowFunctionExpression {
      if (node.body.type === 'BlockStatement') {
        throw new SyntaxError(`arrow function with block statement is not allowed`)
      } else {
        //   const scope: string[] = []
        //   for (const p of node.params) {
        //     extractDeclaration(p, scope)
        //   }
        //   return {
        //     ...node,
        //     body: walk(node.body, [...scope, ...state]),
        //   }
        // }
        const length = state.length
        for (const p of node.params) {
          extractDeclaration(p, state)
        }
        const body = walk(node.body, state)
        state.splice(length)

        if (body === node.body) {
          return node
        } else {
          return {
            ...node,
            body
          }
        }
      }
    },
    MemberExpression(node, state): MemberExpression {
      ok(node.object.type !== 'Super')
      ok(node.property.type !== 'PrivateIdentifier')

      const object = walk(node.object, state)
      const property = node.computed ? walk(node.property, state) : node.property

      if (object === node.object && property === node.property) {
        return node
      } else {
        return {
          ...node,
          object,
          property,
        }
      }

      // return {
      //   ...node,
      //   object: walk(node.object, state),
      //   // if !node.computed, skip visiting node.property
      //   property: node.computed ? walk(node.property, state) : node.property,
      // }
    },
    Property(node, state): Property {
      ok(node.key.type !== 'PrivateIdentifier')

      const key = node.computed ? walk(node.key, state) : node.key
      const value = walk(node.value, state)

      if (key === node.key && value === node.value) {
        return node
      } else {
        return {
          ...node,
          key,
          value,
        }
      }

      // return {
      //   ...node,
      //   // if !node.computed, skip visiting node.key
      //   key: node.computed ? walk(node.key, state) : node.key,
      //   value: walk(node.value, state),
      // }
    },
    Identifier(node, state) {
      if (state.includes(node.name)) {
        return node
      }

      if (global == null) {
        throw new ReferenceError(`variable '${node.name}' is not defined`)
      } else {
        return {
          type: 'MemberExpression',
          computed: false,
          optional: false,
          object: global === 'this' ? {
            type: 'ThisExpression',
          } : {
            type: 'Identifier',
            name: global,
          },
          property: {
            type: 'Identifier',
            name: node.name,
          },
        } as MemberExpression
      }
    },
  }, params)

  return walk(ast)
}

export function compile(
  codegen: (ast: Expression) => string,
  ast: Expression,
  params: string[] = [],
  global?: string | 'this' | null,
  enables: {
    this?: boolean,
    call?: boolean,
    arrow?: boolean,
    // await?: boolean,
    update?: boolean,
    inspect?: boolean,
  } = {},
  // eslint-disable-next-line ts/no-unsafe-function-type
): Function {
  const transformed = transform(ast, params, global, enables)
  // eslint-disable-next-line no-new-func
  return new Function(...params, `'use strict';return (${codegen(transformed)})`)
}

import assert from 'node:assert/strict'
import test from 'node:test'

import { generate } from 'astring'
import { compile, transform } from 'just-expression'
import { parse } from 'meriyah'

function to_ast(code) {
    const prog = parse(code)
    assert(prog.body.length === 1, 'too complex program')
    assert(prog.body[0].type === 'ExpressionStatement', 'not pure expression')
    return prog.body[0].expression
}

test('simple expression', () => {
    assert.strictEqual(2, compile(generate, to_ast('1 + 1'))())
})

test('complex expression', () => {
    assert.strictEqual(27, compile(generate, to_ast(`(+(-1)) && ((2 * 3 / 4 % 5 ** 6) & (7 | 8)
         ^ (~9 << 10 >> 11 >>> 12)) || !((13 < 14 > 15 <= 16 >= 17) == (18 != 19 === 20 !== 21))
          ? (22 && 23 || 24) : (25 ? 26 : 27) , 28 + 29 - 30`))())
})

test('expression with params', () => {
    assert.strictEqual(3, compile(generate, to_ast('1 + a'), ['a'])(2))
})

test('work on array', () => {
    assert.deepStrictEqual([1, '2', 3], compile(generate, to_ast('[1, a, ...b]'), ['a', 'b'])('2', [3]))
})

test('work on object', () => {
    assert.deepStrictEqual({
        a: 3,
        b: '4',
        c: [true]
    }, compile(generate, to_ast('({a: 3, ...a})'), ['a'])({
        b: '4',
        c: [true]
    }))
})

test.suite('function call test', () => {
    test('normal function call', () => {
        assert.strictEqual(4, compile(generate, to_ast('Math.abs(-4)'), ['Math'])(Math))
    })
    test('new function call', () => {
        assert.strictEqual('false', compile(generate, to_ast('new Boolean().toString()'), ['Boolean'])(Boolean))
    })
    test('tagged template function call', () => {
        assert.strictEqual('(◜𖥦◝)', compile(generate, to_ast('tag`◜𖥦◝`'), ['tag'])(str => `(${str[0]})`))
    })

    test('throw on function call disabled', () => {
        assert.throws(() => transform(to_ast('Math.abs(-4)'), ['Math'], null, { call: false })(Math))
        assert.throws(() => transform(to_ast('new Boolean().toString()'), ['Boolean'], null, { call: false })(Boolean))
        assert.throws(() => transform(to_ast('tag`◜𖥦◝`'), ['tag'], null, { call: false })(str => `(${str[0]})`))
    })
})

test('throws on using disabled operator', () => {
    assert.throws(() => {
        transform(to_ast('"a" in {a:3}'))
    })
    assert.throws(() => {
        transform(to_ast('a++'))
    })
    assert.throws(() => {
        transform(to_ast('a+= 3'))
    })
})

test('throws on visiting unscoped variable and no global variable', () => {
    assert.throws(() => {
        transform(to_ast('1 + a'))
    })
})

test('global variable capture unscoped variable', () => {
    assert.strictEqual('unscoped', compile(generate, to_ast('a'), ['g'], 'g')({ a: 'unscoped' }))
})

test('unscoped variable is in global variable', () => {
    assert.strict(compile(generate, to_ast('a === g.a'), ['g'], 'g')({ a: Symbol('unique') }))
})

test('scoped variable is not in global variable', () => {
    assert.strict(compile(generate, to_ast('a !== g.a'), ['a', 'g'], 'g')(Symbol('a'), { a: Symbol('g.a') }))
})

test('using this as global variable', () => {
    assert.strictEqual('a is in this', compile(generate, to_ast('"a is " + a'), [], 'this').apply({ a: 'in this' }))
})

test.suite('function test', () => {
    test('return an arrow function with expression body', () => {
        assert.strictEqual('function', typeof compile(generate, to_ast('a=>a+1'))())
    })
    test('returned function is callable', () => {
        assert.strictEqual(7, compile(generate, to_ast('()=>7'))()())
    })
    test('call returned function with param', () => {
        assert.strictEqual(4, compile(generate, to_ast('a=>a+1'))()(3))
    })
    test('variable in function params is scoped', () => {
        assert.strictEqual(3, compile(generate, to_ast('(a, b) => a + b'), ['a', 'g'], 'g')(3, { b: 4 })(1, 2))
    })
    test('variable not in function params but in params is scoped', () => {
        assert.strictEqual(3, compile(generate, to_ast('b => a + b'), ['a'])(1)(2))
    })
    test('variable not in function params and not in params is unscoped', () => {
        assert.strictEqual(3, compile(generate, to_ast('b => a + b'), ['g'], 'g')({ a: 1 })(2))
    })
    test('deep curry', () => {
        assert.strictEqual('abc', compile(generate, to_ast('a => b => a + b + c'), ['c'])('c')('a')('b'))
    })
    test('rest params', () => {
        assert.strictEqual(3, compile(generate, to_ast('(a, ...b) => a + b.length'))()(1, 1, 1))
    })
    test('object pattern match in function params', () => {
        assert.strictEqual(3, compile(generate, to_ast('({a, b = 2}) => a + b'))()({ a: 1 }))
    })
    test('complex pattern match in function params', () => {
        assert.strictEqual(13, compile(generate, to_ast('({a: { a: [,a], ...c}, c: b = 2}) => a + b + c.d'))()({
            a: {
                a: [5, 4, 3],
                d: 7
            },
            b: 'not c'
        }))
    })
    test('return an async function', async () => {
        assert.strictEqual(3, await compile(generate, to_ast('async () => 3'))()())
    })
    test('throw on return normal function', () => {
        assert.throws(() => {
            transform(to_ast('function(){return 3}'))
        })
    })
    test('throw on return arrow function with statement block', () => {
        assert.throws(() => {
            transform(to_ast('() => {return 3}'))
        })
    })
})
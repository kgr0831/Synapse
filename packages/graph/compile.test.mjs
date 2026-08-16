import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { compileGraph, validateGraph, SPEC } from './compile.mjs'

const codes = (errs) => errs.map((e) => e.code)
const g = (nodes, edges = []) => ({ spec: SPEC, nodes, edges })

test('the example graph compiles to the TypeScript the site advertises', async () => {
  const graph = JSON.parse(await readFile(new URL('../../examples/drift.graph.json', import.meta.url), 'utf8'))
  const { ok, code } = compileGraph(graph, { module: 'drift' })
  assert.equal(ok, true)
  assert.match(code, /export function onStart\(w: World\) \{/)
  assert.match(code, /spawn\(w, "drone", \{ count: 4, at: scatter\(\{ radius: 3 \}\) \}\);/)
  assert.match(code, /orbit\(w, tag\("drone"\), \{ speed: 1\.9 \* dt \}\);/)
  assert.match(code, /boost\(e, 1\.8\);\n\s+tint\(e, "signal"\);/)
})

test('compilation is deterministic — same graph, same bytes', async () => {
  const graph = JSON.parse(await readFile(new URL('../../examples/drift.graph.json', import.meta.url), 'utf8'))
  const a = compileGraph(graph, { module: 'drift' }).code
  // node order must not matter to the output
  const shuffled = { ...graph, nodes: [...graph.nodes].reverse() }
  const b = compileGraph(shuffled, { module: 'drift' }).code
  assert.equal(a, b)
})

test('unknown node types are rejected by id', () => {
  const errs = validateGraph(g([{ id: 'n1', type: 'core/teleport' }]))
  assert.ok(codes(errs).includes('node.unknownType'))
  assert.equal(errs.find((e) => e.code === 'node.unknownType').at, 'n1')
})

test('duplicate ids are rejected — stable identity is what makes diffs mean anything', () => {
  const errs = validateGraph(g([
    { id: 'same', type: 'core/on_start' }, { id: 'same', type: 'core/on_tick' }
  ]))
  assert.ok(codes(errs).includes('node.duplicate'))
})

test('an exec edge cannot trigger an event or a pure node', () => {
  const intoEvent = validateGraph(g(
    [{ id: 'a', type: 'core/on_start' }, { id: 'b', type: 'core/on_tick' }],
    [{ from: ['a', 'exec'], to: ['b', 'exec'] }]
  ))
  assert.ok(codes(intoEvent).includes('edge.intoEvent'))

  const intoPure = validateGraph(g(
    [{ id: 'a', type: 'core/on_start' }, { id: 'p', type: 'math/random' }],
    [{ from: ['a', 'exec'], to: ['p', 'exec'] }]
  ))
  assert.ok(codes(intoPure).includes('edge.intoPure'))
})

test('data edges must come from a pure node and land on a real pin', () => {
  const badPin = validateGraph(g(
    [{ id: 'p', type: 'math/random' }, { id: 's', type: 'world/spawn' }],
    [{ from: ['p', 'out'], to: ['s', 'nope'] }]
  ))
  assert.ok(codes(badPin).includes('edge.noSuchPin'))
})

test('an exec cycle is caught rather than compiled into recursion', () => {
  const errs = validateGraph(g(
    [{ id: 'e', type: 'core/on_start' },
     { id: 'a', type: 'core/log' }, { id: 'b', type: 'core/log' }],
    [{ from: ['e', 'exec'], to: ['a', 'exec'] },
     { from: ['a', 'exec'], to: ['b', 'exec'] },
     { from: ['b', 'exec'], to: ['a', 'exec'] }]
  ))
  assert.ok(codes(errs).includes('exec.cycle'))
})

test('branch emits both arms', () => {
  const { ok, code } = compileGraph(g(
    [{ id: 'e', type: 'core/on_start' },
     { id: 'br', type: 'flow/branch', pins: { cond: true } },
     { id: 'y', type: 'core/log', pins: { message: 'yes' } },
     { id: 'n', type: 'core/log', pins: { message: 'no' } }],
    [{ from: ['e', 'exec'], to: ['br', 'exec'] },
     { from: ['br', 'then'], to: ['y', 'exec'] },
     { from: ['br', 'else'], to: ['n', 'exec'] }]
  ))
  assert.equal(ok, true)
  assert.match(code, /if \(true\) \{/)
  assert.match(code, /console\.log\("yes"\);/)
  assert.match(code, /\} else \{/)
  assert.match(code, /console\.log\("no"\);/)
})

test('an unset pin falls back to its declared default', () => {
  const { code } = compileGraph(g(
    [{ id: 'e', type: 'core/on_start' }, { id: 's', type: 'world/spawn' }],
    [{ from: ['e', 'exec'], to: ['s', 'exec'] }]
  ))
  assert.match(code, /spawn\(w, "drone", \{ count: 1 \}\);/)
})

test('compile refuses to emit anything when validation fails', () => {
  const r = compileGraph(g([{ id: 'x', type: 'core/nope' }]))
  assert.equal(r.ok, false)
  assert.equal(r.code, null)
  assert.ok(r.errors.length)
})

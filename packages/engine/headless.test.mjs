/**
 * The loop this project exists to make possible, end to end and in miniature:
 * a graph compiles to code, the code runs headlessly on a scripted input
 * trace, and the result is asserted. No browser, no editor, no renderer.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { compileGraph } from '../graph/compile.mjs'
import { runHeadless, count } from './headless.mjs'

const RUNTIME = new URL('./world.mjs', import.meta.url).href

async function buildDrift() {
  const graph = JSON.parse(await readFile(new URL('../../examples/drift.graph.json', import.meta.url), 'utf8'))
  const { ok, code, errors } = compileGraph(graph, { module: 'drift', lang: 'js', runtime: RUNTIME })
  assert.equal(ok, true, JSON.stringify(errors))
  return import('data:text/javascript;base64,' + Buffer.from(code, 'utf8').toString('base64'))
}

test('a compiled graph runs and produces the entities the graph asked for', async () => {
  const mod = await buildDrift()
  const { snapshot } = runHeadless(mod, { frames: 300 })
  assert.equal(count(snapshot, 'drone'), 4)
  assert.ok(snapshot.entities.every((e) => e.radius === 3), 'scatter radius reached the spawn')
})

test('same input trace, same final state — 20 runs', async () => {
  const mod = await buildDrift()
  const trace = [{ frame: 90, kind: 'hit', entity: 2 }]
  const first = JSON.stringify(runHeadless(mod, { frames: 300, trace }).snapshot)
  for (let i = 0; i < 19; i++) {
    assert.equal(JSON.stringify(runHeadless(mod, { frames: 300, trace }).snapshot), first)
  }
})

test('the assertion an agent would write for "boost and tint on hit" holds', async () => {
  const mod = await buildDrift()
  const { snapshot, events } = runHeadless(mod, {
    frames: 300, trace: [{ frame: 90, kind: 'hit', entity: 2 }]
  })
  assert.deepEqual(events, ['start', 'hit:2@90'])

  const hit = snapshot.entities.find((e) => e.id === 2)
  const others = snapshot.entities.filter((e) => e.id !== 2)
  assert.equal(hit.ink, 'signal', 'the hit drone was tinted')
  assert.equal(hit.speedMul, 1.8, 'the hit drone was boosted')
  assert.ok(others.every((e) => e.ink === 'ink' && e.speedMul === 1))

  // spawn places entity n at (n-1) * 2pi / count, so travel is angle minus start
  const start = (id) => ((id - 1) * 2 * Math.PI) / 4
  const travel = (e) => e.angle - start(e.id)
  assert.ok(travel(hit) > travel(others[0]),
    `the boosted drone should have travelled further: ${travel(hit)} vs ${travel(others[0])}`)
})

test('nothing happens without a trace — the hit path is not entered by accident', async () => {
  const mod = await buildDrift()
  const { snapshot, events } = runHeadless(mod, { frames: 300 })
  assert.deepEqual(events, ['start'])
  assert.ok(snapshot.entities.every((e) => e.ink === 'ink' && e.speedMul === 1))
})

test('time advances only by the fixed step, never by the clock', async () => {
  const mod = await buildDrift()
  const a = runHeadless(mod, { frames: 120, dt: 1 / 60 }).snapshot
  assert.equal(a.t, 2)
  const b = runHeadless(mod, { frames: 60, dt: 1 / 30 }).snapshot
  assert.equal(b.t, 2)
})

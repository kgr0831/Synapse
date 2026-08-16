import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateBundle, inferManifest, SPEC, LIMITS } from './validate.mjs'

const good = {
  spec: SPEC,
  name: 'Orbital Drift',
  entry: 'index.html',
  engine: { name: 'three.js', version: 'r180' },
  canvas: { mode: 'fill' },
  input: ['keyboard', 'mouse'],
  requires: { webgpu: true, features: ['depth32float-stencil8'], limits: { maxBufferSize: 268435456 } },
  save: 'local',
  telemetry: true
}
const files = [{ path: 'index.html', bytes: 2048 }, { path: 'game.js', bytes: 400_000 }]

const codes = (r) => r.errors.map((e) => e.code)

test('a well-formed bundle passes clean', () => {
  const r = validateBundle({ manifest: good, files })
  assert.equal(r.ok, true)
  assert.deepEqual(r.errors, [])
  assert.deepEqual(r.warnings, [])
})

test('a missing manifest fails without throwing', () => {
  for (const manifest of [undefined, null, 'nope', []]) {
    const r = validateBundle({ manifest, files })
    assert.equal(r.ok, false)
    assert.ok(codes(r).includes('manifest.missing'))
  }
})

test('spec version is enforced so old bundles cannot drift in', () => {
  const r = validateBundle({ manifest: { ...good, spec: 99 }, files })
  assert.ok(codes(r).includes('spec.unsupported'))
})

test('entry must actually exist in the bundle', () => {
  const r = validateBundle({ manifest: { ...good, entry: 'main.html' }, files })
  assert.ok(codes(r).includes('entry.notFound'))
})

test('a fixed canvas without dimensions is rejected', () => {
  const r = validateBundle({ manifest: { ...good, canvas: { mode: 'fixed' } }, files })
  assert.ok(codes(r).includes('canvas.size'))
})

test('unknown input kinds are rejected', () => {
  const r = validateBundle({ manifest: { ...good, input: ['keyboard', 'brainwave'] }, files })
  assert.ok(codes(r).includes('input.unknown'))
})

test('requires must be well typed — capability gating depends on it', () => {
  const r = validateBundle({ manifest: { ...good, requires: { webgpu: 'yes', features: [1] } }, files })
  assert.ok(codes(r).includes('requires.webgpu'))
  assert.ok(codes(r).includes('requires.features'))
})

test('a bundle with no requires block warns rather than fails', () => {
  const { requires, ...noReq } = good
  const r = validateBundle({ manifest: noReq, files })
  assert.equal(r.ok, true)
  assert.ok(r.warnings.some((w) => w.code === 'requires.absent'))
})

test('path traversal and absolute paths are rejected', () => {
  const r = validateBundle({
    manifest: good,
    files: [...files, { path: '../etc/passwd', bytes: 1 }, { path: '/abs', bytes: 1 }, { path: 'C:/win', bytes: 1 }]
  })
  const c = codes(r)
  assert.equal(c.filter((x) => x === 'file.unsafePath').length, 3)
})

test('over the per-game cap is an error, over the advised payload is a warning', () => {
  const over = validateBundle({
    manifest: good, files: [{ path: 'index.html', bytes: LIMITS.maxTotalBytes + 1 }]
  })
  assert.ok(codes(over).includes('size.overCap'))

  const chunky = validateBundle({
    manifest: good,
    files: [{ path: 'index.html', bytes: 1024 }, { path: 'sky.png', bytes: 20 * 1024 * 1024 }]
  })
  assert.equal(chunky.ok, true)
  const w = chunky.warnings.find((x) => x.code === 'size.overBudget')
  assert.ok(w)
  assert.match(w.message, /KTX2/)
})

test('inferManifest picks index.html and marks itself as a guess', () => {
  const m = inferManifest([{ path: 'assets/a.bin', bytes: 1 }, { path: 'index.html', bytes: 1 }])
  assert.equal(m.entry, 'index.html')
  assert.equal(m._inferred, true)
  assert.equal(validateBundle({ manifest: m, files: [{ path: 'index.html', bytes: 1 }] }).ok, true)
})

/**
 * graph.json → TypeScript — IMPL.md M4.1 and M4.3.
 *
 * One direction only. The graph is the source; the emitted TypeScript is a
 * read-only artifact (PLAN.md section 6.3). Round-tripping code back into
 * nodes is what kills visual scripting tools, so there is no path back.
 *
 * Output is deterministic: nodes are walked in a fixed order and the same
 * graph always produces the same bytes, which is what makes review, diff and
 * agent edits reviewable at all.
 */
import { NODES, literal } from './nodes.mjs'

export const SPEC = 1

export function validateGraph(graph) {
  const errors = []
  const err = (code, message, at) => errors.push({ code, message, at })

  if (!graph || typeof graph !== 'object') {
    err('graph.missing', 'graph must be an object')
    return errors
  }
  if (graph.spec !== SPEC) err('spec.unsupported', `spec must be ${SPEC}`, 'spec')

  const nodes = Array.isArray(graph.nodes) ? graph.nodes : []
  const edges = Array.isArray(graph.edges) ? graph.edges : []
  if (!Array.isArray(graph.nodes)) err('nodes.invalid', 'nodes must be an array', 'nodes')
  if (!Array.isArray(graph.edges)) err('edges.invalid', 'edges must be an array', 'edges')

  const byId = new Map()
  for (const n of nodes) {
    if (!n || typeof n.id !== 'string' || !n.id) { err('node.id', 'every node needs a string id'); continue }
    if (byId.has(n.id)) err('node.duplicate', `duplicate node id ${n.id}`, n.id)
    if (!NODES[n.type]) err('node.unknownType', `unknown node type "${n.type}"`, n.id)
    byId.set(n.id, n)
  }

  for (const [i, e] of edges.entries()) {
    const at = `edges[${i}]`
    if (!Array.isArray(e?.from) || !Array.isArray(e?.to)) {
      err('edge.shape', 'edge needs from and to as [nodeId, pin]', at); continue
    }
    const [fromId, fromPin] = e.from
    const [toId, toPin] = e.to
    const src = byId.get(fromId)
    const dst = byId.get(toId)
    if (!src) { err('edge.fromMissing', `no node ${fromId}`, at); continue }
    if (!dst) { err('edge.toMissing', `no node ${toId}`, at); continue }

    const srcDef = NODES[src.type]
    const dstDef = NODES[dst.type]
    if (!srcDef || !dstDef) continue

    const execOuts = srcDef.execOut ?? ['exec']
    if (execOuts.includes(fromPin)) {
      if (toPin !== 'exec') err('edge.execTarget', `exec edge must land on an exec pin, got "${toPin}"`, at)
      if (dstDef.kind === 'event') err('edge.intoEvent', `${toId} is an event and cannot be triggered`, at)
      if (dstDef.kind === 'pure') err('edge.intoPure', `${toId} is pure and has no exec pin`, at)
    } else if (fromPin === 'out') {
      if (srcDef.kind !== 'pure') err('edge.dataSource', `${fromId} is not a pure node`, at)
      if (!dstDef.pins?.[toPin]) err('edge.noSuchPin', `${dst.type} has no pin "${toPin}"`, at)
    } else {
      err('edge.unknownPin', `"${fromPin}" is not an output of ${src.type}`, at)
    }
  }

  // exec cycles would compile into infinite recursion
  const nextOf = (id) => edges
    .filter((e) => e.from?.[0] === id && (NODES[byId.get(id)?.type]?.execOut ?? ['exec']).includes(e.from[1]))
    .map((e) => e.to[0])
  const state = new Map()
  const walk = (id) => {
    if (state.get(id) === 1) { err('exec.cycle', `exec chain loops at ${id}`, id); return }
    if (state.get(id) === 2) return
    state.set(id, 1)
    for (const n of nextOf(id)) if (byId.has(n)) walk(n)
    state.set(id, 2)
  }
  for (const n of nodes) if (NODES[n.type]?.kind === 'event') walk(n.id)

  return errors
}

/**
 * @param {object} graph
 * @param {object} [opts]
 * @param {string} [opts.module]   name used in the generated header
 * @param {'ts'|'js'} [opts.lang]  js drops the annotations so the output can be
 *                                 imported directly by the headless runner
 * @param {string} [opts.runtime]  module specifier the emitted code imports from
 */
export function compileGraph(graph, { module = 'graph', lang = 'ts', runtime = '@synapse/engine' } = {}) {
  const errors = validateGraph(graph)
  if (errors.length) return { ok: false, errors, code: null }

  const byId = new Map(graph.nodes.map((n) => [n.id, n]))
  const edges = graph.edges

  /** Value for a data pin: a wired pure node inlines, otherwise the literal. */
  const pinValue = (node, name, def) => {
    const wire = edges.find((e) => e.to?.[0] === node.id && e.to?.[1] === name && e.from?.[1] === 'out')
    if (wire) return expr(byId.get(wire.from[0]))
    const given = node.pins?.[name]
    return literal(def.type, given !== undefined ? given : def.default)
  }

  const expr = (node) => {
    const def = NODES[node.type]
    const p = {}
    for (const [name, pd] of Object.entries(def.pins ?? {})) p[name] = pinValue(node, name, pd)
    return def.emit(p)
  }

  const execNext = (id, pin = 'exec') =>
    edges.filter((e) => e.from?.[0] === id && e.from?.[1] === pin).map((e) => e.to[0])

  const chain = (startIds, depth) => {
    const pad = '  '.repeat(depth)
    const out = []
    let queue = [...startIds]
    while (queue.length) {
      const id = queue.shift()
      const node = byId.get(id)
      const def = NODES[node.type]

      if (def.kind === 'flow' && node.type === 'flow/branch') {
        const cond = pinValue(node, 'cond', def.pins.cond)
        const thenBody = chain(execNext(id, 'then'), depth + 1)
        const elseBody = chain(execNext(id, 'else'), depth + 1)
        out.push(`${pad}if (${cond}) {`)
        out.push(...thenBody)
        if (elseBody.length) { out.push(`${pad}} else {`); out.push(...elseBody) }
        out.push(`${pad}}`)
      } else if (def.kind === 'action') {
        out.push(pad + expr(node))
        queue.push(...execNext(id))
      }
    }
    return out
  }

  const events = graph.nodes
    .filter((n) => NODES[n.type].kind === 'event')
    .sort((a, b) => a.id.localeCompare(b.id))

  const lines = [`// generated from ${module}.json · spec ${SPEC} · do not edit`]
  if (lang === 'ts') lines.push(`import type { World, Entity } from '${runtime}'`)
  lines.push(`import { spawn, orbit, boost, tint, tag, scatter, rand } from '${runtime}'`, '')

  for (const ev of events) {
    const def = NODES[ev.type]
    const params = lang === 'ts' ? def.params : def.paramsJs
    lines.push(`export function ${def.fn}(${params}) {`)
    lines.push(...chain(execNext(ev.id), 1))
    lines.push('}', '')
  }

  return { ok: true, errors: [], code: lines.join('\n').replace(/\n+$/, '\n') }
}

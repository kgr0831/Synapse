#!/usr/bin/env node
/**
 * Synapse MCP server — PLAN.md §7.2, IMPL.md M6.1.
 *
 * The point of the design is what is absent: there is no read_file and no
 * write_file. An agent adds a node, connects a pin, sets a default. It never
 * sees the document's syntax, so it cannot corrupt it — the worst it can do is
 * ask for an edit the validator refuses, by node id.
 *
 * Every mutation checkpoints first, and publish is deliberately not a tool.
 *
 * Demo scope: stdio, one graph file, checkpoints in memory. The remote
 * transport and OAuth are M6 proper.
 *
 *   node packages/mcp/server.mjs [graph.json]
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { NODES } from '../graph/nodes.mjs'
import { compileGraph, validateGraph } from '../graph/compile.mjs'
import { runHeadless, count } from '../engine/headless.mjs'

const FILE = resolve(process.argv[2] ?? 'examples/drift.graph.json')
// resolved against this file, not the cwd, so the server works from anywhere
const RUNTIME = new URL('../engine/world.mjs', import.meta.url).href

const checkpoints = []
const text = (o) => ({ content: [{ type: 'text', text: typeof o === 'string' ? o : JSON.stringify(o, null, 2) }] })
const fail = (o) => ({ isError: true, content: [{ type: 'text', text: JSON.stringify(o, null, 2) }] })

const load = async () => JSON.parse(await readFile(FILE, 'utf8'))
const save = async (g) => writeFile(FILE, JSON.stringify(g, null, 2) + '\n')

/** Deterministic ids so a patch is reproducible; no clock, no randomness. */
const mintId = (graph, type) => {
  const stem = type.split('/')[1].slice(0, 5).toUpperCase()
  let n = 1
  while (graph.nodes.some((x) => x.id === `N${stem}${n}`)) n++
  return `N${stem}${n}`
}

const server = new McpServer({ name: 'synapse', version: '0.1.0' })

server.registerTool('project_overview', {
  title: 'Project overview',
  description: 'Summary of the graph: events, node counts by kind, and what it spawns. The first call to make.',
  inputSchema: {}
}, async () => {
  const g = await load()
  const kinds = {}
  for (const n of g.nodes) {
    const k = NODES[n.type]?.kind ?? 'unknown'
    kinds[k] = (kinds[k] ?? 0) + 1
  }
  return text({
    file: FILE, name: g.name, spec: g.spec,
    nodes: g.nodes.length, edges: g.edges.length, kinds,
    events: g.nodes.filter((n) => NODES[n.type]?.kind === 'event').map((n) => ({ id: n.id, type: n.type })),
    availableNodeTypes: Object.keys(NODES),
    valid: validateGraph(g).length === 0
  })
})

server.registerTool('graph_read', {
  title: 'Read the graph',
  description: 'The whole graph, or one node with the edges touching it.',
  inputSchema: { nodeId: z.string().optional().describe('omit for the whole graph') }
}, async ({ nodeId }) => {
  const g = await load()
  if (!nodeId) return text(g)
  const node = g.nodes.find((n) => n.id === nodeId)
  if (!node) return fail({ code: 'node.notFound', message: `no node ${nodeId}` })
  return text({
    node,
    pins: NODES[node.type]?.pins ?? {},
    edges: g.edges.filter((e) => e.from[0] === nodeId || e.to[0] === nodeId)
  })
})

server.registerTool('graph_patch', {
  title: 'Patch the graph',
  description:
    'Apply semantic operations. Nothing is written unless every operation applies and the result validates, ' +
    'so a rejected patch leaves the graph exactly as it was. Checkpoints automatically.',
  inputSchema: {
    ops: z.array(z.discriminatedUnion('op', [
      z.object({ op: z.literal('add_node'), type: z.string(), id: z.string().optional(),
                 pins: z.record(z.string(), z.any()).optional() }),
      z.object({ op: z.literal('connect'), from: z.tuple([z.string(), z.string()]),
                 to: z.tuple([z.string(), z.string()]) }),
      z.object({ op: z.literal('set_pin'), node: z.string(), pin: z.string(), value: z.any() }),
      z.object({ op: z.literal('delete_node'), id: z.string() })
    ])).min(1),
    message: z.string().optional().describe('checkpoint label')
  }
}, async ({ ops, message }) => {
  const before = await load()
  const g = structuredClone(before)
  const applied = []

  for (const [i, op] of ops.entries()) {
    const at = `ops[${i}]`
    if (op.op === 'add_node') {
      if (!NODES[op.type]) return fail({ code: 'node.unknownType', message: `unknown type "${op.type}"`, at })
      const id = op.id ?? mintId(g, op.type)
      if (g.nodes.some((n) => n.id === id)) return fail({ code: 'node.duplicate', message: `id ${id} exists`, at })
      g.nodes.push({ id, type: op.type, ...(op.pins ? { pins: op.pins } : {}) })
      applied.push({ op: 'add_node', id, type: op.type })
    } else if (op.op === 'connect') {
      g.edges.push({ from: op.from, to: op.to })
      applied.push({ op: 'connect', from: op.from, to: op.to })
    } else if (op.op === 'set_pin') {
      const n = g.nodes.find((x) => x.id === op.node)
      if (!n) return fail({ code: 'node.notFound', message: `no node ${op.node}`, at })
      if (!NODES[n.type]?.pins?.[op.pin]) return fail({ code: 'pin.notFound', message: `${n.type} has no pin "${op.pin}"`, at })
      n.pins = { ...(n.pins ?? {}), [op.pin]: op.value }
      applied.push({ op: 'set_pin', node: op.node, pin: op.pin })
    } else if (op.op === 'delete_node') {
      const idx = g.nodes.findIndex((x) => x.id === op.id)
      if (idx === -1) return fail({ code: 'node.notFound', message: `no node ${op.id}`, at })
      g.nodes.splice(idx, 1)
      g.edges = g.edges.filter((e) => e.from[0] !== op.id && e.to[0] !== op.id)
      applied.push({ op: 'delete_node', id: op.id })
    }
  }

  const errors = validateGraph(g)
  if (errors.length) return fail({ code: 'patch.invalid', message: 'graph would not validate; nothing was written', errors })

  checkpoints.push({ n: checkpoints.length + 1, message: message ?? 'before patch', graph: before })
  await save(g)
  return text({ applied, checkpoint: checkpoints.length, nodes: g.nodes.length, edges: g.edges.length })
})

server.registerTool('build_run', {
  title: 'Compile the graph',
  description: 'Compiles to TypeScript. Errors come back against node ids, not file lines.',
  inputSchema: { emit: z.boolean().optional().describe('include the generated source') }
}, async ({ emit }) => {
  const g = await load()
  const r = compileGraph(g, { module: 'graph' })
  if (!r.ok) return fail({ ok: false, errors: r.errors })
  return text({ ok: true, bytes: r.code.length, ...(emit ? { code: r.code } : {}) })
})

server.registerTool('test_headless', {
  title: 'Run the game headlessly and assert',
  description:
    'Runs the compiled graph for N fixed-step frames against a scripted input trace and checks assertions. ' +
    'This is how an agent verifies its own edit instead of guessing.',
  inputSchema: {
    frames: z.number().int().positive().max(100000).default(300),
    trace: z.array(z.object({
      frame: z.number().int().nonnegative(),
      kind: z.enum(['hit']),
      entity: z.number().int().positive().optional()
    })).default([]),
    assertions: z.array(z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('count'), tag: z.string(), equals: z.number() }),
      z.object({ kind: z.literal('field'), entity: z.number(), field: z.string(), equals: z.any() })
    ])).default([])
  }
}, async ({ frames, trace, assertions }) => {
  const g = await load()
  const built = compileGraph(g, { module: 'graph', lang: 'js', runtime: RUNTIME })
  if (!built.ok) return fail({ ok: false, stage: 'compile', errors: built.errors })

  let snapshot
  try {
    const mod = await import('data:text/javascript;base64,' + Buffer.from(built.code, 'utf8').toString('base64'))
    snapshot = runHeadless(mod, { frames, trace }).snapshot
  } catch (e) {
    return fail({ ok: false, stage: 'run', message: String(e) })
  }

  const results = assertions.map((a) => {
    if (a.kind === 'count') {
      const got = count(snapshot, a.tag)
      return { ...a, got, pass: got === a.equals }
    }
    const e = snapshot.entities.find((x) => x.id === a.entity)
    const got = e?.[a.field]
    return { ...a, got, pass: got === a.equals }
  })

  const pass = results.every((r) => r.pass)
  const body = { ok: pass, frames, entities: snapshot.entities.length, assertions: results, snapshot }
  return pass ? text(body) : fail(body)
})

server.registerTool('history_checkpoint', {
  title: 'Checkpoint',
  description: 'Save the current graph so it can be returned to.',
  inputSchema: { message: z.string().default('manual') }
}, async ({ message }) => {
  checkpoints.push({ n: checkpoints.length + 1, message, graph: await load() })
  return text({ checkpoint: checkpoints.length, message })
})

server.registerTool('history_revert', {
  title: 'Revert',
  description: 'Restore a checkpoint. Reverting is itself checkpointed.',
  inputSchema: { checkpoint: z.number().int().positive().optional().describe('defaults to the most recent') }
}, async ({ checkpoint }) => {
  if (!checkpoints.length) return fail({ code: 'history.empty', message: 'nothing to revert to' })
  const n = checkpoint ?? checkpoints.length
  const cp = checkpoints.find((c) => c.n === n)
  if (!cp) return fail({ code: 'history.notFound', message: `no checkpoint ${n}` })
  checkpoints.push({ n: checkpoints.length + 1, message: `before revert to ${n}`, graph: await load() })
  await save(cp.graph)
  return text({ revertedTo: n, message: cp.message })
})

await server.connect(new StdioServerTransport())

/**
 * Drives the MCP server the way a real client does — over stdio, through the
 * SDK client — so the thing under test is the protocol surface an agent sees.
 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

const SERVER = fileURLToPath(new URL('./server.mjs', import.meta.url))
const SOURCE = fileURLToPath(new URL('../../examples/drift.graph.json', import.meta.url))

let client, dir, graphFile

const call = async (name, args = {}) => {
  const r = await client.callTool({ name, arguments: args })
  const body = r.content?.[0]?.text
  return { isError: !!r.isError, data: body ? JSON.parse(body) : null }
}

before(async () => {
  dir = await mkdtemp(join(tmpdir(), 'synapse-mcp-'))
  graphFile = join(dir, 'drift.graph.json')
  await writeFile(graphFile, await readFile(SOURCE, 'utf8'))

  client = new Client({ name: 'test', version: '0' })
  await client.connect(new StdioClientTransport({
    command: process.execPath, args: [SERVER, graphFile]
  }))
})

after(async () => {
  await client?.close()
  await rm(dir, { recursive: true, force: true })
})

test('the surface is operations, and file access is not among them', async () => {
  const { tools } = await client.listTools()
  const names = tools.map((t) => t.name).sort()
  assert.deepEqual(names, [
    'build_run', 'graph_patch', 'graph_read', 'history_checkpoint',
    'history_revert', 'project_overview', 'test_headless'
  ])
  // the absence is the design: no filesystem, and no publish
  for (const forbidden of ['read_file', 'write_file', 'edit_file', 'publish', 'shell']) {
    assert.ok(!names.includes(forbidden), `${forbidden} must not be exposed`)
  }
})

test('project_overview answers the first question an agent asks', async () => {
  const { data } = await call('project_overview')
  assert.equal(data.valid, true)
  assert.equal(data.nodes, 8)
  assert.equal(data.kinds.event, 3)
  assert.ok(data.availableNodeTypes.includes('world/spawn'))
})

test('test_headless verifies the graph as it stands', async () => {
  const { isError, data } = await call('test_headless', {
    frames: 300,
    trace: [{ frame: 90, kind: 'hit', entity: 2 }],
    assertions: [
      { kind: 'count', tag: 'drone', equals: 4 },
      { kind: 'field', entity: 2, field: 'ink', equals: 'signal' }
    ]
  })
  assert.equal(isError, false)
  assert.equal(data.ok, true)
  assert.ok(data.assertions.every((a) => a.pass))
})

test('a patch that would break the graph is refused and changes nothing', async () => {
  const before = await readFile(graphFile, 'utf8')
  const { isError, data } = await call('graph_patch', {
    ops: [{ op: 'connect', from: ['01JA0START', 'exec'], to: ['01JB0TICK', 'exec'] }]
  })
  assert.equal(isError, true)
  assert.equal(data.code, 'patch.invalid')
  assert.ok(data.errors.some((e) => e.code === 'edge.intoEvent'))
  assert.equal(await readFile(graphFile, 'utf8'), before, 'the file must be untouched')
})

test('an unknown node type is refused by name', async () => {
  const { isError, data } = await call('graph_patch', {
    ops: [{ op: 'add_node', type: 'core/teleport' }]
  })
  assert.equal(isError, true)
  assert.equal(data.code, 'node.unknownType')
})

test('a valid edit lands, and the headless run proves it', async () => {
  const patched = await call('graph_patch', {
    ops: [{ op: 'set_pin', node: '01JA1SPAWN', pin: 'count', value: 6 }],
    message: 'six drones'
  })
  assert.equal(patched.isError, false)
  assert.equal(patched.data.checkpoint, 1)

  const verified = await call('test_headless', {
    frames: 60, assertions: [{ kind: 'count', tag: 'drone', equals: 6 }]
  })
  assert.equal(verified.data.ok, true)
})

test('a failed assertion comes back as an error the agent can act on', async () => {
  const { isError, data } = await call('test_headless', {
    frames: 60, assertions: [{ kind: 'count', tag: 'drone', equals: 99 }]
  })
  assert.equal(isError, true)
  assert.equal(data.ok, false)
  assert.equal(data.assertions[0].got, 6)
})

test('revert puts the graph back', async () => {
  const { isError } = await call('history_revert', { checkpoint: 1 })
  assert.equal(isError, false)
  const { data } = await call('test_headless', {
    frames: 60, assertions: [{ kind: 'count', tag: 'drone', equals: 4 }]
  })
  assert.equal(data.ok, true)
})

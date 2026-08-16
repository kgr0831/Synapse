#!/usr/bin/env node
/**
 * synapse-graph — IMPL.md M4.4.
 *
 * The compiler ships before the editor on purpose: if a graph can be built
 * from the command line, the Studio is a UI over something that already
 * works rather than the only way to find out whether it does.
 *
 *   node packages/graph/cli.mjs compile examples/drift.graph.json [-o out.ts]
 *   node packages/graph/cli.mjs check   examples/drift.graph.json
 */
import { readFile, writeFile } from 'node:fs/promises'
import { basename } from 'node:path'
import { compileGraph, validateGraph } from './compile.mjs'

const [cmd, file, ...rest] = process.argv.slice(2)

if (!cmd || !file || !['compile', 'check'].includes(cmd)) {
  console.error('usage: synapse-graph <compile|check> <graph.json> [-o out.ts]')
  process.exit(2)
}

let graph
try {
  graph = JSON.parse(await readFile(file, 'utf8'))
} catch (e) {
  console.error(`cannot read ${file}: ${e.message}`)
  process.exit(2)
}

const name = basename(file).replace(/\.graph\.json$|\.json$/, '')

if (cmd === 'check') {
  const errors = validateGraph(graph)
  if (!errors.length) { console.log(`ok  ${file}`); process.exit(0) }
  // Errors carry the node id, not a file line — an agent edits nodes, not text.
  for (const e of errors) console.error(`  ${e.code}  ${e.message}${e.at ? `  [${e.at}]` : ''}`)
  console.error(`\n${errors.length} problem(s) in ${file}`)
  process.exit(1)
}

const { ok, errors, code } = compileGraph(graph, { module: name })
if (!ok) {
  for (const e of errors) console.error(`  ${e.code}  ${e.message}${e.at ? `  [${e.at}]` : ''}`)
  console.error(`\n${errors.length} problem(s) in ${file}`)
  process.exit(1)
}

const outFlag = rest.indexOf('-o')
if (outFlag !== -1 && rest[outFlag + 1]) {
  await writeFile(rest[outFlag + 1], code)
  console.log(`wrote ${rest[outFlag + 1]}`)
} else {
  process.stdout.write(code)
}

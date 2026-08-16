# Synapse

A WebGPU 3D game engine that lives in the browser: build the game as a node graph, let an
agent edit the same graph over MCP, ship it with a link.

Status: pre-alpha. Nothing in `web/` is the engine yet — it is the landing page.

## Run it

```bash
npm install
npm run dev
```

Then open http://localhost:5173.

`npm run build` writes a static site to `dist/`. There is no framework and no bundling to
speak of yet — `web/index.html` is one self-contained file with inline CSS and JS, so Vite is
here for the dev server and the localhost origin, not because anything needs compiling.
That changes when the engine starts (see [PLAN.md](PLAN.md) §10).

## Deploy

Pushing to `main` deploys to GitHub Pages via `.github/workflows/pages.yml` — free, and no
account beyond GitHub. Enable it once under **Settings → Pages → Source: GitHub Actions**.

The site is served from a subpath, so the workflow builds with `--base=/Synapse/`. Local dev
is unaffected. This host has no server side; it carries the static pages until uploads and
auth arrive, at which point the plan moves to Cloudflare — see [IMPL.md](IMPL.md) §4.

## Other commands

```bash
npm test
```

Unit tests for the bundle validator, the graph compiler, and the headless
runner. `npm run check` audits both pages at four widths, twice — once with the
brand fonts and once with them forced to a generic fallback, because the display
stack is a Windows and macOS assumption and stock Linux is wider.

Compile a graph without an editor:

```bash
node packages/graph/cli.mjs compile examples/drift.graph.json
```

## Connect an agent

`.mcp.json` registers a local MCP server over stdio, so an agent can edit the
example graph through semantic operations — `graph_patch`, `build_run`,
`test_headless` — and verify its own work. There is no read_file, no
write_file, and no publish: the agent never sees the document's syntax, and a
patch that would not validate is refused without touching the file.

```bash
node packages/mcp/server.mjs examples/drift.graph.json
```

## Layout

| Path | What |
|---|---|
| `web/index.html` | Landing page — source of truth |
| `web/status/webgpu/` | Device report page — what your browser exposes |
| `packages/graph/` | graph.json → TypeScript, one direction only |
| `packages/engine/` | Runtime the generated code calls, plus the headless runner |
| `packages/bundle/` | bundle.json spec and validator |
| `examples/` | The graph the landing page hero is built from |
| `scripts/` | Layout check and the S1 capture spike |
| `brand/` | Logo. Served at the site root by Vite |
| [PLAN.md](PLAN.md) | Product and site plan: scope, roadmap, open decisions |
| [IMPL.md](IMPL.md) | Engineering plan: risk spikes, milestones, frozen interfaces |
| [DESIGN.md](DESIGN.md) | Visual system: inks, type, structure, components |
| [CLAUDE.md](CLAUDE.md) | Working principles for agents on this repo |

## Notes

WebGPU needs a secure context. `localhost` and `https` both qualify; opening
`web/index.html` straight off the filesystem may work in Chrome but is not worth relying on.
When WebGPU is unavailable the hero falls back to a software rasteriser and says so — that
fallback path is a product feature, not a bug, so keep it working.

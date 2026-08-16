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

## Layout

| Path | What |
|---|---|
| `web/index.html` | Landing page — source of truth |
| `brand/` | Logo. Served at the site root by Vite |
| [PLAN.md](PLAN.md) | Product and site plan: scope, roadmap, open decisions |
| [DESIGN.md](DESIGN.md) | Visual system: inks, type, structure, components |
| [CLAUDE.md](CLAUDE.md) | Working principles for agents on this repo |

## Notes

WebGPU needs a secure context. `localhost` and `https` both qualify; opening
`web/index.html` straight off the filesystem may work in Chrome but is not worth relying on.
When WebGPU is unavailable the hero falls back to a software rasteriser and says so — that
fallback path is a product feature, not a bug, so keep it working.

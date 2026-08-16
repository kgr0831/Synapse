/**
 * Headless runner — the miniature of MCP's test.headless (PLAN.md section 7.2).
 *
 * Without a way to check its own work an agent produces a plausible graph and
 * stops. This runs a compiled graph over a scripted input trace at a fixed
 * timestep and hands back a snapshot to assert against, so the loop can close:
 * patch, run, assert, repair.
 */
import { createWorld, snapshot } from './world.mjs'

/**
 * @param {object} mod                compiled graph module (onStart / onTick / onHit)
 * @param {object} [opts]
 * @param {number} [opts.frames]      fixed-step frames to run
 * @param {number} [opts.dt]          seconds per frame — fixed, never wall clock
 * @param {number} [opts.seed]
 * @param {Array<{frame:number, kind:string, entity?:number}>} [opts.trace]
 * @returns {{world:object, snapshot:object, events:string[]}}
 */
export function runHeadless(mod, { frames = 300, dt = 1 / 60, seed = 1, trace = [] } = {}) {
  const w = createWorld({ seed })
  const events = []

  mod.onStart?.(w)
  events.push('start')

  // group the trace by frame so lookup stays O(1) and order is deterministic
  const byFrame = new Map()
  for (const ev of trace) {
    if (!byFrame.has(ev.frame)) byFrame.set(ev.frame, [])
    byFrame.get(ev.frame).push(ev)
  }

  for (let f = 0; f < frames; f++) {
    for (const ev of byFrame.get(f) ?? []) {
      if (ev.kind === 'hit') {
        const e = w.entities.find((x) => x.id === ev.entity)
        if (e) { mod.onHit?.(w, e); events.push(`hit:${ev.entity}@${f}`) }
      }
    }
    mod.onTick?.(w, dt)
    w.t += dt
  }

  return { world: w, snapshot: snapshot(w), events }
}

/** Convenience for assertions an agent would write. */
export function count(snap, tagName) {
  return snap.entities.filter((e) => e.tag === tagName).length
}

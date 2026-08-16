/**
 * @synapse/engine — the runtime the generated graph code calls into.
 *
 * A deliberately small slice (IMPL.md M3): enough surface for the node library
 * to compile against and for the headless runner to verify, with no renderer.
 * The renderer arrives later; determinism has to be right first, because
 * test.headless is what lets an agent check its own work (PLAN.md section 7.2).
 *
 * Determinism rules held here:
 *   - entity ids are sequential, never reused
 *   - no Math.random; rand() draws from a seeded generator on the world
 *   - no Date/now; time advances only by the dt handed to step()
 */

/** Small seeded PRNG. Same seed, same sequence, on every platform. */
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function createWorld({ seed = 1 } = {}) {
  return { entities: [], nextId: 1, t: 0, _rng: mulberry32(seed) }
}

/* ── selectors ──────────────────────────────────────────── */

export function tag(name) {
  return { kind: 'tag', name }
}

function select(w, selector) {
  if (!selector) return w.entities
  if (selector.kind === 'tag') return w.entities.filter((e) => e.tag === selector.name)
  return []
}

/* ── pure helpers the graph inlines ─────────────────────── */

/** A placement descriptor, resolved by spawn — not a random draw. */
export function scatter({ radius = 1 } = {}) {
  return { kind: 'scatter', radius }
}

export function rand(w, min = 0, max = 1) {
  return min + (max - min) * w._rng()
}

/* ── actions ────────────────────────────────────────────── */

export function spawn(w, tagName, { count = 1, at = null } = {}) {
  const radius = at && at.kind === 'scatter' ? at.radius : 0
  const made = []
  for (let i = 0; i < count; i++) {
    const e = {
      id: w.nextId++,
      tag: tagName,
      // evenly placed, so a spawn is reproducible without consuming randomness
      angle: count > 1 ? (i * 2 * Math.PI) / count : 0,
      radius,
      speedMul: 1,
      ink: 'ink'
    }
    w.entities.push(e)
    made.push(e)
  }
  return made
}

export function orbit(w, selector, { speed = 0 } = {}) {
  for (const e of select(w, selector)) e.angle += speed * e.speedMul
}

export function boost(e, mul = 1) {
  e.speedMul *= mul
}

export function tint(e, ink) {
  e.ink = ink
}

export function destroy(w, e) {
  const i = w.entities.indexOf(e)
  if (i !== -1) w.entities.splice(i, 1)
}

/* ── reading the world ──────────────────────────────────── */

export function position(e) {
  return [Math.cos(e.angle) * e.radius, 0, Math.sin(e.angle) * e.radius]
}

/** Stable, comparable state dump — the unit a headless assertion works on. */
export function snapshot(w) {
  const r = (n) => Number(n.toFixed(6))
  return {
    t: r(w.t),
    entities: [...w.entities]
      .sort((a, b) => a.id - b.id)
      .map((e) => ({
        id: e.id, tag: e.tag, ink: e.ink,
        angle: r(e.angle), radius: r(e.radius), speedMul: r(e.speedMul),
        pos: position(e).map(r)
      }))
  }
}

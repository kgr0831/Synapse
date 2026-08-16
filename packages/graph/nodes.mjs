/**
 * Node library v1 — IMPL.md M4.2.
 *
 * Deliberately small. Every node declares its pins and how it renders to
 * TypeScript; the compiler knows nothing else about them, so adding a node is
 * adding an entry here rather than editing the compiler.
 *
 * kinds
 *   event  entry point. Becomes an exported function.
 *   action has an exec pin. Becomes a statement.
 *   pure   no exec pin. Becomes an expression.
 *   flow   control. Owns its own emit.
 */

const lit = (v) => JSON.stringify(v)

export const NODES = {
  'core/on_start': {
    kind: 'event', fn: 'onStart', params: 'w: World'
  },
  'core/on_tick': {
    kind: 'event', fn: 'onTick', params: 'w: World, dt: number'
  },
  'core/on_hit': {
    kind: 'event', fn: 'onHit', params: 'w: World, e: Entity'
  },

  'world/spawn': {
    kind: 'action',
    pins: { tag: { type: 'string', default: 'drone' },
            count: { type: 'number', default: 1 },
            at: { type: 'vec3', default: null } },
    emit: (p) => `spawn(w, ${p.tag}, { count: ${p.count}${p.at !== 'null' ? `, at: ${p.at}` : ''} });`
  },
  'world/orbit': {
    kind: 'action',
    pins: { tag: { type: 'string', default: 'drone' },
            speed: { type: 'number', default: 1 } },
    emit: (p) => `orbit(w, tag(${p.tag}), { speed: ${p.speed} * dt });`
  },
  'entity/boost': {
    kind: 'action',
    pins: { mul: { type: 'number', default: 1.5 } },
    emit: (p) => `boost(e, ${p.mul});`
  },
  'entity/tint': {
    kind: 'action',
    pins: { ink: { type: 'string', default: 'signal' } },
    emit: (p) => `tint(e, ${p.ink});`
  },
  'core/log': {
    kind: 'action',
    pins: { message: { type: 'string', default: '' } },
    emit: (p) => `console.log(${p.message});`
  },

  'math/scatter': {
    kind: 'pure',
    pins: { radius: { type: 'number', default: 1 } },
    emit: (p) => `scatter({ radius: ${p.radius} })`
  },
  'math/random': {
    kind: 'pure',
    pins: { min: { type: 'number', default: 0 }, max: { type: 'number', default: 1 } },
    emit: (p) => `rand(${p.min}, ${p.max})`
  },

  'flow/branch': {
    kind: 'flow',
    pins: { cond: { type: 'bool', default: true } },
    execOut: ['then', 'else']
  }
}

/** Renders a pin value that was never wired to anything. */
export function literal(type, value) {
  if (value === null || value === undefined) return 'null'
  if (type === 'number') return String(value)
  if (type === 'bool') return value ? 'true' : 'false'
  return lit(String(value))
}

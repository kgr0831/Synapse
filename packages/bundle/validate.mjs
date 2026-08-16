/**
 * bundle.json validation — IMPL.md section 6.1.
 *
 * The manifest is a frozen interface: it decides what the play page checks
 * before it ever starts a build, so the shape has to be settled before M1
 * writes anything against it. `spec` is the version field that lets it move.
 *
 * Errors block a publish. Warnings appear on the pre-publish report and the
 * creator decides.
 */

export const SPEC = 1

export const LIMITS = {
  maxTotalBytes: 500 * 1024 * 1024,   // free-tier cap per game (PLAN.md Q4)
  warnInitialBytes: 8 * 1024 * 1024,  // advisory initial payload (PLAN.md section 9)
  maxFiles: 5000,
  maxNameLen: 80
}

const CANVAS_MODES = ['fill', 'fixed']
const INPUTS = ['keyboard', 'mouse', 'gamepad', 'touch', 'pointerlock']
const SAVES = ['none', 'local']

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
const isStr = (v) => typeof v === 'string'
const isPosInt = (v) => Number.isInteger(v) && v > 0

/**
 * @param {object} input
 * @param {object} input.manifest  parsed bundle.json
 * @param {Array<{path:string,bytes:number}>} input.files  zip contents
 * @returns {{ok:boolean, errors:Array, warnings:Array}}
 */
export function validateBundle({ manifest, files = [] }) {
  const errors = []
  const warnings = []
  const err = (code, message, at) => errors.push({ code, message, at })
  const warn = (code, message, at) => warnings.push({ code, message, at })

  if (!isObj(manifest)) {
    err('manifest.missing', 'bundle.json is missing or is not an object')
    return { ok: false, errors, warnings }
  }

  if (manifest.spec !== SPEC) {
    err('spec.unsupported', `spec must be ${SPEC}, got ${JSON.stringify(manifest.spec)}`, 'spec')
  }

  if (!isStr(manifest.name) || !manifest.name.trim()) {
    err('name.missing', 'name is required', 'name')
  } else if (manifest.name.length > LIMITS.maxNameLen) {
    err('name.tooLong', `name must be ${LIMITS.maxNameLen} characters or fewer`, 'name')
  }

  // entry
  const paths = new Set(files.map((f) => f.path))
  if (!isStr(manifest.entry) || !manifest.entry) {
    err('entry.missing', 'entry is required', 'entry')
  } else if (files.length && !paths.has(manifest.entry)) {
    err('entry.notFound', `entry "${manifest.entry}" is not in the bundle`, 'entry')
  }

  // canvas
  if (manifest.canvas !== undefined) {
    if (!isObj(manifest.canvas)) {
      err('canvas.invalid', 'canvas must be an object', 'canvas')
    } else {
      if (!CANVAS_MODES.includes(manifest.canvas.mode)) {
        err('canvas.mode', `canvas.mode must be one of ${CANVAS_MODES.join(', ')}`, 'canvas.mode')
      }
      if (manifest.canvas.mode === 'fixed' &&
          !(isPosInt(manifest.canvas.width) && isPosInt(manifest.canvas.height))) {
        err('canvas.size', 'fixed canvas needs positive integer width and height', 'canvas')
      }
    }
  }

  // input
  if (manifest.input !== undefined) {
    if (!Array.isArray(manifest.input)) {
      err('input.invalid', 'input must be an array', 'input')
    } else {
      for (const i of manifest.input) {
        if (!INPUTS.includes(i)) err('input.unknown', `unknown input "${i}"`, 'input')
      }
    }
  }

  // requires — this block drives capability gating, so it is strict
  if (manifest.requires !== undefined) {
    if (!isObj(manifest.requires)) {
      err('requires.invalid', 'requires must be an object', 'requires')
    } else {
      const r = manifest.requires
      if (r.webgpu !== undefined && typeof r.webgpu !== 'boolean') {
        err('requires.webgpu', 'requires.webgpu must be a boolean', 'requires.webgpu')
      }
      if (r.features !== undefined) {
        if (!Array.isArray(r.features) || !r.features.every(isStr)) {
          err('requires.features', 'requires.features must be an array of strings', 'requires.features')
        }
      }
      if (r.limits !== undefined) {
        if (!isObj(r.limits) || !Object.values(r.limits).every((v) => typeof v === 'number')) {
          err('requires.limits', 'requires.limits must map limit names to numbers', 'requires.limits')
        }
      }
    }
  } else {
    warn('requires.absent',
      'no requires block, so every device will be asked to run this — declare it to get a fallback instead of a black screen',
      'requires')
  }

  if (manifest.save !== undefined && !SAVES.includes(manifest.save)) {
    err('save.invalid', `save must be one of ${SAVES.join(', ')}`, 'save')
  }
  if (manifest.telemetry !== undefined && typeof manifest.telemetry !== 'boolean') {
    err('telemetry.invalid', 'telemetry must be a boolean', 'telemetry')
  }

  // files
  for (const f of files) {
    if (f.path.startsWith('/') || /^[a-zA-Z]:/.test(f.path) || f.path.split('/').includes('..')) {
      err('file.unsafePath', `unsafe path "${f.path}"`, f.path)
    }
  }
  if (files.length > LIMITS.maxFiles) {
    err('files.tooMany', `${files.length} files exceeds the ${LIMITS.maxFiles} limit`)
  }

  const total = files.reduce((a, f) => a + (f.bytes || 0), 0)
  if (total > LIMITS.maxTotalBytes) {
    err('size.overCap', `${mb(total)} exceeds the ${mb(LIMITS.maxTotalBytes)} per-game cap`)
  } else if (total > LIMITS.warnInitialBytes) {
    const textures = files.filter((f) => /\.(png|jpe?g)$/i.test(f.path))
    const texBytes = textures.reduce((a, f) => a + (f.bytes || 0), 0)
    warn('size.overBudget',
      `${mb(total)} total against an advised ${mb(LIMITS.warnInitialBytes)} initial payload` +
      (texBytes ? ` — ${mb(texBytes)} of it is uncompressed texture, which KTX2 would shrink` : ''))
  }

  return { ok: errors.length === 0, errors, warnings }
}

/** Best guess when a bundle arrives without a manifest — never written silently. */
export function inferManifest(files = []) {
  const html = files.map((f) => f.path).filter((p) => p.toLowerCase().endsWith('.html'))
  const entry = html.find((p) => /(^|\/)index\.html$/i.test(p)) ?? html[0]
  return {
    spec: SPEC,
    name: 'Untitled',
    entry: entry ?? 'index.html',
    canvas: { mode: 'fill' },
    requires: { webgpu: true },
    save: 'none',
    telemetry: true,
    _inferred: true
  }
}

const mb = (b) => (b / 1024 / 1024).toFixed(1) + ' MB'

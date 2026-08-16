/**
 * Spike S1 — can we run WebGPU in a headless browser?
 *
 * The pre-publish report (screenshots, fallback recording, load timing, shader
 * failures) is the whole of the P1 differentiator, and all of it depends on
 * this answering yes. See IMPL.md section 3.
 *
 * Tries several Chromium flag sets against the device-report page and prints
 * which ones produce a working adapter. Correctness of the flags is the answer
 * we are looking for; the code quality here is deliberately throwaway.
 *
 *   node scripts/spike-capture.mjs [url]
 */
import { chromium } from 'playwright'
import { mkdir, writeFile } from 'node:fs/promises'

const URL_ = process.argv[2] ?? 'http://localhost:5173/status/webgpu/'
const OUT = 'artifacts/spike-s1'

/* Findings so far (Windows, local):
     headless bundled Chromium  navigator.gpu present, requestAdapter() -> null
     headless system Chrome     same
     headed  system Chrome      works, real hardware adapter
   So the blocker is the absence of a display, not headlessness as such. On
   Linux that means running headed under Xvfb, which is what CI tests. */
const WIN = process.platform === 'win32'

const CONFIGS = WIN ? [
  { name: 'headless-nosandbox', headless: true,
    args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan', '--use-angle=swiftshader',
           '--use-gl=angle', '--disable-gpu-sandbox', '--no-sandbox'] },
  { name: 'headless-chrome', headless: true, channel: 'chrome',
    args: ['--enable-unsafe-webgpu', '--use-angle=swiftshader', '--use-gl=angle'] },
  { name: 'headed-chrome', headless: false, channel: 'chrome',
    args: ['--enable-unsafe-webgpu'] }
] : [
  { name: 'headless-swiftshader', headless: true,
    args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan', '--use-angle=swiftshader',
           '--use-gl=angle', '--no-sandbox'] },
  { name: 'xvfb-headed-swiftshader', headless: false,
    args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan', '--use-angle=swiftshader',
           '--use-gl=angle', '--no-sandbox'] },
  { name: 'xvfb-headed-plain', headless: false,
    args: ['--enable-unsafe-webgpu', '--no-sandbox'] }
]

/* A software adapter still measures payload, load time and shader compilation
   correctly; only frame timing becomes meaningless. Worth reporting apart. */
const isSoftware = (a) => {
  const s = `${a?.vendor ?? ''} ${a?.architecture ?? ''} ${a?.description ?? ''}`.toLowerCase()
  return /swiftshader|llvmpipe|lavapipe|software|microsoft basic/.test(s)
}

async function attempt(cfg) {
  const started = Date.now()
  const row = { config: cfg.name, args: cfg.args, ok: false }
  let browser
  try {
    browser = await chromium.launch({
      headless: cfg.headless ?? true,
      channel: cfg.channel,
      args: cfg.args
    })
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
    const consoleErrors = []
    page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 120)) })

    await page.goto(URL_, { waitUntil: 'load', timeout: 30_000 })
    // the page writes its verdict into #h-state once probing settles
    await page.waitForFunction(
      () => ['ready', 'unsupported'].includes(document.getElementById('h-state')?.textContent),
      null, { timeout: 30_000 }
    ).catch(() => {})

    const report = await page.evaluate(() => {
      try { return JSON.parse(document.getElementById('out').textContent) } catch { return null }
    })

    row.webgpu = report?.webgpu ?? false
    row.adapter = report?.adapter ?? null
    row.features = report?.features?.length ?? 0
    row.probes = report?.probes ?? null
    row.pageError = report?.error ?? null
    row.consoleErrors = consoleErrors.slice(0, 3)
    row.ok = !!report?.webgpu

    if (row.ok) {
      // does the render path actually produce pixels, and can we time frames?
      await page.click('#b-run').catch(() => {})
      await page.waitForFunction(
        () => { try { return !!JSON.parse(document.getElementById('out').textContent).bench } catch { return false } },
        null, { timeout: 40_000 }
      ).catch(() => {})
      row.bench = await page.evaluate(() => {
        try { return JSON.parse(document.getElementById('out').textContent).bench } catch { return null }
      })
    }

    await page.screenshot({ path: `${OUT}/${cfg.name}.png`, fullPage: false })
    row.screenshot = `${OUT}/${cfg.name}.png`
  } catch (e) {
    row.error = String(e).split('\n')[0].slice(0, 160)
  } finally {
    await browser?.close()
  }
  row.ms = Date.now() - started
  return row
}

await mkdir(OUT, { recursive: true })

const results = []
for (const cfg of CONFIGS) {
  process.stdout.write(`· ${cfg.name} … `)
  const r = await attempt(cfg)
  results.push(r)
  console.log(r.ok
    ? `WebGPU ok (${r.adapter?.vendor || '?'}/${r.adapter?.architecture || '?'}, ${r.features} features)`
    : `no webgpu${r.error ? ' — ' + r.error : ''}`)
}

await writeFile(`${OUT}/result.json`, JSON.stringify(results, null, 2))

const winners = results.filter((r) => r.ok)
console.log('\n──────── S1 verdict ────────')
if (!winners.length) {
  console.log('FAIL  no flag set produced a WebGPU adapter in headless Chromium.')
  console.log('      Fallback per IMPL.md: run capture on a GPU-backed machine.')
} else {
  const w = winners[0]
  const soft = isSoftware(w.adapter)
  console.log(`PASS  ${winners.length}/${results.length} configs work. Cheapest: ${w.config}`)
  console.log(`      args: ${JSON.stringify(w.args)}`)
  console.log(`      adapter: ${w.adapter?.vendor || '?'}/${w.adapter?.architecture || '?'} ` +
              `(${soft ? 'SOFTWARE' : 'hardware'})`)
  const b = w.bench
  console.log(b?.avgMs != null
    ? `      benchmark ran, avg ${b.avgMs} ms`
    : `      frame timing unavailable (${b?.reason ?? 'benchmark did not complete'})`)
  if (soft) {
    console.log('      CAVEAT  software adapter: payload, load time and shader compilation')
    console.log('              are valid measurements; frame timing is NOT.')
  }
}
console.log(`\nartifacts → ${OUT}/`)

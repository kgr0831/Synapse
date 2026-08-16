/**
 * Layout regression check — IMPL.md section 9.
 *
 * Catches the class of bug that is invisible to a build and easy to miss by
 * eye: a descendant selector applying a grid to a nested wrapper, or a bare
 * `1fr` column keeping min-width:auto so a nowrap table pushes the page
 * sideways. Both shipped here once already.
 *
 *   node scripts/check-layout.mjs [baseUrl]     default http://localhost:5173
 */
import { chromium } from 'playwright'

const BASE = (process.argv[2] ?? 'http://localhost:5173').replace(/\/$/, '')
const PAGES = ['/', '/status/webgpu/']
const WIDTHS = [375, 768, 1280, 1920]

/* The display stack (Haettenschweiler / Impact / Arial Narrow) exists on
   Windows and macOS but not on a stock Linux box, and the fallback has wider
   metrics. Checking only the pretty case hides breakage from most Linux
   visitors — and from CI, which is where this first showed up. */
const FONT_MODES = [
  { name: 'brand', css: null },
  { name: 'fallback', css: ':root{--display:sans-serif !important;--narrow:sans-serif !important;}' }
]

const audit = () => {
  const problems = []
  const all = [...document.querySelectorAll('body *')]

  const describe = (el) => {
    const one = (e) => e.tagName.toLowerCase() +
      (e.className ? '.' + String(e.className).trim().split(/\s+/).join('.') : '')
    const chain = []
    for (let e = el, i = 0; e && e !== document.body && i < 3; e = e.parentElement, i++) chain.unshift(one(e))
    return chain.join(' > ')
  }

  for (const el of all) {
    const cs = getComputedStyle(el)
    const where = describe(el)

    // content wider than its box, in something that cannot scroll
    if (cs.overflowX !== 'auto' && cs.overflowX !== 'scroll' &&
        el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 2) {
      problems.push({ kind: 'overflow', where, detail: `${el.scrollWidth} > ${el.clientWidth}` })
    }

    // text crushed into a narrow track — the nested-grid signature
    if (!el.children.length && !cs.writingMode.startsWith('vertical')) {
      const text = (el.textContent ?? '').trim()
      const r = el.getBoundingClientRect()
      if (text.length >= 15 && r.width > 0 && r.width < 50 && r.height > r.width * 2) {
        problems.push({ kind: 'squeezed', where, detail: `${Math.round(r.width)}px wide for ${text.length} chars` })
      }
    }

    // a fixed px box holding text is a font-metric bet that loses on Linux
    if (!el.children.length && cs.overflowX === 'visible' &&
        el.scrollWidth > el.clientWidth + 2 && cs.width.endsWith('px') &&
        parseFloat(cs.width) === Math.round(el.clientWidth)) {
      problems.push({ kind: 'fixed-width-text', where,
        detail: `css width ${cs.width} but content needs ${el.scrollWidth}px` })
    }
  }

  if (document.body.scrollWidth > window.innerWidth + 1) {
    problems.push({ kind: 'page-scroll', where: 'body',
      detail: `${document.body.scrollWidth} > ${window.innerWidth}` })
  }
  return problems
}

const browser = await chromium.launch()
const page = await browser.newPage()
let failures = 0

for (const mode of FONT_MODES) {
  for (const path of PAGES) {
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 900 })
      await page.goto(BASE + path, { waitUntil: 'load' })
      if (mode.css) await page.addStyleTag({ content: mode.css })
      await page.waitForTimeout(150)

      const problems = await page.evaluate(audit)
      const label = `${mode.name.padEnd(8)} ${path} @ ${width}`
      if (!problems.length) {
        console.log(`  ok    ${label}`)
      } else {
        failures += problems.length
        console.log(`  FAIL  ${label}`)
        for (const p of problems) console.log(`        ${p.kind}  ${p.where}  (${p.detail})`)
      }
    }
  }
}

await browser.close()

if (failures) {
  console.log(`\n${failures} layout problem(s).`)
  process.exit(1)
}
console.log('\nNo layout problems.')

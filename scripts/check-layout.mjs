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

const audit = () => {
  const problems = []
  const all = [...document.querySelectorAll('body *')]

  for (const el of all) {
    const cs = getComputedStyle(el)
    const where = el.tagName.toLowerCase() + (el.className ? '.' + String(el.className).trim().split(/\s+/).join('.') : '')

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

for (const path of PAGES) {
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto(BASE + path, { waitUntil: 'load' })
    await page.waitForTimeout(150)

    const problems = await page.evaluate(audit)
    const label = `${path} @ ${width}`
    if (!problems.length) {
      console.log(`  ok    ${label}`)
    } else {
      failures += problems.length
      console.log(`  FAIL  ${label}`)
      for (const p of problems) console.log(`        ${p.kind}  ${p.where}  (${p.detail})`)
    }
  }
}

await browser.close()

if (failures) {
  console.log(`\n${failures} layout problem(s).`)
  process.exit(1)
}
console.log('\nNo layout problems.')

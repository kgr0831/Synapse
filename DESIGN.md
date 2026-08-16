---
version: v0.1
name: Synapse-design-system
description: A printed-matter identity for a WebGPU game engine, built in the Designers Republic / Wipeout tradition. Off-white paper ground, four inks only, compressed heavy display type, roundel badges, and an entry structure where every block carries a number, a three-letter code and a build status. Failure states are hatched, never coloured.

inks:
  paper: "#EDEBE4"
  tint: "#E1DED4"
  stone: "#B7B2A4"
  ink: "#12100E"
  signal: "#FF4B00"
  live: "#00E0FF"

typography:
  display:
    fontFamily: "Haettenschweiler, Impact, 'Franklin Gothic Heavy', 'Arial Narrow', sans-serif"
    textTransform: uppercase
    lineHeight: 0.84
    letterSpacing: -0.005em
  narrow:
    fontFamily: "'Arial Narrow', 'Helvetica Neue', Arial, sans-serif"
  body:
    fontFamily: "Arial, Helvetica, sans-serif"
    fontSize: 15px
    lineHeight: 1.5
  code:
    fontFamily: "'Courier New', 'Nimbus Mono PS', monospace"
    fontSize: 11px
  micro:
    fontFamily: "{typography.narrow.fontFamily}"
    fontSize: 10px
    fontWeight: 700
    letterSpacing: 0.22em
    textTransform: uppercase
  desig:
    fontFamily: "{typography.display.fontFamily}"
    fontSize: 23px
    letterSpacing: 0.05em

rules:
  hairline: 1px solid {inks.stone}
  frame: 2px solid {inks.ink}
  radius: 0
  shadow: none
  gradient: none

components:
  spine: { width: 46px, background: "{inks.ink}", color: "{inks.paper}", position: fixed }
  hud: { height: 32px, background: "{inks.signal}", color: "{inks.ink}", position: sticky }
  entry: { columns: "126px 1fr", borderBottom: "{rules.frame}" }
  gutter: { borderRight: "{rules.frame}", carries: "number · rule · code · label · status" }
  roundel: { shape: circle, fills: "{inks.signal} or {inks.ink}", never: gradient }
  meter: { segments: 12, size: "6x13px", on: "{inks.ink}", off: "{inks.stone}" }
  stamp: { pass: "{inks.live}", warn: "{inks.signal}", fail: hatched }
  node: { width: 128px, border: "{rules.frame}", header: "event={inks.signal} action={inks.ink} pure={inks.tint}" }
---

## Overview

Synapse's surface is **printed matter, not a dashboard.** The ground is off-white paper (`{inks.paper}`), the structure is a numbered sheet, and the whole system runs on four inks with no fifth.

The lineage is deliberate and documented: **The Designers Republic**, who built Wipeout's graphics in 1995 by giving fictional racing teams real corporate identities — logos, liveries, spec sheets, coded designations. That is the correct heritage for a game platform. Borrowing from developer-tool sites (dark canvas, one accent pop, hairline cards, monospace headline) produces the current default look of AI-generated landing pages, and it is what this system exists to avoid.

**Key characteristics**
- Paper ground. No dark mode — the system commits to one printed world and paints every colour explicitly.
- Four inks. Failure is expressed as a 45° hatch, never as a fifth colour.
- Flat only. No gradient, no shadow, no border radius except full circles.
- Compressed heavy display type at large sizes, against 10px tracked-out micro labels. The scale contrast is the voice.
- Every block is an **entry**: a number, a three-letter code, a label, and a build status.

---

## Inks

| Token | Hex | Use |
|---|---|---|
| `{inks.paper}` | #EDEBE4 | The ground. Not white — paper. |
| `{inks.tint}` | #E1DED4 | Fills inside paper areas, pure-node headers. |
| `{inks.stone}` | #B7B2A4 | Hairlines, empty meter segments, secondary text on ink. |
| `{inks.ink}` | #12100E | Type, frames, the spine, reversed panels. |
| `{inks.signal}` | #FF4B00 | The brand. Hero field, HUD bar, wires, warn state, event nodes. |
| `{inks.live}` | #00E0FF | Live/pass only. Used in the smallest quantity of any ink. |

**Rules**
- `{inks.signal}` is a field colour as often as an accent — full-bleed hero, full-width HUD. Its power comes from covering whole planes, not from dotting elements.
- `{inks.live}` never fills a plane. It marks pass states, active wires, the signal in the logo.
- Semantic mapping is fixed: pass = `{inks.live}`, warn = `{inks.signal}`, fail = hatch. A fail state that reaches for red has broken the system.

---

## Typography

No webfonts. The display voice comes from a **compressed heavy grotesque already on the machine** — Haettenschweiler first, Impact as the cross-platform fallback. Body is Arial/Helvetica, which is the correct grotesque for this lineage. Data and codes are Courier New, chosen because it reads as technical document rather than developer tooling.

| Role | Setting | Use |
|---|---|---|
| `{typography.display}` | 22–92px, uppercase, line-height 0.84 | H1, section heads, node titles, stat numbers, wordmark |
| `{typography.desig}` | 23px display | Three-letter entry codes (GRF, AGT, RUN) |
| `{typography.micro}` | 10px / 700 / 0.22em, uppercase | Labels, nav, buttons, captions |
| `{typography.body}` | 15px / 1.5 | Running text, max 64ch |
| `{typography.code}` | 11px Courier | Codes, tool names, logs, legal microtype |

**Principles**
- Display type is set in blocks of 2–4 short lines. Long headlines defeat a compressed face.
- Never set body copy in the display face, and never set display type below 14px.
- Numbers in tables and stats take `font-variant-numeric: tabular-nums`.

---

## Structure

The page is a **sheet**, not a stack of centred sections. Three devices carry that:

**Spine** — a 46px fixed ink column on the left edge carrying the wordmark and, rotated, the system designation and revision. It frames every screen and removes the centred-container reading immediately.

**HUD** — a 32px sticky signal-coloured bar of live readouts in Courier. Real values only; a fake readout in this position is a lie the whole system pays for.

**Entry** — every block is a two-column grid: a 126px gutter and the pane. The gutter carries, top to bottom: entry number in display type, a 34px rule, the three-letter code in `{inks.signal}`, the label in micro, and the build status pinned to the bottom.

Entries alternate paper and ink grounds. Two consecutive grounds of the same colour is a fault.

**Status is structural, not decorative.** Every entry declares `Live`, `In build`, or `Planned`, because the product ships back to front and the page must not imply otherwise.

---

## Components

**`roundel`** — the logo mark. A filled circle with a signal bar broken at the centre and a rotated square in the gap. Flat fills only; the gradient version from earlier drafts is retired. At 20px and below, drop the centre square and thicken the bar.

**`meter`** — twelve 6×13px segments, filled from the left. Lifted directly from Wipeout's craft stat bars, and the reason the compatibility table reads as a spec sheet rather than a dashboard. Use `.o` modifier to fill in `{inks.signal}` when the value is a warning.

**`stamp`** — a grade or verdict chip in narrow 11px/700 at 0.16em. Pass fills `{inks.live}`, warn fills `{inks.signal}`, fail is a 45° hatch at 28–30% over the ground with a 1px frame.

**`node`** — a 128px blueprint node. 2px ink frame, header in display 14px, pin rows in Courier 10px separated by stone hairlines, pins as 6px squares. Header colour encodes kind: event `{inks.signal}`, action `{inks.ink}`, pure `{inks.tint}`. Wires are 2px `{inks.signal}` beziers terminating in a `{inks.live}` square.

**`livery`** — a catalogue card's colour block. Liveries are built from combinations of the four inks, never from new hues, and each carries a roundel plus a `SYN-nn` code.

**`codeblk`** — ink-ground code panel, Courier 11.5px, line-height 1.7. Comments `#6E675C`, keywords `{inks.signal}`, strings `{inks.live}`.

---

## Do's and Don'ts

**Do**
- Let `{inks.signal}` cover whole planes.
- Number every entry and give it a three-letter code — the codes are how the system stays dense without decoration.
- Show real instrumentation. The HUD, the adapter readout and the frame graph report the viewer's own machine.
- Mark build status on every claim.
- Set the display face at large sizes against 10px micro labels. The gap between them is the voice.

**Don't**
- Don't add a fifth ink. Failure is hatched.
- Don't use gradients, shadows, or rounded corners. Circles are the only curve.
- Don't set a dark mode. This is one printed world.
- Don't reach for developer-tool conventions — glass cards, hairline-on-dark, monospace headlines, grid backgrounds with radial masks. That is the look this system replaces.
- Don't centre a container. Content runs to the edges inside the spine and gutter frame.

---

## Known gaps

- **Studio / app density tokens are not defined.** This system covers the marketing surface only. The editor needs its own spacing and control scale before P4.
- The display face is a system fallback stack. A licensed compressed grotesque should replace it before launch; Impact carries meme associations that large sizes only partly outrun.
- Motion is undefined beyond the reduced-motion guard. Any motion added should be mechanical, not eased-and-faded.
- Accessibility: `{inks.signal}` on `{inks.paper}` is acceptable for large display type but fails for body copy. Body text on signal fields must stay at display sizes or switch to `{inks.ink}`.

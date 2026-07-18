---
name: Coast
description: Local-first PWA that turns car maintenance into plain-English road-sign verdicts.
colors:
  guide-sign-blue: "#1b5faa"
  guide-sign-blue-deep: "#164e8c"
  signal-red: "#b3402e"
  signal-amber: "#d98a00"
  signal-green: "#1e7a44"
  daylight-concrete: "#efefea"
  elevated-paper: "#fafaf7"
  sign-face-white: "#ffffff"
  concrete-well: "#f0f0eb"
  asphalt-ink: "#23272b"
  muted-slate: "#6b7076"
  hairline: "#23272b21"
typography:
  display:
    fontFamily: "Overpass, system-ui, sans-serif"
    fontSize: "24px"
    fontWeight: 800
    lineHeight: 1.1
    letterSpacing: "-0.015em"
  title:
    fontFamily: "Overpass, system-ui, sans-serif"
    fontSize: "1.02rem"
    fontWeight: 600
    letterSpacing: "-0.012em"
  body:
    fontFamily: "Overpass, system-ui, sans-serif"
    fontSize: "0.95rem"
    fontWeight: 400
  prose:
    fontFamily: "Newsreader, Georgia, serif"
    fontSize: "15.5px"
    lineHeight: 1.45
  label:
    fontFamily: "Overpass Mono, ui-monospace, monospace"
    fontSize: "11px"
    fontWeight: 500
    letterSpacing: "0.16em"
rounded:
  card: "16px"
  control: "10px"
spacing:
  gap: "16px"
  nav-height: "60px"
components:
  button-primary:
    backgroundColor: "{colors.guide-sign-blue}"
    textColor: "{colors.sign-face-white}"
    rounded: "{rounded.control}"
    padding: "12px 18px"
  button-primary-hover:
    backgroundColor: "{colors.guide-sign-blue-deep}"
  button-danger:
    backgroundColor: "{colors.signal-red}"
    textColor: "{colors.sign-face-white}"
    rounded: "{rounded.control}"
  card:
    backgroundColor: "{colors.sign-face-white}"
    rounded: "{rounded.card}"
---

# Design System: Coast

## 1. Overview

**Creative North Star: "The Road Sign"**

Coast's interface is built on the visual grammar of US highway signage: one message per sign, instantly legible at a glance, calm authority with zero decoration. Verdict panels are literal signs — saturated signal-color slabs (red, amber, guide-sign blue, green) carrying one declarative headline in the signage face (Overpass, descended from Highway Gothic) and one humane serif sentence beneath it (Newsreader). Everything else is the roadside: a daylight-concrete canvas, white sign-face cards, asphalt-ink text, and mono data set like mile markers. The system serves a driver in a stressful moment; it must read from arm's length, in sunlight, in one glance.

The system explicitly rejects the generic SaaS dashboard (stat-tile grids, gradients, density for its own sake), parts-store upsell energy (banners, urgency theater), and the fear-mongering car app (red-alert overload, jargon). Red is spent only on genuinely-stop-now; every other band stays proportionate — the four-signal scale exists so that urgency always reads the same, everywhere.

**Key Characteristics:**
- One verdict per surface, set as signage; depth lives one tap below.
- Four-signal band vocabulary (fix-now red / book-soon amber / can-coast blue / all-clear green) is universal and never remapped.
- Paper-on-concrete materiality: white cards, soft ambient shadows, hairline borders.
- Three-voice typography: signage (Overpass), human explanation (Newsreader), data (Overpass Mono).
- Matter-of-fact, sturdy controls — dependable over expressive.

## 2. Colors

A restrained daylight palette under four saturated signal colors that carry all meaning.

### Primary
- **Guide-Sign Blue** (#1b5faa): The brand signature — interstate guide-sign blue. Primary actions, active nav, links, focus, and the "can coast" band. Deepens to **Guide-Sign Blue Deep** (#164e8c) on hover and for readable text-on-tint.

### Secondary
- **Signal Red** (#b3402e): Fix-now band, danger actions, overdue states. Reserved for genuinely-stop-now; never used for emphasis.
- **Signal Amber** (#d98a00): Book-soon band. Its text-on-tint ink deepens to #8a5800 for contrast.
- **Signal Green** (#1e7a44): All-clear band, success. Highway guide green — earned by real history, never shown as a default.

### Neutral
- **Daylight Concrete** (#efefea): The app canvas. Cool, matte, never warm-tinted.
- **Sign-Face White** (#ffffff): Card and sign surfaces. **Elevated Paper** (#fafaf7) for the frosted header/nav layer; **Concrete Well** (#f0f0eb) for inset wells inside cards.
- **Asphalt Ink** (#23272b): All body text. **Muted Slate** (#6b7076) for secondary text — never lighter than this.
- **Hairline** (rgba(35,39,43,0.13)): Borders and dividers, 0.5–1px.

### Named Rules
**The Signal Budget Rule.** The four signal colors carry status meaning only. They are never decoration, never charts-for-charts'-sake, and never appear at full saturation on an inactive element. If a screen shows red, something is genuinely urgent.

**The Earned Green Rule.** All-clear green renders only when real logged history justifies it. Absence of data is never green.

## 3. Typography

**Display Font:** Overpass (with system-ui fallback) — the signage voice
**Body Font:** Overpass for UI; Newsreader (Georgia fallback) for explanatory prose
**Label/Mono Font:** Overpass Mono — the data spine

**Character:** A three-voice system with a strict division of labor: Overpass speaks as the sign (verdicts, headings, controls), Newsreader speaks as the calm human explaining the sign, and Overpass Mono carries every number (money, miles, dates) with tabular authority.

### Hierarchy
- **Display / Verdict headline** (800, 24px, 1.1, -0.015em): The sign's message. White on a signal-color slab; `text-wrap: balance`.
- **Title / Card title** (600, ~1.02–1.08rem, -0.012em): Card and section headings in Overpass.
- **Body** (400, ~0.95rem): UI copy in Overpass.
- **Prose / Verdict sentence** (400, 15.5px, 1.45): The serif explanation voice (Newsreader). Any sentence that explains, reassures, or advises is set in serif.
- **Label / Kicker** (500–600, 10.5–11px, +0.16–0.2em, UPPERCASE): Overpass Mono eyebrows, tags, and data labels.

### Named Rules
**The Three Voices Rule.** Signage (Overpass), explanation (Newsreader serif), data (Overpass Mono) — every text element belongs to exactly one voice. Numbers never render in the serif; verdicts never render in the mono.

## 4. Elevation

Paper on concrete: white cards read as sheets resting on the canvas. Shadows are ambient material cues, not interaction signals — soft, cool-tinted (asphalt-hued, never warm gray), and shallow. Depth hierarchy is carried primarily by surface color (concrete → paper → white) plus hairline borders; shadows only confirm it. Hover adds a restrained lift on link-cards; nothing "pops."

### Shadow Vocabulary
- **Card at rest** (`0 1px 2px rgba(35,39,43,0.05), 0 10px 26px -14px rgba(35,39,43,0.18)`): Default card material.
- **Raised / hover** (`0 2px 6px rgba(35,39,43,0.07), 0 16px 34px -18px rgba(35,39,43,0.26)`): Interactive card hover lift.
- **Modal** (`0 24px 60px rgba(23,27,32,0.22)`): Dialogs and bottom sheets only.

### Named Rules
**The Ambient-Only Rule.** Shadows describe material, never importance. Urgency is carried exclusively by the signal colors — a fix-now verdict gets no extra shadow.

## 5. Components

Matter-of-fact and sturdy: solid fills, 10px control radius, no ornamentation. Controls should feel dependable, not expressive.

### Buttons
- **Shape:** Modest rounding (10px, `--radius-control`).
- **Primary (`.btn`):** Solid Guide-Sign Blue fill, white text, 12px 18px padding, weight 600. Hover deepens to #164e8c; active dims via brightness; disabled at 0.55 opacity.
- **Danger:** Signal Red fill, same geometry.
- **Text actions (`.btn-link`):** Plain accent-colored text links for inline row actions.
- **Known gap:** there is no visual secondary/tinted button variant — `.btn` alone is the filled style, so stacked actions currently all read as primary. When two actions share a row, demote the second (tinted `--accent-tint` fill or outline) rather than shipping two solid fills.

### Cards / Containers
- **Corner Style:** 16px.
- **Background:** Sign-Face White on the concrete canvas; Concrete Well for inset sub-surfaces. Never nest cards.
- **Shadow Strategy:** Card-at-rest ambient (see Elevation); hover lift only on cards that navigate.
- **Border:** 0.5–1px hairline.
- **Internal Padding:** 16px base grid.

### Inputs / Fields
- **Style:** Globally themed (all `input`/`select`/`textarea`): white field, hairline border, 10px radius, ~42px height.
- **Focus:** Global `:focus-visible` ring in Guide-Sign Blue.
- **Error:** `role="alert"` notice text in Signal Red tint (`.notice-error`); inputs avoid native bubbles.

### Navigation
- **Mobile:** Frosted bottom tab bar (translucent Elevated Paper, `backdrop-filter: blur(20px) saturate(160%)`, 60px + safe-area), 4 tabs of monochrome stroke icons + 10.5px labels, active tab in Guide-Sign Blue, with the raised circular **Check** button at center.
- **Desktop (≥1024px):** Left sidebar with the same items; Check as a prominent block.

### The Verdict Panel (signature)
The road sign itself: a saturated signal-color slab (band color as full background), rounded 16px, containing an Overpass Mono uppercase tag ("VERDICT · FIX NOW"), the 24px/800 Overpass headline, and a 15.5px Newsreader sentence — all in white. Beneath it, the **Urgency Ruler**: a 9px four-zone track (red/amber/blue/green segments) with a pin marking position within the band. These two components are the brand; reuse them (`.cv-panel`, `.cv-ruler`) rather than inventing new status displays.

## 6. Do's and Don'ts

### Do:
- **Do** lead every surface with one verdict in signage voice; put detail one tap below.
- **Do** use the four-signal bands for all status everywhere — same hue, same meaning, no new status colors.
- **Do** set explanatory sentences in Newsreader serif and all numbers in Overpass Mono with tabular figures.
- **Do** keep controls sturdy and plain: solid fills, 10px radius, 42px touch targets, visible focus ring.
- **Do** hold text contrast at WCAG 2.1 AA (≥4.5:1); Muted Slate (#6b7076) is the lightest allowed text color.

### Don't:
- **Don't** build "the generic SaaS dashboard" — no stat-tile grids, no gradients, no density for its own sake (PRODUCT.md anti-reference, verbatim).
- **Don't** add "parts-store / service-lane upsell energy" — no banners, badges, or urgency theater that monetizes uncertainty (PRODUCT.md anti-reference).
- **Don't** be "the fear-mongering car app" — Signal Red only for genuinely-stop-now; never dramatize a book-soon into red (PRODUCT.md anti-reference).
- **Don't** show all-clear green for a vehicle without real logged history (The Earned Green Rule).
- **Don't** stack two solid-fill buttons of equal weight; one primary per group.
- **Don't** warm the neutrals — the canvas is cool daylight concrete, not cream or parchment.
- **Don't** use side-stripe borders, gradient text, or nested cards, ever.

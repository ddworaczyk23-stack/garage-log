import type { SignalBand } from './verdict'
import { CATEGORY_LABELS, type MaintenanceCategory } from '../types'
import type { BriefFacts } from './shopBrief'

// ---------------------------------------------------------------------------
// Coast triage playbooks (Stage 2 of the Coast migration — see COAST-PLAN.md).
//
// A playbook is a small decision tree: the driver picks answers to 1-3 plain-
// language questions and gets a verdict (band + likely cause + cost + what to
// tell the shop). PURE and data-driven — no DOM, no Dexie, no I/O. The four
// playbooks below are transcribed from mechanic/consumer research compiled in
// design/playbooks-research/*.md.
//
// Design notes:
//  - Bands reuse Stage 1's four-signal vocabulary (SignalBand): fix-now /
//    book-soon / coast / all-clear. The research's "can-coast" == 'coast'.
//  - Likelihood is expressed as ranked plain phrases ("most often", "sometimes"),
//    NOT the source percentages — those were blog-consensus heuristics, not
//    measured statistics, and showing a precise "70%" would overstate certainty.
//  - The resolver asks the next applicable unanswered question until an outcome's
//    predicate is satisfied; predicates reference specific answers, so an outcome
//    only fires once the answers it needs are present (grind short-circuits after
//    one question; squeal waits for the follow-up). If every question is answered
//    and nothing matched, the playbook's `fallback` (a safe book-soon) is used.
//
// FROZEN IDS: every `Playbook.id` and `PlaybookOutcome.id` below (fallbacks
// included) is persisted — a saved `Concern` (types.ts) stores `playbookId` +
// `outcomeId` and re-resolves them against THIS file's live code every time its
// shop brief is opened (see `ShopBrief.tsx`'s `loadBrief`, which returns null —
// "brief not found" — if the lookup misses). New outcomes are free to add; an
// existing id must never be renamed, removed, or reused for a different
// outcome, or every previously-saved concern pointing at it silently orphans.
// If an outcome's *content* needs to change, edit it in place; if it needs to
// be retired, leave a fallback-shaped stub outcome at the old id rather than
// deleting it.
// ---------------------------------------------------------------------------

export type Answers = Record<string, string>

export interface PlaybookOption {
  value: string
  label: string
  /** One-line clarifier under the option. */
  hint?: string
}

export interface PlaybookQuestion {
  id: string
  /** The eyebrow shown above the question (context breadcrumb). */
  eyebrow: string
  text: string
  /** Reassuring sub-line ("Trust your ear — close enough is fine."). */
  sub?: string
  options: PlaybookOption[]
  /** Ask this question only when the predicate over prior answers holds. */
  when?: (a: Answers) => boolean
}

/** Cost bands for a repair (2025-2026 US, per the research). Any bound may be
 *  absent when a path isn't realistically DIY-able. */
export interface CostRange {
  diyLow?: number
  diyHigh?: number
  shopLow: number
  shopHigh: number
  dealerLow?: number
  dealerHigh?: number
}

/** Can the driver keep driving? The safety call, in plain terms (Stage 5A). */
export type DriveVerdict = 'drive-ok' | 'short-trip-only' | 'tow'

export interface DriveOrTow {
  verdict: DriveVerdict
  /** Why, and the threshold in terms a non-mechanic can act on. */
  note: string
}

export interface PlaybookOutcome {
  id: string
  band: SignalBand
  /** The sign headline, e.g. "Worn brake pads — down to the metal". */
  title: string
  /** Plain-English body explaining the verdict (the human voice). */
  explanation: string
  /** Ranked likely causes, most-likely first, in plain "most often" phrasing. */
  likelyCauses: string[]
  cost: CostRange
  /** "It becomes fix-now if…" triggers a non-mechanic can watch for. */
  escalation: string[]
  // --- action layer (Stage 5A) — all optional; uncurated outcomes simply
  // render fewer cards, they are never blocked. See COAST-PLAN-STAGE5.md.
  /** "Try this first" — steps a non-mechanic can safely do themselves. */
  selfCheck?: string[]
  /** The drive-vs-tow call. Curated for every fix-now outcome (safety). */
  driveOrTow?: DriveOrTow
  /** What to take to the shop. For the DRIVER — never rendered in the brief. */
  whatToBring?: string[]
  /** Independent-vs-dealer/warranty, anchored to THIS job (never generic). */
  shopChoice?: string
  /** Symptom translated into what a shop needs to hear. */
  symptomLine: string
  /** What to ask the shop to check/report before authorizing the repair. */
  askShopTo: string
  /** Best-guess maintenance category (links a resolved concern to a rule; the
   *  reminder engine is NOT driven by playbooks, this is only for tagging). */
  category?: MaintenanceCategory
  /** Fires when these answers are present & matching. Absent = fallback only. */
  match?: (a: Answers) => boolean
}

export interface Playbook {
  id: string
  /** Top-level label on the "What's going on?" chooser. */
  label: string
  /** One-line description under the label. */
  blurb: string
  questions: PlaybookQuestion[]
  /** Ordered specific → general; first satisfied `match` wins. */
  outcomes: PlaybookOutcome[]
  /** Used when all applicable questions are answered but nothing matched. */
  fallback: PlaybookOutcome
}

// --- helpers ---------------------------------------------------------------

const has = (a: Answers, k: string) => a[k] != null && a[k] !== ''

// ===========================================================================
// 1. BRAKE NOISE  (design/playbooks-research/01-brake-noise.md)
// ===========================================================================
const brakeNoise: Playbook = {
  id: 'brake-noise',
  label: 'A braking noise or feel',
  blurb: 'Squeal, grind, clunk, or a pulsing pedal when you slow down',
  questions: [
    {
      id: 'sound',
      eyebrow: 'A braking noise',
      text: 'What does it sound or feel like?',
      sub: 'Pick the closest — you don’t have to be exact.',
      options: [
        { value: 'squeal', label: 'A squeal or screech', hint: 'High-pitched, often the first stops of the day' },
        { value: 'grind', label: 'A grind or scrape', hint: 'Lower, rougher — metal on metal' },
        { value: 'clunk', label: 'A clunk or click', hint: 'A single knock when you press the brake' },
        { value: 'pulse', label: 'A shake or pulsing pedal', hint: 'The pedal or wheel vibrates as you stop' },
      ],
    },
    {
      id: 'feel',
      eyebrow: 'A braking noise',
      text: 'Anything else while braking?',
      sub: 'These change how urgent it is.',
      when: (a) => a.sound === 'squeal' || a.sound === 'clunk',
      options: [
        { value: 'none', label: 'No — just the noise', hint: 'Stops feel normal otherwise' },
        { value: 'pull', label: 'The car pulls to one side' },
        { value: 'longer', label: 'Stops take longer than they used to' },
      ],
    },
    {
      id: 'often',
      eyebrow: 'A braking noise',
      text: 'How often do you hear the squeal?',
      when: (a) => a.sound === 'squeal' && (a.feel === 'none' || !has(a, 'feel')),
      options: [
        { value: 'most', label: 'Most times I brake' },
        { value: 'first', label: 'Only the first stop or two, then it’s gone', hint: 'Common after rain or overnight' },
      ],
    },
  ],
  outcomes: [
    {
      id: 'pull-or-long',
      band: 'fix-now',
      title: 'A braking safety issue — get it checked now',
      explanation:
        'A car that pulls to one side or takes longer to stop means one brake isn’t doing its share — often a stuck caliper or a hydraulic problem. That’s a safety issue, not a wait-and-see.',
      likelyCauses: ['Most often a sticking caliper or slide pins', 'Sometimes a restricted brake hose', 'Sometimes uneven or contaminated pads'],
      cost: { diyLow: 60, diyHigh: 400, shopLow: 200, shopHigh: 600, dealerLow: 350, dealerHigh: 900 },
      escalation: ['The pedal feels soft or sinks to the floor', 'You smell burning or one wheel is very hot after a short drive'],
      symptomLine: 'Vehicle pulls / takes longer to stop under braking, with a noise from the front.',
      askShopTo: 'compare left/right brake temperatures, inspect caliper slide pins and piston operation, and check the hoses for restriction before quoting parts.',
      category: 'brake-inspection',
      selfCheck: [
        'After a short drive, hold your hand near (not on) each front wheel — one running much hotter than the other suggests a caliper stuck on that side.',
        'Check the brake fluid reservoir under the hood: below the MIN line points at a leak or badly worn pads.',
      ],
      driveOrTow: {
        verdict: 'tow',
        note: 'A car that pulls or takes longer to stop has already lost part of its braking, and heat makes it worse. This isn’t one to “drive carefully” to the shop — have it looked at where it sits, or towed.',
      },
      whatToBring: [
        'Any brake work receipts from the last couple of years.',
        'Note which way it pulls, and whether it happens on every stop or only hard ones.',
      ],
      shopChoice:
        'Any independent shop — calipers and hydraulics are routine. Ask them to check the whole corner rather than just replacing pads.',
      match: (a) => a.feel === 'pull' || a.feel === 'longer',
    },
    {
      id: 'grind',
      band: 'fix-now',
      title: 'Brake pads worn to the metal',
      explanation:
        'A grinding or scraping metal-on-metal sound almost always means the pad material is gone and the backing is cutting into the rotor. Every drive makes the repair bigger, and stopping power is dropping.',
      likelyCauses: ['Most often pads worn completely through', 'Then rotor damage from metal-on-metal contact', 'Sometimes a seized caliper'],
      cost: { diyLow: 100, diyHigh: 300, shopLow: 300, shopHigh: 700, dealerLow: 500, dealerHigh: 1000 },
      escalation: ['Grinding gets louder or the pedal changes — stop driving and arrange a tow'],
      symptomLine: 'Metallic grinding during braking, likely pads worn through to the backing plate.',
      askShopTo: 'measure pad thickness, inspect the rotors for scoring / minimum thickness, and check for a seized caliper before quoting pads only.',
      category: 'brake-inspection',
      selfCheck: [
        'Look through the wheel spokes at the edge of the brake pad — much less than ⅛ inch (3 mm) of pad material left means it’s worn out.',
        'Compare both front wheels: grinding from one side only often points at a stuck caliper on that side.',
      ],
      driveOrTow: {
        verdict: 'short-trip-only',
        note: 'Drive only if you have to, and only as far as the nearest shop — keep speeds low and leave extra room to stop. If stops have gotten longer or the car pulls to one side, don’t drive it; tow it.',
      },
      whatToBring: [
        'Your last brake receipt — when the pads were done, and whether the rotors were replaced or resurfaced.',
      ],
      shopChoice:
        'Any independent shop does brakes well — this is routine work, and a dealer premium buys you nothing here.',
      match: (a) => a.sound === 'grind',
    },
    {
      id: 'pulse',
      band: 'book-soon',
      title: 'Warped or uneven rotors',
      explanation:
        'A pulsing pedal or a shake through the wheel as you stop usually means the rotors are no longer perfectly flat, so the pads grip unevenly. It’s not an emergency if braking is still predictable, but it won’t fix itself.',
      likelyCauses: ['Most often rotor thickness variation or warping', 'Sometimes uneven pad deposits', 'Occasionally a hub or front-end issue amplifying it'],
      cost: { diyLow: 80, diyHigh: 250, shopLow: 300, shopHigh: 650, dealerLow: 450, dealerHigh: 900 },
      escalation: ['The pulsing gets strong, the car wanders, or stops take longer'],
      symptomLine: 'Brake pedal pulsation and/or steering shake under braking.',
      askShopTo: 'measure rotor runout and thickness variation, check the hub face, and confirm whether the rotors can be machined or need replacing.',
      category: 'brake-inspection',
      match: (a) => a.sound === 'pulse',
    },
    {
      id: 'squeal-most',
      band: 'book-soon',
      title: 'Brake pads getting low',
      explanation:
        'A squeal on most stops is usually the wear indicator doing its job — a little metal tab designed to sing when the pads are getting thin. It’s an early warning, not a failure, so book it in the next couple of weeks before it turns into grinding.',
      likelyCauses: ['Most often pads nearing their wear indicator', 'Sometimes glazed pads or light rotor rust', 'Occasionally missing anti-rattle hardware'],
      cost: { diyLow: 40, diyHigh: 180, shopLow: 150, shopHigh: 320, dealerLow: 250, dealerHigh: 450 },
      escalation: ['The squeal turns to a grind, the car pulls, or stops take longer'],
      symptomLine: 'Brake squeal on most stops, no pull or pulsation — likely pads near the wear indicator.',
      askShopTo: 'inspect pad thickness, rotor condition, and pad hardware, and report whether this is normal wear or something uneven.',
      category: 'brake-inspection',
      selfCheck: [
        'Look through the wheel spokes at the pad edge — you can usually see roughly how much material is left without removing anything.',
      ],
      driveOrTow: {
        verdict: 'drive-ok',
        note: 'Fine to keep driving — the wear indicator is doing exactly its job. Book it within the next couple of weeks, before it turns into grinding and takes the rotors with it.',
      },
      whatToBring: ['Your last brake receipt, so they can see how long this set has been on.'],
      shopChoice: 'Any independent shop — routine pad work, no dealer premium warranted.',
      match: (a) => a.sound === 'squeal' && a.often === 'most',
    },
    {
      id: 'squeal-first',
      band: 'coast',
      title: 'Probably just surface rust or dust',
      explanation:
        'A squeal only on the first stop or two — especially after rain or sitting overnight — is usually a thin film of rust or dust burning off the rotors. If it clears up quickly and everything else feels normal, you can keep an eye on it rather than rushing in.',
      likelyCauses: ['Most often light surface rust or dust that clears as the brakes warm', 'Sometimes early pad glazing'],
      cost: { shopLow: 150, shopHigh: 320 },
      escalation: ['The squeal starts happening on most stops, or you hear grinding'],
      symptomLine: 'Brief brake squeal on the first stops only, clears once warmed up.',
      askShopTo: 'give the pads and rotors a look at the next service and report pad thickness so you know how much life is left.',
      category: 'brake-inspection',
      match: (a) => a.sound === 'squeal' && a.often === 'first',
    },
    {
      id: 'clunk',
      band: 'book-soon',
      title: 'Loose brake hardware',
      explanation:
        'A single clunk or click when you press the brake — with braking otherwise normal — is usually a bit of loose hardware or a caliper moving where it shouldn’t. It’s worth getting looked at soon, but it isn’t the pads wearing out.',
      likelyCauses: ['Most often loose or missing pad hardware / anti-rattle clips', 'Sometimes caliper or bracket movement', 'Occasionally worn suspension showing up under braking'],
      cost: { diyLow: 20, diyHigh: 350, shopLow: 120, shopHigh: 400, dealerLow: 200, dealerHigh: 700 },
      escalation: ['The car also pulls, the pedal feels odd, or there’s vibration'],
      symptomLine: 'A single clunk/click tied to brake application, braking otherwise normal.',
      askShopTo: 'check the pad hardware, caliper bracket torque, and slide pins, and confirm the noise isn’t actually suspension under braking.',
      category: 'brake-inspection',
      match: (a) => a.sound === 'clunk' && a.feel === 'none',
    },
  ],
  fallback: {
    id: 'brake-generic',
    band: 'book-soon',
    title: 'Worth having the brakes looked at',
    explanation:
      'Brakes are the one system where it’s worth being cautious. Book an inspection soon so a shop can tell you exactly what’s making the noise.',
    likelyCauses: ['A brake inspection will pin down the cause'],
    cost: { shopLow: 60, shopHigh: 320 },
    escalation: ['The car pulls, the pedal feels soft, or you hear grinding — treat it as fix-now'],
    symptomLine: 'A brake noise that needs diagnosis.',
    askShopTo: 'inspect the pads, rotors, and calipers front and rear and report what’s making the noise before quoting.',
    category: 'brake-inspection',
  },
}

// ===========================================================================
// 2. OTHER NOISES  (design/playbooks-research/02-other-noises.md)
// ===========================================================================
const otherNoise: Playbook = {
  id: 'other-noise',
  label: 'A different noise',
  blurb: 'A hum, whine, click, or clunk that isn’t about braking',
  questions: [
    {
      id: 'when',
      eyebrow: 'A noise',
      text: 'When do you hear it?',
      sub: 'The moment it happens points to where it’s coming from.',
      options: [
        { value: 'turning', label: 'When I turn', hint: 'Corners or parking-lot speeds' },
        { value: 'accel', label: 'When I speed up', hint: 'Pulling away or climbing hills' },
        { value: 'constant', label: 'All the time, rising with speed', hint: 'Independent of the gas pedal' },
      ],
    },
    {
      id: 'sound',
      eyebrow: 'A noise',
      text: 'Which is closest?',
      options: [
        { value: 'hum', label: 'A hum, growl, or rumble' },
        { value: 'click', label: 'A rhythmic click or pop' },
        { value: 'whine', label: 'A whine or high-pitched whirr' },
        { value: 'squeal', label: 'A squeal or chirp' },
        { value: 'clunk', label: 'A clunk or knock' },
      ],
    },
  ],
  outcomes: [
    {
      id: 'wheel-bearing',
      band: 'book-soon',
      title: 'Likely a wheel bearing',
      explanation:
        'A hum or growl that rises with speed and changes as you turn is the classic sign of a worn wheel bearing. They usually give plenty of warning, so book it soon — but don’t ignore it, because a failed bearing can seize.',
      likelyCauses: ['Most often a failing wheel bearing / hub', 'Sometimes uneven tire wear mimicking a hum', 'Occasionally a CV joint'],
      cost: { diyLow: 60, diyHigh: 250, shopLow: 150, shopHigh: 450, dealerLow: 250, dealerHigh: 800 },
      escalation: ['Steering feels loose, the noise grows fast over one drive, or a wheel hub is hot to the touch', 'An ABS or stability light comes on'],
      symptomLine: 'Speed-proportional hum that changes when turning — suspect a wheel bearing / hub.',
      askShopTo: 'check wheel-bearing play, hub temperature after a short drive, and the ABS wheel-speed readings, and confirm which corner.',
      match: (a) => (a.when === 'turning' || a.when === 'constant') && a.sound === 'hum',
    },
    {
      id: 'cv-joint',
      band: 'book-soon',
      title: 'Likely a CV joint',
      explanation:
        'A rhythmic clicking or popping that shows up on tight turns is almost always an outer CV joint on the axle wearing out, often after its protective boot tore and lost grease. It’s fine to drive short distances, but book it before it becomes constant.',
      likelyCauses: ['Most often a failing outer CV joint', 'Sometimes a torn CV boot caught early', 'Occasionally suspension or steering play'],
      cost: { diyLow: 80, diyHigh: 300, shopLow: 250, shopHigh: 700, dealerLow: 500, dealerHigh: 1400 },
      escalation: ['The clicking becomes constant knocking, you feel vibration under acceleration, or you see grease flung inside the wheel'],
      symptomLine: 'Rhythmic clicking on turns — suspect an outer CV joint / axle.',
      askShopTo: 'inspect the CV boot and joint play and confirm whether it needs an axle or just a boot-and-grease service.',
      match: (a) => a.when === 'turning' && a.sound === 'click',
    },
    {
      id: 'belt',
      band: 'book-soon',
      title: 'Likely a drive belt or pulley',
      explanation:
        'A squeal or chirp when you accelerate — especially from the engine bay and worst on a cold start — is usually the serpentine belt slipping or a pulley bearing going. It’s cheap to sort early; the risk is losing the belt (and with it charging and power steering).',
      likelyCauses: ['Most often a worn or slipping serpentine belt', 'Sometimes an idler or tensioner pulley bearing', 'Occasionally an accessory pulley'],
      cost: { diyLow: 20, diyHigh: 150, shopLow: 80, shopHigh: 300, dealerLow: 150, dealerHigh: 500 },
      escalation: ['The battery light comes on, power steering gets heavy, or you see the belt fraying — treat it as fix-now'],
      symptomLine: 'High-pitched squeal on start-up / acceleration from the engine bay.',
      askShopTo: 'inspect the serpentine belt, tensioner, and pulleys, and confirm whether it needs a belt or a pulley.',
      category: 'serpentine-belt',
      match: (a) => a.when === 'accel' && a.sound === 'squeal',
    },
    {
      id: 'driveline-clunk',
      band: 'book-soon',
      title: 'A driveline or mount is worn',
      explanation:
        'A clunk or knock when you accelerate or shift into gear usually means play somewhere in the driveline — a U-joint, a worn engine/transmission mount, or a bushing. Have it looked at soon so a small part doesn’t stress bigger ones.',
      likelyCauses: ['Most often a worn U-joint or driveshaft center bearing', 'Sometimes failing engine or transmission mounts', 'Occasionally a loose differential mount'],
      cost: { diyLow: 30, diyHigh: 200, shopLow: 150, shopHigh: 700, dealerLow: 300, dealerHigh: 1200 },
      escalation: ['The clunk becomes continuous, or you get a big shudder or binding'],
      symptomLine: 'A clunk/knock on acceleration or when shifting into gear.',
      askShopTo: 'inspect the U-joints, driveshaft center bearing, and engine/transmission mounts and report which shows play.',
      match: (a) => a.sound === 'clunk',
    },
    {
      id: 'driveline-whine',
      band: 'book-soon',
      title: 'A drivetrain component is wearing',
      explanation:
        'A whine that tracks road speed (not engine RPM) can come from a worn differential, transmission, or wheel bearing. It needs a proper road-test to localize, so book a diagnosis before it turns into gear damage.',
      likelyCauses: ['Most often worn differential or transmission bearings', 'Sometimes a wheel bearing if it’s at one corner', 'Occasionally tire noise'],
      cost: { diyLow: 40, diyHigh: 800, shopLow: 300, shopHigh: 1800, dealerLow: 800, dealerHigh: 2500 },
      escalation: ['The noise sharpens quickly, you feel grinding, or there’s a burning smell'],
      symptomLine: 'A constant speed-proportional whine, not linked to engine RPM.',
      askShopTo: 'road-test to reproduce it, check the differential/transmission fluid, and inspect the pinion and output bearings.',
      match: (a) => a.when === 'constant' && a.sound === 'whine',
    },
    {
      id: 'tire-hum',
      band: 'book-soon',
      title: 'Likely a tire or wheel',
      explanation:
        'A constant rumble or hum that varies with the road surface is most often uneven tire wear (cupping) or a balance issue. It’s usually not dangerous, but worn tires can handle badly, so have them looked at soon.',
      likelyCauses: ['Most often cupped or unevenly worn tires', 'Sometimes a wheel out of balance or a bent rim', 'Occasionally a wheel bearing'],
      cost: { diyLow: 50, diyHigh: 200, shopLow: 80, shopHigh: 250, dealerLow: 100, dealerHigh: 400 },
      escalation: ['Vibration grows quickly, or you can see cords, a bulge, or tread separating — treat it as fix-now'],
      symptomLine: 'A speed-dependent rumble/hum that changes with road surface.',
      askShopTo: 'inspect the tread for cupping, check wheel balance and rim straightness, and confirm tire pressures.',
      category: 'tire-inspection',
      match: (a) => a.when === 'constant' && a.sound === 'hum',
    },
  ],
  fallback: {
    id: 'noise-generic',
    band: 'book-soon',
    title: 'Worth a diagnosis',
    explanation:
      'Noises are hard to pin down without hearing them. Book a diagnosis soon — describing exactly when it happens (which you’ve just done) saves the shop time.',
    likelyCauses: ['A road-test will localize the source'],
    cost: { shopLow: 80, shopHigh: 200 },
    escalation: ['Steering feels loose, there’s a burning smell, or the noise grows fast — treat it as fix-now'],
    symptomLine: 'A new noise that needs diagnosis.',
    askShopTo: 'road-test to reproduce the noise and report the source before quoting any repair.',
  },
}

// ===========================================================================
// 3. WARNING LIGHTS  (design/playbooks-research/03-warning-lights.md)
// ===========================================================================
const warningLight: Playbook = {
  id: 'warning-light',
  label: 'A dashboard light',
  blurb: 'Check engine, tire pressure, battery, oil, ABS, or traction control',
  questions: [
    {
      id: 'light',
      eyebrow: 'A warning light',
      text: 'Which light is on?',
      sub: 'Match the symbol or the closest name.',
      options: [
        { value: 'cel', label: 'Check engine', hint: 'An engine outline' },
        { value: 'tpms', label: 'Tire pressure', hint: 'A flat-tire / exclamation symbol' },
        { value: 'battery', label: 'Battery / charging', hint: 'A battery box, or GEN / ALT' },
        { value: 'oil', label: 'Oil pressure', hint: 'An oil can' },
        { value: 'temp', label: 'Coolant temperature', hint: 'A thermometer, or the gauge needle in the red' },
        { value: 'abs', label: 'ABS or traction control' },
        { value: 'brake', label: 'Red brake warning light', hint: 'Not ABS — the brake symbol itself, or "BRAKE"' },
      ],
    },
    {
      id: 'flashing',
      eyebrow: 'Check engine light',
      text: 'Is it steady or flashing?',
      sub: 'This one really matters.',
      when: (a) => a.light === 'cel',
      options: [
        { value: 'solid', label: 'Steady / solid' },
        { value: 'flashing', label: 'Flashing or blinking' },
      ],
    },
    {
      id: 'symptom',
      eyebrow: 'A warning light',
      text: 'Anything else happening right now?',
      when: (a) => a.light === 'cel' || a.light === 'battery' || a.light === 'abs',
      options: [
        { value: 'none', label: 'No — just the light' },
        { value: 'drive', label: 'The car runs rough, loses power, or the brakes feel different' },
        { value: 'dim', label: 'Lights dim or accessories cut out', hint: 'For the battery light' },
      ],
    },
    {
      id: 'parkingBrake',
      eyebrow: 'Red brake warning light',
      text: 'Is the parking / emergency brake fully released?',
      sub: 'The single most common cause of this light is a parking brake that isn’t all the way off.',
      when: (a) => a.light === 'brake',
      options: [
        { value: 'released', label: 'Yes — it’s fully released and the light is still on' },
        { value: 'engaged', label: 'It might still be partly on' },
      ],
    },
  ],
  outcomes: [
    {
      id: 'cel-flashing',
      band: 'fix-now',
      title: 'Flashing check engine — stop driving hard',
      explanation:
        'A flashing check-engine light means the engine is actively misfiring, dumping raw fuel into the exhaust. Keep driving and you can destroy the catalytic converter — an expensive part. Ease off, and get it seen right away.',
      likelyCauses: ['Most often an ignition misfire — a coil or spark plug', 'Sometimes a fuel-delivery problem', 'Occasionally a mechanical or sensor fault'],
      cost: { diyLow: 10, diyHigh: 180, shopLow: 150, shopHigh: 1200, dealerLow: 250, dealerHigh: 1800 },
      escalation: ['Strong shaking, loss of power, or a rotten-egg smell — pull over and arrange a tow'],
      symptomLine: 'Flashing MIL while driving — active misfire suspected.',
      askShopTo: 'read the OBD-II codes, report any misfire codes (P0300-series), and check coils, plugs, and fuel trims before replacing parts.',
      category: 'spark-plugs',
      selfCheck: [
        'Note what it’s doing as you stop — shaking, down on power, or a rotten-egg smell. That tells the shop a lot and costs you nothing.',
        'Don’t bother with the gas cap: a flashing light is never a loose cap. That’s the solid-light story.',
      ],
      driveOrTow: {
        verdict: 'tow',
        note: 'A flashing light means raw fuel is pouring into the catalytic converter, and it can cook it in minutes of driving — turning a ~$300 ignition job into a $1,000+ converter. Stop somewhere safe and have it towed rather than pressing on.',
      },
      whatToBring: [
        'Any codes, if you’ve had them read — most parts stores read them free.',
        'Spark plug or ignition coil receipts, if that work has been done before.',
      ],
      shopChoice:
        'An independent shop diagnoses misfires fine. Go to the dealer only if the car is still under powertrain warranty — a covered misfire repair is worth the trip.',
      match: (a) => a.light === 'cel' && a.flashing === 'flashing',
    },
    {
      id: 'cel-solid-drive',
      band: 'fix-now',
      title: 'Check engine + a running problem',
      explanation:
        'A steady check-engine light with the car running rough or down on power means whatever tripped the light is affecting how the engine runs. Get it scanned promptly before it strands you or does more damage.',
      likelyCauses: ['Often a misfire or sensor fault affecting running', 'Sometimes a fuel or air-metering problem'],
      cost: { diyLow: 20, diyHigh: 300, shopLow: 150, shopHigh: 1200, dealerLow: 250, dealerHigh: 1500 },
      escalation: ['It starts flashing, or power drops further'],
      symptomLine: 'Solid check-engine light with rough running / power loss.',
      askShopTo: 'pull stored and pending codes with freeze-frame data and diagnose the driveability issue before quoting parts.',
      selfCheck: [
        'Get the code read before you spend anything — most parts stores do it free, and it turns "check engine" into a specific part.',
        'Check the gas cap clicks tight. It’s a long shot once the car is running rough, but it costs nothing to rule out.',
      ],
      driveOrTow: {
        verdict: 'short-trip-only',
        note: 'Fine for a short, gentle trip if it holds a steady speed with no strong shaking — skip the highway, keep it local. If it shakes hard, loses power heavily, smells off, or the light starts flashing, stop and treat it as a tow.',
      },
      whatToBring: ['Any codes you’ve had read.', 'Note when it runs rough — cold start, idle, or under load.'],
      shopChoice:
        'An independent shop is fine for diagnosis. Dealer only if it’s under powertrain warranty, or if the codes point at something model-specific they’ve seen before.',
      match: (a) => a.light === 'cel' && a.flashing === 'solid' && a.symptom === 'drive',
    },
    {
      id: 'cel-solid',
      band: 'book-soon',
      title: 'Check engine — get the code read',
      explanation:
        'A steady check-engine light with the car running fine is rarely an emergency — it ranges from a loose gas cap to an emissions sensor. The key next step is cheap: get the code read (many parts stores do it free) so you know what you’re dealing with.',
      likelyCauses: ['Most often a loose gas cap or small EVAP leak', 'Sometimes an oxygen or air-flow sensor', 'Occasionally an early misfire'],
      cost: { diyLow: 10, diyHigh: 250, shopLow: 100, shopHigh: 600, dealerLow: 200, dealerHigh: 1200 },
      escalation: ['The light starts flashing, or the car begins running rough — treat it as fix-now'],
      symptomLine: 'Solid check-engine light, no driveability symptoms.',
      askShopTo: 'pull the stored and pending codes with freeze-frame data and confirm whether it’s the gas cap / EVAP, a sensor, or a misfire before recommending parts.',
      match: (a) => a.light === 'cel' && a.flashing === 'solid',
    },
    {
      id: 'oil',
      band: 'fix-now',
      title: 'Oil pressure — stop and check now',
      explanation:
        'The oil-pressure light is the one warning you never drive on. Low oil pressure can wreck an engine in minutes. Pull over safely, check the oil level, and top it up — if the light stays on, don’t drive, arrange a tow.',
      likelyCauses: ['Most often critically low oil level', 'Sometimes a failed sensor', 'Occasionally an oil-pump or internal problem'],
      cost: { diyLow: 10, diyHigh: 120, shopLow: 150, shopHigh: 800, dealerLow: 250, dealerHigh: 3500 },
      escalation: ['Any knocking, a metal smell, or the light stays on after topping up — stop and tow'],
      symptomLine: 'Oil-pressure warning light illuminated.',
      selfCheck: [
        'Pull over and shut the engine off first — this is the one light where continuing costs you the engine.',
        'With the engine off and the car level, wait five minutes, then check the dipstick. Below the low mark, add the oil grade printed on the filler cap.',
        'If the light goes out after topping up and stays out, you’ve found it — but still get the leak or oil burn-off looked at.',
        'If the light stays on after topping up, shut it off and don’t restart it.',
      ],
      driveOrTow: {
        verdict: 'tow',
        note: 'Low oil pressure can destroy an engine in minutes — no errand is worth it. If topping up doesn’t clear the light, don’t restart the engine; have it towed.',
      },
      whatToBring: [
        'Your last oil change receipt — date and mileage.',
        'The oil you added, if you topped it up.',
      ],
      shopChoice:
        'Any independent shop can test oil pressure with a mechanical gauge — insist on that test before anyone quotes an oil pump or internal engine work, the difference between a $150 sensor and a $3,000 teardown. If it IS the pump or something internal, check your powertrain warranty before paying out of pocket — that repair is often covered while a sensor alone usually isn’t.',
      askShopTo: 'measure oil pressure with a mechanical gauge, check for leaks, and report the pump/engine condition before authorizing major work.',
      category: 'oil-change',
      match: (a) => a.light === 'oil',
    },
    {
      id: 'coolant-temp',
      band: 'fix-now',
      title: 'Overheating — stop and let it cool now',
      explanation:
        'A temperature light or a gauge climbing into the red means the engine is overheating. Keep driving and you risk warping the cylinder head or blowing the head gasket within minutes — this is the one light where "drive carefully to the shop" is the wrong move.',
      likelyCauses: ['Most often a coolant leak — a hose, the radiator, or the water pump', 'Sometimes a failed cooling fan or stuck thermostat', 'Less often an already-damaged head gasket'],
      cost: { diyLow: 20, diyHigh: 250, shopLow: 150, shopHigh: 900, dealerLow: 250, dealerHigh: 3500 },
      escalation: ['You smell coolant, see steam, or the gauge won’t come back down after cooling — arrange a tow'],
      symptomLine: 'Temperature warning light or gauge in the red — overheating.',
      askShopTo: 'pressure-test the cooling system, determine external vs. internal coolant loss, and run a combustion-gas / head-gasket check if internal loss is suspected before quoting a head-gasket repair.',
      category: 'coolant',
      selfCheck: [
        'Pull off safely and shut the engine off once stopped — running it longer is what turns a $200 hose into a $3,000 repair.',
        'Turn the heater on full blast on the way to pulling over — it pulls heat off the engine and buys you a little time.',
        'Once the engine is properly COLD — hours, not minutes — check the coolant reservoir against the min/max lines. Never open the cap on a warm engine; it’s pressurized and will scald.',
      ],
      driveOrTow: {
        verdict: 'tow',
        note: 'An overheating engine can warp the cylinder head or blow the head gasket in minutes of continued driving — there’s no safe distance to press on for. Shut it off where you stopped and have it towed.',
      },
      whatToBring: [
        'Any recent cooling-system receipts — hoses, water pump, radiator, coolant flush.',
        'Note whether you saw steam, smelled coolant, or heard anything unusual just before the light came on.',
      ],
      shopChoice:
        'Start with any independent shop for the pressure test — that result is the diagnosis before agreeing to head-gasket work. If it comes back internal, check your powertrain warranty first: head-gasket repair is often covered while active.',
      match: (a) => a.light === 'temp',
    },
    {
      id: 'brake-light-released',
      band: 'fix-now',
      title: 'Brake system needs attention — not the parking brake',
      explanation:
        'With the parking brake confirmed off, a red brake warning light points at the core hydraulic brake system — low fluid from a leak, or pads worn down to their built-in sensor. Brake fluid doesn’t evaporate on its own, so this isn’t something to top up and forget.',
      likelyCauses: ['Most often low brake fluid from a leak or worn-out pads', 'Sometimes a hydraulic fault — the master cylinder or a proportioning valve'],
      cost: { diyLow: 10, diyHigh: 200, shopLow: 150, shopHigh: 900, dealerLow: 300, dealerHigh: 2000 },
      escalation: ['The pedal feels soft or sinks toward the floor, or stopping takes noticeably longer'],
      symptomLine: 'Red brake warning light on, parking brake confirmed released.',
      askShopTo: 'check the brake fluid level and look for a leak, inspect the pad wear sensors, and test the hydraulic system before quoting a repair.',
      category: 'brake-fluid',
      selfCheck: [
        'Check the brake fluid reservoir under the hood — below the MIN line confirms a leak or badly worn pads, and is worth telling the shop up front.',
        'Look through the wheel spokes at the pad edge on each front wheel — visibly thin pads point at the sensor as the cause.',
      ],
      driveOrTow: {
        verdict: 'tow',
        note: 'This is the core braking system, not an assist feature — low fluid or a hydraulic fault can mean reduced stopping power with no further warning. Don’t rely on it for an emergency stop; have it looked at where it sits or towed.',
      },
      whatToBring: [
        'Any recent brake work receipts.',
        'Whether the pedal feels normal, soft, or sinks — that detail changes the diagnosis.',
      ],
      shopChoice:
        'Any independent shop can check fluid, pads, and basic hydraulics. If it turns out to be the master cylinder, get a firm quote before authorizing — it’s routine work, no dealer premium needed.',
      match: (a) => a.light === 'brake' && a.parkingBrake === 'released',
    },
    {
      id: 'brake-light-parking',
      band: 'all-clear',
      title: 'Almost certainly just the parking brake',
      explanation:
        'The red brake light’s single most common trigger is a parking brake that isn’t all the way off. Fully release it (push it down firmly, or make sure an electronic parking brake shows "off") and see if the light clears.',
      likelyCauses: ['Most often the parking brake not fully disengaged'],
      cost: { shopLow: 0, shopHigh: 0 },
      escalation: ['The light stays on after you’re sure it’s fully released — treat it as the hydraulic-system outcome instead'],
      symptomLine: 'Red brake warning light, parking brake possibly still engaged.',
      askShopTo: 'no action needed if the light clears once the parking brake is confirmed off.',
      match: (a) => a.light === 'brake' && a.parkingBrake === 'engaged',
    },
    {
      id: 'battery-dim',
      band: 'fix-now',
      title: 'Charging system failing',
      explanation:
        'A battery light with lights dimming or accessories cutting out means the car is running on battery alone — the alternator isn’t keeping up. You may have only a short distance before it stalls, so head somewhere safe now.',
      likelyCauses: ['Most often a failing alternator', 'Sometimes a broken drive belt or wiring fault', 'Occasionally a dead battery'],
      cost: { diyLow: 60, diyHigh: 400, shopLow: 200, shopHigh: 600, dealerLow: 300, dealerHigh: 1000 },
      escalation: ['The engine sputters or electrical systems start shutting down — pull over'],
      symptomLine: 'Battery/charging light with dimming lights — charging failure suspected.',
      askShopTo: 'load-test the battery and charging system (voltage at idle and under load) and inspect the belt before replacing parts.',
      category: 'battery-check',
      selfCheck: [
        'Switch off everything you don’t need — A/C, heated seats, stereo, phone charging — to stretch the charge you have left.',
        'Don’t shut the engine off until you’re where you want to end up. It may not restart.',
        'Most parts stores test the battery and alternator free, right in the parking lot — that usually tells you which of the two it is.',
      ],
      driveOrTow: {
        verdict: 'short-trip-only',
        note: 'You’re running on the battery alone, so range is short and unpredictable — it can stall in traffic without warning, and the steering can go heavy when it does. Under about 5 miles, city streets, no highway. If it’s further than that, or it’s dark or raining, tow it instead.',
      },
      whatToBring: ['The battery’s age, if you know it — often on a sticker on the case.'],
      shopChoice:
        'A free parts-store test first, then any independent shop. Alternator and battery work is routine — no dealer needed.',
      match: (a) => a.light === 'battery' && a.symptom === 'dim',
    },
    {
      id: 'battery',
      band: 'book-soon',
      title: 'Have the charging system tested',
      explanation:
        'A battery light on its own — with everything still working — points to the charging system, but it isn’t an immediate emergency. Get the battery and alternator tested soon (it’s a quick, cheap check) before it leaves you with a no-start.',
      likelyCauses: ['Most often an alternator starting to fail', 'Sometimes an aging battery', 'Occasionally a loose belt or connection'],
      cost: { diyLow: 60, diyHigh: 400, shopLow: 80, shopHigh: 600, dealerLow: 300, dealerHigh: 1000 },
      escalation: ['Lights dim, accessories cut out, or the car struggles to start — treat it as fix-now'],
      symptomLine: 'Battery/charging light on, no other symptoms yet.',
      askShopTo: 'test the battery and charging system and report the voltages before replacing the alternator or battery.',
      category: 'battery-check',
      match: (a) => a.light === 'battery',
    },
    {
      id: 'abs-drive',
      band: 'fix-now',
      title: 'Braking system needs attention now',
      explanation:
        'An ABS or traction light together with a change in how the brakes feel means more than one thing is off in the braking system. Get it checked right away rather than relying on it in an emergency stop.',
      likelyCauses: ['Often a wheel-speed sensor plus a hydraulic issue', 'Sometimes low brake fluid', 'Occasionally an ABS module fault'],
      cost: { diyLow: 25, diyHigh: 150, shopLow: 80, shopHigh: 1400, dealerLow: 500, dealerHigh: 2000 },
      escalation: ['The brake warning light is also on or the pedal feels soft — treat as urgent'],
      symptomLine: 'ABS/traction light with a change in braking feel.',
      askShopTo: 'pull the ABS codes, inspect the wheel-speed sensors, and check brake-fluid level before quoting a module.',
      category: 'brake-inspection',
      selfCheck: [
        'Check the brake fluid reservoir under the hood — below the MIN line is a real finding worth telling the shop.',
        'Note whether the red brake warning light is on too, not just the amber ABS one. That difference matters a lot to the diagnosis.',
      ],
      driveOrTow: {
        verdict: 'tow',
        note: 'The brakes feeling different alongside the light means this isn’t just a sensor fault — something hydraulic may be involved. Don’t rely on it for an emergency stop; have it looked at where it sits.',
      },
      whatToBring: [
        'Note which lights are on together (ABS, traction, red brake) and what changed about the pedal.',
      ],
      shopChoice:
        'Any independent shop can pull ABS codes and test a sensor. Get those results before anyone quotes an ABS module — modules are the expensive guess. If it does turn out to be the module, a dealer or ABS specialist has the programming/bleeding tools most independents don’t.',
      match: (a) => a.light === 'abs' && a.symptom === 'drive',
    },
    {
      id: 'abs',
      band: 'book-soon',
      title: 'ABS or traction light — book a scan',
      explanation:
        'With normal braking, an ABS or traction-control light usually means a wheel-speed sensor or its wiring — your regular brakes still work, but the anti-lock and stability assist may be off. Book a scan soon, sooner if the weather turns bad.',
      likelyCauses: ['Most often a wheel-speed sensor or dirty tone ring', 'Sometimes corroded sensor wiring', 'Occasionally an ABS module fault'],
      cost: { diyLow: 25, diyHigh: 150, shopLow: 80, shopHigh: 400, dealerLow: 500, dealerHigh: 2000 },
      escalation: ['The brake warning light joins it, or braking feel changes — treat it as fix-now'],
      symptomLine: 'ABS/traction light on, normal braking otherwise.',
      askShopTo: 'pull the ABS/traction codes and inspect the wheel-speed sensors and tone rings before recommending a module.',
      category: 'brake-inspection',
      match: (a) => a.light === 'abs',
    },
    {
      id: 'tpms',
      band: 'book-soon',
      title: 'Check your tire pressures',
      explanation:
        'The tire-pressure light means at least one tire is low — often just from a cold snap, sometimes a slow leak. Check and set all four to the door-sticker pressure. If one keeps going down or the tire looks flat, get it seen; if a tire is visibly flat or the car pulls, treat it as urgent.',
      likelyCauses: ['Most often low pressure from a temperature drop or slow leak', 'Sometimes a dead TPMS sensor battery', 'Occasionally a puncture or valve-stem leak'],
      cost: { diyLow: 0, diyHigh: 150, shopLow: 20, shopHigh: 250, dealerLow: 100, dealerHigh: 300 },
      escalation: ['A tire is visibly flat, the car pulls or vibrates, or pressure drops fast — don’t drive far'],
      symptomLine: 'Tire-pressure warning light on.',
      askShopTo: 'report the actual pressure at each wheel, check for a slow leak or puncture, and relearn the sensors if one is replaced.',
      category: 'tire-inspection',
      match: (a) => a.light === 'tpms',
    },
  ],
  fallback: {
    id: 'light-generic',
    band: 'book-soon',
    title: 'Get the light diagnosed',
    explanation: 'Book a scan soon so a shop can read exactly what the light is reporting.',
    likelyCauses: ['A code scan will identify the fault'],
    cost: { shopLow: 40, shopHigh: 150 },
    escalation: ['Any loss of power, smoke, or change in braking/steering — treat it as fix-now'],
    symptomLine: 'A dashboard warning light that needs diagnosis.',
    askShopTo: 'read the codes and report what triggered the light before quoting any repair.',
  },
}

// ===========================================================================
// 4. LEAK / SMELL / SMOKE  (design/playbooks-research/04-leak-smell-smoke.md)
// ===========================================================================
const leakSmell: Playbook = {
  id: 'leak-smell',
  label: 'A leak, smell, or smoke',
  blurb: 'A puddle, an unusual smell, or smoke / vapor',
  questions: [
    {
      id: 'what',
      eyebrow: 'A leak, smell, or smoke',
      text: 'What did you notice?',
      options: [
        { value: 'fluid', label: 'Fluid under the car' },
        { value: 'smoke', label: 'Smoke or vapor' },
        { value: 'smell', label: 'A smell, but no puddle or smoke' },
      ],
    },
    {
      id: 'color',
      eyebrow: 'Fluid under the car',
      text: 'What color is the fluid?',
      sub: 'Slip a piece of paper or cardboard under it to see.',
      when: (a) => a.what === 'fluid',
      options: [
        { value: 'clear', label: 'Clear / water-like', hint: 'Often from the A/C' },
        { value: 'green', label: 'Green, orange, or pink-ish', hint: 'Sweet-smelling' },
        { value: 'red', label: 'Red or reddish-brown', hint: 'Oily feel' },
        { value: 'brown', label: 'Brown or black', hint: 'Oily, may smell burnt' },
        { value: 'milky', label: 'Milky or tan' },
      ],
    },
    {
      id: 'smoke',
      eyebrow: 'Smoke or vapor',
      text: 'What color, and from where?',
      when: (a) => a.what === 'smoke',
      options: [
        { value: 'white', label: 'White, sweet-smelling', hint: 'From the tailpipe or engine bay' },
        { value: 'blue', label: 'Blue, oily-smelling' },
        { value: 'black', label: 'Black, fuel-smelling' },
      ],
    },
    {
      id: 'smell',
      eyebrow: 'A smell',
      text: 'What does it smell like?',
      when: (a) => a.what === 'smell',
      options: [
        { value: 'gas', label: 'Gas or fuel' },
        { value: 'sweet', label: 'Sweet or syrupy' },
        { value: 'burning', label: 'Burning oil or rubber' },
      ],
    },
  ],
  outcomes: [
    {
      id: 'fuel',
      band: 'fix-now',
      title: 'Possible fuel leak — treat as urgent',
      explanation:
        'A gas or fuel smell — with or without a visible leak — is a fire risk and shouldn’t wait. Avoid driving it if you can smell fuel strongly, and get it checked right away.',
      likelyCauses: ['Most often a fuel line, injector, or connector leak', 'Sometimes a tank, pump seal, or filler-neck leak', 'Occasionally an EVAP vapor leak'],
      cost: { diyLow: 10, diyHigh: 150, shopLow: 150, shopHigh: 1000, dealerLow: 250, dealerHigh: 1500 },
      escalation: ['Any visible dripping, stronger smell after refueling, or any smoke — stop driving'],
      symptomLine: 'Fuel smell, possible fuel leak.',
      askShopTo: 'pressure-test the fuel system and inspect the lines, tank, pump seal, and filler neck before authorizing repair.',
      category: 'fuel-filter',
      selfCheck: [
        'Check the gas cap is on and clicks — a bad cap seal is a genuinely common cause of a fuel smell, and it’s free to rule out.',
        'Park it outside and away from the house or garage, not in an enclosed space.',
        'If you can smell fuel strongly or see drips, don’t start it.',
      ],
      driveOrTow: {
        verdict: 'tow',
        note: 'A fuel leak is a fire risk, not an errand — vapor alone is enough. Leave it parked outside and have it towed rather than driving it in.',
      },
      whatToBring: [
        'Note when the smell is worst — right after refueling, on start-up, or all the time.',
      ],
      shopChoice:
        'Any independent shop can trace a fuel leak. Check for an open recall first, though — fuel-system recalls are common and the fix is free at a dealer.',
      match: (a) => a.smell === 'gas' || a.smoke === 'black',
    },
    {
      id: 'coolant-smoke',
      band: 'fix-now',
      title: 'Engine may be overheating',
      explanation:
        'White, sweet-smelling smoke or steam means coolant is burning off — either leaking onto hot parts or, worse, being burned inside the engine. Both risk overheating, which can warp or crack the engine. Treat persistent white smoke as stop-and-check.',
      likelyCauses: ['Often external coolant hitting hot engine parts', 'Sometimes an internal leak — a head gasket', 'Only briefly, harmless cold-start condensation'],
      cost: { diyLow: 10, diyHigh: 150, shopLow: 150, shopHigh: 8000, dealerLow: 250, dealerHigh: 10000 },
      escalation: ['The temperature gauge climbs, the heater blows cold, or the smoke thickens — pull over'],
      symptomLine: 'Persistent white, sweet-smelling smoke/steam.',
      askShopTo: 'pressure-test the cooling system, determine external vs. internal coolant loss, and run a combustion-gas / head-gasket check if needed.',
      category: 'coolant',
      selfCheck: [
        'Watch the temperature gauge — if it climbs past the middle, shut the engine off and let it cool.',
        'Never open the radiator cap or coolant reservoir on a warm engine. It’s under pressure and will scald you.',
        'Once it’s properly COLD — hours, not minutes — check the coolant reservoir against the min/max lines.',
      ],
      driveOrTow: {
        verdict: 'tow',
        note: 'Coolant is escaping, and an engine that overheats can go from a $200 hose to a $3,000 head gasket in one drive. Don’t drive it to the shop — have it towed.',
      },
      whatToBring: [
        'A photo of where the steam or puddle shows up.',
        'Any recent cooling-system receipts — hoses, water pump, radiator.',
      ],
      shopChoice:
        'Start with any independent shop for the pressure test — that result IS the diagnosis, before agreeing to head-gasket work. If it does come back internal, check your powertrain warranty first: head-gasket repair is often covered while it’s active, and a dealer is worth the trip for that decision alone.',
      match: (a) => a.smoke === 'white' || a.color === 'milky' || (a.smell === 'sweet' && a.what === 'smell'),
    },
    {
      id: 'coolant-fluid',
      band: 'book-soon',
      title: 'A coolant leak',
      explanation:
        'Green, orange, or pink sweet-smelling fluid is engine coolant. A small leak isn’t an emergency, but coolant loss leads to overheating, so get it looked at soon — and keep an eye on your temperature gauge in the meantime.',
      likelyCauses: ['Most often a radiator, hose, water pump, or reservoir leak', 'Sometimes a heater hose', 'Occasionally the radiator cap'],
      cost: { diyLow: 10, diyHigh: 250, shopLow: 150, shopHigh: 900, dealerLow: 250, dealerHigh: 1200 },
      escalation: ['The temperature gauge rises, the heater blows cold, or you see white steam — treat it as fix-now'],
      symptomLine: 'Green/orange/pink sweet-smelling coolant leak.',
      askShopTo: 'pressure-test the cooling system and inspect the radiator, hoses, water pump, and reservoir, confirming external vs. internal.',
      category: 'coolant',
      selfCheck: [
        'With the engine COLD, check the coolant reservoir against its min/max lines — then re-check it weekly until it’s fixed.',
        'Slide a sheet of cardboard under the front overnight: the colour and position of the drip tell the shop a lot.',
        'Never open the cap on a warm engine — it’s pressurised and will scald.',
      ],
      driveOrTow: {
        verdict: 'short-trip-only',
        note: 'Short local trips only — under about 10 miles, watching the temperature gauge the whole way, and keep the coolant topped up. Skip long drives, hot days, and towing. The moment the gauge climbs or the heater blows cold, pull over: that is no longer a small leak.',
      },
      whatToBring: ['A photo of the drip on the cardboard — colour and position both help.'],
      shopChoice:
        'Any independent shop. Ask for a pressure test rather than a “top it up and see what happens.”',
      match: (a) => a.color === 'green',
    },
    {
      id: 'trans-fluid',
      band: 'book-soon',
      title: 'A transmission (or power-steering) leak',
      explanation:
        'Red or reddish-brown oily fluid is usually transmission fluid, sometimes power-steering fluid. Low transmission fluid can turn a small leak into a big repair, so book it soon — sooner if the car is shifting oddly.',
      likelyCauses: ['Most often a transmission pan gasket, seal, or cooler line', 'Sometimes power-steering fluid on older systems'],
      cost: { diyLow: 10, diyHigh: 150, shopLow: 150, shopHigh: 900, dealerLow: 250, dealerHigh: 1500 },
      escalation: ['Shifting gets delayed or slips, there’s a burnt smell, or the fluid turns dark — treat it as fix-now'],
      symptomLine: 'Red/reddish oily fluid leak — likely transmission fluid.',
      askShopTo: 'identify the fluid, inspect the pan gasket, cooler lines, and seals, and report the fluid condition and any shift slip.',
      category: 'transmission-fluid',
      match: (a) => a.color === 'red',
    },
    {
      id: 'oil-leak',
      band: 'book-soon',
      title: 'An engine oil leak',
      explanation:
        'Brown or black oily fluid — often with a burning-oil smell as it drips onto hot parts — is an engine oil leak. A slow one isn’t urgent, but check your oil level regularly and get the source traced soon, since oil on the exhaust is a fire risk.',
      likelyCauses: ['Most often a valve-cover, oil-pan, or filter-housing gasket', 'Sometimes oil dripping onto the exhaust and burning off'],
      cost: { diyLow: 10, diyHigh: 120, shopLow: 150, shopHigh: 800, dealerLow: 250, dealerHigh: 1500 },
      escalation: ['The oil light comes on, the level drops fast, or you see smoke from under the hood — treat it as fix-now'],
      symptomLine: 'Brown/black oil leak, possible burning-oil smell.',
      askShopTo: 'clean and trace the leak to its source (valve cover, oil pan, filter housing) and check for oil on the exhaust before quoting.',
      category: 'oil-change',
      match: (a) => a.color === 'brown' || a.smoke === 'blue' || a.smell === 'burning',
    },
    {
      id: 'condensation',
      band: 'all-clear',
      title: 'Almost certainly harmless',
      explanation:
        'Clear, odorless water — usually near the middle or front after running the A/C — is just condensation dripping off the air-conditioning system. Nothing to fix. Only worth a second look if it’s paired with overheating or a sweet smell.',
      likelyCauses: ['Most often A/C condensation', 'Sometimes rain or wash water', 'Occasionally washer fluid'],
      cost: { shopLow: 0, shopHigh: 0 },
      escalation: ['If it turns out to be sweet-smelling or you overheat, it’s a coolant issue instead'],
      symptomLine: 'Clear, odorless fluid — likely A/C condensation.',
      askShopTo: 'no action needed unless another symptom appears; mention it at your next service for peace of mind.',
      match: (a) => a.color === 'clear',
    },
  ],
  fallback: {
    id: 'leak-generic',
    band: 'book-soon',
    title: 'Have the source identified',
    explanation:
      'It’s worth having a shop identify exactly what’s leaking or smelling before it gets worse. Note the color and where it pools — that’s half the diagnosis.',
    likelyCauses: ['Identifying the fluid or smell pins down the system'],
    cost: { shopLow: 40, shopHigh: 200 },
    escalation: ['Any fuel smell, white sweet smoke, or overheating — treat it as fix-now'],
    symptomLine: 'A leak or smell that needs identifying.',
    askShopTo: 'identify the fluid or smell, trace it to the source, and report what failed before replacing parts.',
  },
}

// ===========================================================================
// 5. CAR WON'T START  (design/playbooks-research/06-car-wont-start.md)
// ===========================================================================
const carWontStart: Playbook = {
  id: 'car-wont-start',
  label: 'The car won’t start',
  blurb: 'Nothing happens, clicking, cranks but won’t catch, or dies right away',
  questions: [
    {
      id: 'symptom',
      eyebrow: 'Car won’t start',
      text: 'What happens when you turn the key or press start?',
      sub: 'Pick the closest — you don’t have to be exact.',
      options: [
        { value: 'nothing', label: 'Nothing at all', hint: 'No lights, no sound' },
        { value: 'clicks', label: 'A click or rapid clicking', hint: 'The engine doesn’t turn over' },
        { value: 'cranks', label: 'The engine cranks but won’t catch', hint: 'It turns over, just doesn’t start' },
        { value: 'dies', label: 'It starts, then dies right away' },
      ],
    },
    {
      id: 'clickType',
      eyebrow: 'Car won’t start',
      text: 'Is it one solid click, or rapid clicking?',
      sub: 'These point at different parts.',
      when: (a) => a.symptom === 'clicks',
      options: [
        { value: 'single', label: 'One solid click' },
        { value: 'rapid', label: 'Rapid clicking, like a machine gun' },
      ],
    },
  ],
  outcomes: [
    {
      id: 'dead-battery',
      band: 'fix-now',
      title: 'Likely a dead or weak battery',
      explanation:
        'Total silence when you turn the key, or rapid clicking, is the classic sign of a battery too weak to crank the engine — by far the most common cause of a no-start. A jump start is usually the safe first move; the goal after that is finding out whether it’s the battery or the alternator behind it.',
      likelyCauses: ['Most often a dead or badly discharged battery', 'Sometimes corroded or loose battery terminals', 'Occasionally a failing alternator that let the battery run down'],
      cost: { diyLow: 0, diyHigh: 200, shopLow: 100, shopHigh: 300, dealerLow: 150, dealerHigh: 400 },
      escalation: ['A jump gets it running but it dies again soon after — that points at the alternator, not just the battery'],
      symptomLine: 'No response or rapid clicking when starting — suspect a dead/weak battery.',
      askShopTo: 'load-test the battery and charging system and inspect the terminals and cables before recommending a new battery.',
      category: 'battery-check',
      selfCheck: [
        'Look at the battery terminals for corrosion (white/blue crust) or looseness — a quick clean and tighten sometimes solves it outright.',
        'If you have jumper cables and another car, a jump start is safe here and the normal first move.',
        'Most parts stores test a battery and alternator free, right in the parking lot — that tells you which of the two it is.',
      ],
      driveOrTow: {
        verdict: 'tow',
        note: 'If a jump gets it running, drive straight to get the battery and charging system tested — don’t shut the engine off until you’re there. If a jump doesn’t get it running at all, have it towed.',
      },
      whatToBring: ['The battery’s age, if you know it — often on a sticker on the case.'],
      shopChoice:
        'A free parts-store test first, then any independent shop — battery and alternator work is routine, no dealer needed.',
      match: (a) => a.symptom === 'nothing' || (a.symptom === 'clicks' && a.clickType === 'rapid'),
    },
    {
      id: 'starter',
      band: 'fix-now',
      title: 'Likely the starter',
      explanation:
        'One solid click with no crank usually means the starter solenoid or the starter motor itself — the battery has enough to engage the solenoid but not enough (or the motor can’t) to turn the engine over. It can also still be a borderline-weak battery, since a solenoid needs less power than a full crank.',
      likelyCauses: ['Most often a faulty starter solenoid or starter motor', 'Sometimes a weak battery or a bad connection at the starter'],
      cost: { diyLow: 30, diyHigh: 300, shopLow: 300, shopHigh: 800, dealerLow: 400, dealerHigh: 1000 },
      escalation: ['Tapping the starter housing gets it to crank once — that’s a strong sign it’s the starter, not the battery'],
      symptomLine: 'One solid click, no crank, when starting.',
      askShopTo: 'test the starter draw and the battery/connections, and confirm whether it’s the starter, the solenoid, or a bad connection before quoting a starter replacement.',
      selfCheck: [
        'Check that the battery terminals are clean and tight — the same single-click symptom can come from a bad connection, which costs nothing to rule out.',
      ],
      driveOrTow: {
        verdict: 'tow',
        note: 'A car that won’t crank isn’t driveable regardless of the cause, and a failing starter can leave you stranded somewhere worse if it does start intermittently. Have it looked at where it sits or towed.',
      },
      whatToBring: ['Note whether tapping the starter housing (if you can reach it safely) gets it to crank once.'],
      shopChoice:
        'Any independent shop replaces starters routinely — no dealer premium needed here.',
      match: (a) => a.symptom === 'clicks' && a.clickType === 'single',
    },
    {
      id: 'cranks-no-start',
      band: 'fix-now',
      title: 'Cranks but won’t catch — spark or fuel',
      explanation:
        'The engine turning over normally rules out the battery and starter, which narrows this to no spark (ignition), no fuel delivery, or — less often — a security system refusing to let it run. It needs a shop to tell which, since the fix and the cost differ a lot between them.',
      likelyCauses: ['Often an ignition problem — coils or spark plugs', 'Sometimes no fuel delivery — pump, filter, or a relay', 'Occasionally a security/immobilizer fault'],
      cost: { diyLow: 20, diyHigh: 300, shopLow: 150, shopHigh: 1000, dealerLow: 250, dealerHigh: 1400 },
      escalation: ['You smell fuel while cranking — stop and treat it as a possible fuel leak instead'],
      symptomLine: 'Engine cranks normally but doesn’t start or catch.',
      askShopTo: 'check for spark and fuel pressure, pull any codes, and confirm whether it’s ignition, fuel delivery, or the security system before quoting parts.',
      selfCheck: [
        'If you smell fuel after a few tries, stop cranking it — that’s a different, more urgent issue.',
        'Note whether the security/immobilizer light flashed differently than usual, if your car has one.',
      ],
      driveOrTow: {
        verdict: 'tow',
        note: 'A car that cranks but won’t start isn’t going anywhere until a shop finds which system is at fault — have it towed rather than repeatedly cranking it, which can flood the engine or drain the battery.',
      },
      whatToBring: ['Any codes, if you’ve had them read.', 'Note how long you cranked it before giving up.'],
      shopChoice:
        'An independent shop can diagnose spark/fuel/security fine. Dealer only if it’s a security-system fault tied to the factory key/fob system.',
      match: (a) => a.symptom === 'cranks',
    },
    {
      id: 'starts-then-dies',
      band: 'fix-now',
      title: 'Starts, then stalls — idle or fuel delivery',
      explanation:
        'An engine that catches and then immediately dies usually can’t hold a stable idle — often an idle air/idle circuit issue, a vacuum leak, or the fuel pump losing prime. It’s not the safety emergency an overheating or oil-pressure light is, but the car currently can’t be relied on to stay running.',
      likelyCauses: ['Often an idle air control or idle circuit issue', 'Sometimes a vacuum leak', 'Sometimes the fuel pump losing prime or pressure'],
      cost: { diyLow: 20, diyHigh: 200, shopLow: 150, shopHigh: 600, dealerLow: 250, dealerHigh: 1000 },
      escalation: ['It won’t stay running even briefly after several tries, or you smell fuel — treat as a tow'],
      symptomLine: 'Engine starts, then stalls immediately.',
      askShopTo: 'check for a vacuum leak, test idle control, and check fuel pressure and prime before quoting a repair.',
      driveOrTow: {
        verdict: 'short-trip-only',
        note: 'If it manages to idle for more than a few seconds after restarting, a short local trip to the shop is fine. If it dies within a second or two every time, don’t keep trying — have it towed instead.',
      },
      whatToBring: ['Note how long it idles before dying, and whether it’s worse cold or warm.'],
      shopChoice: 'Any independent shop can diagnose an idle or fuel-delivery issue — routine work.',
      match: (a) => a.symptom === 'dies',
    },
  ],
  fallback: {
    id: 'wont-start-generic',
    band: 'fix-now',
    title: 'Won’t start — needs a diagnosis',
    explanation:
      'A no-start needs a shop to narrow down before anything can be fixed. Describe exactly what happens when you try to start it — that’s the fastest way to a diagnosis.',
    likelyCauses: ['A proper diagnosis will pin down the cause'],
    cost: { shopLow: 80, shopHigh: 300 },
    escalation: ['Any fuel smell while cranking — treat it as a possible fuel leak instead'],
    symptomLine: 'Car won’t start, cause not yet narrowed down.',
    askShopTo: 'check the battery, starter, spark, and fuel delivery and report which system is at fault before quoting a repair.',
    driveOrTow: { verdict: 'tow', note: 'A car that won’t start reliably isn’t safe to keep attempting on the road — have it looked at where it sits or towed.' },
  },
}

// ===========================================================================
// 6. STEERING / VIBRATION  (design/playbooks-research/07-steering-vibration.md)
// ===========================================================================
const steeringVibration: Playbook = {
  id: 'steering-vibration',
  label: 'Steering feels wrong or vibrates',
  blurb: 'A shimmy in the wheel, pulling, looseness, heaviness, or a clunk when turning',
  questions: [
    {
      id: 'when',
      eyebrow: 'Steering / vibration',
      text: 'When do you feel it?',
      sub: 'Not about braking — that’s a separate question elsewhere.',
      options: [
        { value: 'highway', label: 'Mostly at highway speed' },
        { value: 'turning', label: 'When turning the wheel' },
        { value: 'always', label: 'All the time, even parking-lot speeds' },
      ],
    },
    {
      id: 'feel',
      eyebrow: 'Steering / vibration',
      text: 'What does it feel like?',
      options: [
        { value: 'vibrate', label: 'A vibration or shimmy in the wheel' },
        { value: 'pull', label: 'The car pulls or wanders to one side' },
        { value: 'loose', label: 'Loose, with play before it responds' },
        { value: 'stiff', label: 'Heavy or hard to turn' },
        { value: 'noise', label: 'A clunk or grinding when turning' },
      ],
    },
  ],
  outcomes: [
    {
      id: 'loose-steering',
      band: 'fix-now',
      title: 'Play in the steering — worth treating as urgent',
      explanation:
        'Steering that feels loose or has play before it responds usually means a worn tie rod end, ball joint, or steering rack. That play tends to get worse, and it means slower, less precise steering exactly when you’d need it most.',
      likelyCauses: ['Most often a worn tie rod end or ball joint', 'Less often a worn steering rack'],
      cost: { diyLow: 100, diyHigh: 350, shopLow: 150, shopHigh: 600, dealerLow: 300, dealerHigh: 1500 },
      escalation: ['The play gets noticeably worse over a single drive, or the wheel feels like it could bind — treat it as a tow'],
      symptomLine: 'Steering play/looseness before it responds.',
      askShopTo: 'inspect the tie rod ends, ball joints, and steering rack for play and report which is worn before quoting a repair.',
      category: 'multi-point-inspection',
      selfCheck: [
        'With the car parked and the wheel straight, gently rock the steering wheel side to side — noticeable play before the wheels move is worth reporting exactly as you feel it.',
      ],
      driveOrTow: {
        verdict: 'short-trip-only',
        note: 'Driveable at low speed to a shop, but skip the highway — steering play tends to worsen and highway speed amplifies the risk. If it gets worse over the drive, stop and arrange a tow instead.',
      },
      whatToBring: ['Note whether it’s worse over bumps, on turns, or both.'],
      shopChoice:
        'Any independent shop handles tie rods and ball joints routinely — no dealer premium needed unless it turns out to be the steering rack itself.',
      match: (a) => a.feel === 'loose',
    },
    {
      id: 'power-steering-stiff',
      band: 'fix-now',
      title: 'Steering suddenly heavy — check power steering',
      explanation:
        'Steering that’s heavy or hard to turn points at low power-steering fluid, a leak, a failing pump, or — on electric power steering — a fault in the assist system. Still steerable, just harder, which makes tight parking-lot turns and emergency maneuvers noticeably worse.',
      likelyCauses: ['Often low power-steering fluid or a leak', 'Sometimes a failing power-steering pump', 'On electric power steering, an assist-system fault'],
      cost: { diyLow: 20, diyHigh: 200, shopLow: 150, shopHigh: 500, dealerLow: 250, dealerHigh: 1200 },
      escalation: ['Steering goes very heavy very suddenly, or you hear a squeal when turning — treat it as more urgent'],
      symptomLine: 'Steering suddenly heavy or hard to turn.',
      askShopTo: 'check the power-steering fluid level and look for a leak, and diagnose the pump or assist system before quoting a repair.',
      category: 'power-steering-fluid',
      selfCheck: [
        'Check the power-steering fluid reservoir under the hood, if your car has a hydraulic system — low fluid or a milky look points at a leak.',
      ],
      driveOrTow: {
        verdict: 'short-trip-only',
        note: 'Still steerable, just harder — fine for a short, careful local trip. Skip the highway and tight maneuvers where the extra effort matters most.',
      },
      whatToBring: ['Whether it happened suddenly or crept up over weeks — that changes the likely cause.'],
      shopChoice: 'Any independent shop can diagnose power steering — routine work, no dealer needed.',
      match: (a) => a.feel === 'stiff',
    },
    {
      id: 'pull-wander',
      band: 'book-soon',
      title: 'Pulling or wandering — alignment or tires',
      explanation:
        'A car that pulls or wanders is most often an alignment issue, uneven tire wear, or a tire pressure difference between sides. Not usually dangerous on its own, but worth sorting soon since it also wears tires faster.',
      likelyCauses: ['Most often an alignment issue', 'Sometimes uneven tire wear or a pressure difference side to side', 'Occasionally a worn suspension component'],
      cost: { diyLow: 0, diyHigh: 60, shopLow: 80, shopHigh: 200, dealerLow: 120, dealerHigh: 250 },
      escalation: ['The pull gets strong, or it happens under braking too — treat it as the brake-noise playbook’s pulling outcome instead'],
      symptomLine: 'Car pulls or wanders to one side while driving.',
      askShopTo: 'check tire pressures and wear, then perform an alignment check and report the readings before recommending a service.',
      category: 'wheel-alignment',
      match: (a) => a.feel === 'pull',
    },
    {
      id: 'vibrate-highway',
      band: 'book-soon',
      title: 'Likely a tire or wheel balance issue',
      explanation:
        'A vibration or shimmy that shows up mainly at highway speed is most often a wheel out of balance, sometimes a bent wheel or an out-of-round tire. Book a balance check soon — it’s quick and inexpensive to rule in or out.',
      likelyCauses: ['Most often an unbalanced tire/wheel', 'Sometimes a bent wheel', 'Occasionally an out-of-round tire'],
      cost: { diyLow: 0, diyHigh: 40, shopLow: 20, shopHigh: 150, dealerLow: 60, dealerHigh: 250 },
      escalation: ['The vibration grows quickly, or you can see a bulge or damage on a tire — treat it as fix-now'],
      symptomLine: 'Steering vibration mainly at highway speed.',
      askShopTo: 'check wheel balance on all four wheels and inspect for a bent rim or out-of-round tire before recommending a fix.',
      category: 'tire-balancing',
      match: (a) => a.when === 'highway' && a.feel === 'vibrate',
    },
    {
      id: 'vibrate-turning',
      band: 'book-soon',
      title: 'Likely a worn tie rod end or CV joint',
      explanation:
        'A vibration that shows up specifically when turning — rather than a steady highway shimmy — points more at a worn tie rod end or CV joint than a balance issue. Book it soon; a tie rod end resolves this kind of vibration in most cases once it’s replaced.',
      likelyCauses: ['Most often a worn outer tie rod end', 'Sometimes a worn CV joint'],
      cost: { diyLow: 60, diyHigh: 300, shopLow: 150, shopHigh: 500, dealerLow: 250, dealerHigh: 700 },
      escalation: ['You also hear a rhythmic click on turns — that’s the other-noise playbook’s CV-joint outcome, worth checking too'],
      symptomLine: 'Steering vibration specifically when turning.',
      askShopTo: 'inspect the tie rod ends and CV joints for play or wear and confirm which is causing the vibration.',
      match: (a) => a.when === 'turning' && a.feel === 'vibrate',
    },
    {
      id: 'vibrate-always',
      band: 'book-soon',
      title: 'Likely tire wear or a wheel bearing',
      explanation:
        'A vibration present at all speeds, including low speed, more often points at cupped/unevenly worn tires or a wheel bearing than a simple balance issue. Book it soon since worn tires also handle worse.',
      likelyCauses: ['Most often cupped or unevenly worn tires', 'Sometimes a wheel bearing'],
      cost: { diyLow: 50, diyHigh: 250, shopLow: 100, shopHigh: 450, dealerLow: 200, dealerHigh: 800 },
      escalation: ['The vibration grows quickly, or you hear a hum that rises with speed — treat it as a wheel-bearing concern'],
      symptomLine: 'Steering vibration present at all speeds, including low speed.',
      askShopTo: 'inspect the tread for cupping, check wheel-bearing play, and confirm tire pressures before recommending a fix.',
      category: 'tire-inspection',
      match: (a) => a.when === 'always' && a.feel === 'vibrate',
    },
    {
      id: 'clunk-turning',
      band: 'book-soon',
      title: 'A worn part is clunking when you turn',
      explanation:
        'A clunk or grinding specifically when turning usually means a worn CV joint or axle, a strut mount, or a suspension bushing. Book it soon so a small worn part doesn’t stress bigger ones around it.',
      likelyCauses: ['Most often a worn CV joint or axle', 'Sometimes a strut mount or suspension bushing'],
      cost: { diyLow: 40, diyHigh: 300, shopLow: 150, shopHigh: 500, dealerLow: 250, dealerHigh: 800 },
      escalation: ['The clunk becomes constant or you feel a shudder under acceleration too — treat it as fix-now'],
      symptomLine: 'Clunk or grinding when turning the wheel.',
      askShopTo: 'inspect the CV joints/axles, strut mounts, and suspension bushings and report which is causing the noise.',
      match: (a) => a.feel === 'noise',
    },
  ],
  fallback: {
    id: 'steering-generic',
    band: 'book-soon',
    title: 'Worth having the steering looked at',
    explanation:
      'Steering issues are worth a proper inspection to pin down. Book it soon so a shop can road-test and reproduce what you’re feeling.',
    likelyCauses: ['A road-test and inspection will localize the cause'],
    cost: { shopLow: 60, shopHigh: 250 },
    escalation: ['Steering suddenly feels loose, very heavy, or the car wanders strongly — treat it as fix-now'],
    symptomLine: 'A steering feel or vibration issue that needs diagnosis.',
    askShopTo: 'road-test the vehicle, check tire balance and alignment, and inspect the steering and suspension linkage before quoting a repair.',
  },
}

// ===========================================================================
// 7. AC / CLIMATE CONTROL  (design/perplexity-prompts.md Prompt 8)
// ===========================================================================
const acClimate: Playbook = {
  id: 'ac-climate',
  label: 'AC or heat isn’t working right',
  blurb: 'Blows warm on AC, cold on heat, weak airflow, or one side is different from the other',
  questions: [
    {
      id: 'symptom',
      eyebrow: 'AC or heat',
      text: 'What’s the main problem?',
      sub: 'Pick the closest — you can describe more in a moment.',
      options: [
        { value: 'warm-ac', label: 'AC blows warm instead of cold' },
        { value: 'cold-heat', label: 'Heat blows cold instead of warm' },
        { value: 'weak', label: 'Airflow is weak on both settings' },
        { value: 'uneven', label: 'One side or one vent is different from the rest' },
      ],
    },
    {
      id: 'acBehavior',
      eyebrow: 'AC blowing warm',
      text: 'What happens when you turn the AC on?',
      sub: 'Listen for the compressor clutch clicking in.',
      when: (a) => a.symptom === 'warm-ac',
      options: [
        { value: 'normalNoise', label: 'It clicks on normally, but a noise or smell shows up' },
        { value: 'cycles', label: 'It clicks on and off repeatedly (short-cycles)' },
        { value: 'noClick', label: 'It never seems to click on at all' },
        { value: 'none', label: 'Nothing unusual — it just stays warm' },
      ],
    },
    {
      id: 'filterAge',
      eyebrow: 'Weak airflow',
      text: 'Has the cabin air filter been changed in the last year or so?',
      when: (a) => a.symptom === 'weak',
      options: [
        { value: 'no', label: 'No, or not sure' },
        { value: 'yes', label: 'Yes, it’s been done recently' },
      ],
    },
  ],
  outcomes: [
    {
      id: 'ac-smell-noise',
      band: 'book-soon',
      title: 'AC noise or smell — worth booking soon, skip the AC meanwhile',
      explanation:
        'A noise or smell right as the AC clutch engages — squealing, burning, or something acrid — usually means a slipping belt, a seizing compressor, or an electrical fault. Keep running it and you risk losing the belt, which on many vehicles also drives the alternator and power steering, not just the AC.',
      likelyCauses: ['Most often a slipping or failing belt at the compressor clutch', 'Sometimes a seizing compressor', 'Occasionally an electrical short in the clutch circuit'],
      cost: { diyLow: 20, diyHigh: 150, shopLow: 120, shopHigh: 500, dealerLow: 180, dealerHigh: 1000 },
      escalation: ['The smell turns to smoke, or the belt squeal gets worse — stop using the AC and get it seen right away'],
      symptomLine: 'Noise or smell when the AC compressor clutch engages.',
      askShopTo: 'inspect the compressor clutch and belt, check for a seizing compressor, and test the clutch circuit before recharging or replacing anything.',
      selfCheck: ['Turn the AC off and see if the noise stops immediately — if it does, it’s pointing squarely at the AC compressor/clutch rather than something else under the hood.'],
      driveOrTow: {
        verdict: 'drive-ok',
        note: 'Fine to drive with the AC off. Just don’t run the AC until it’s looked at — a seizing compressor can throw or damage the drive belt.',
      },
      whatToBring: ['Note whether the noise happens only with the AC on, or all the time.'],
      shopChoice: 'Any independent shop can check a compressor clutch and belt — routine work, no dealer premium needed.',
      match: (a) => a.symptom === 'warm-ac' && a.acBehavior === 'normalNoise',
    },
    {
      id: 'ac-cycling',
      band: 'book-soon',
      title: 'AC blows warm — likely low refrigerant',
      explanation:
        'AC that clicks on and off rapidly instead of running steadily is the classic sign of a low refrigerant charge — a sealed AC system doesn’t use up refrigerant over time, so low charge almost always means a leak somewhere. It’s not dangerous, just increasingly useless in hot weather.',
      likelyCauses: ['Most often a refrigerant leak (hose, condenser, or a service port seal)', 'Sometimes a failing pressure switch reacting to the low charge'],
      cost: { diyLow: 20, diyHigh: 60, shopLow: 120, shopHigh: 260, dealerLow: 180, dealerHigh: 350 },
      escalation: ['The system stops engaging at all, or you notice oily residue anywhere in the engine bay — that often marks where the leak is'],
      symptomLine: 'AC short-cycles (clicks on and off) instead of running steady — suspect low refrigerant.',
      askShopTo: 'dye-test for a leak and confirm where it is before simply adding refrigerant — recharging a leaking system just empties out again.',
      whatToBring: ['How long ago the AC last worked normally, if you remember.'],
      shopChoice: 'Any independent shop with AC equipment can leak-test and recharge — no dealer needed unless the leak is at a component under warranty.',
      match: (a) => a.symptom === 'warm-ac' && a.acBehavior === 'cycles',
    },
    {
      id: 'ac-no-engage',
      band: 'book-soon',
      title: 'AC not engaging — compressor or a safety switch',
      explanation:
        'If the compressor never seems to click on at all, either a pressure switch is blocking it — often because the charge is already too low or too high to run safely — or the compressor clutch itself has failed. Worth a proper diagnosis before paying for parts, since the fix ranges from cheap to expensive depending on which it is.',
      likelyCauses: ['Often a low-pressure safety switch preventing engagement', 'Sometimes a failed compressor clutch or relay', 'Occasionally a blown fuse or wiring fault'],
      cost: { diyLow: 25, diyHigh: 120, shopLow: 120, shopHigh: 1500, dealerLow: 180, dealerHigh: 2000 },
      escalation: ['You hear a loud bang or grinding when trying to engage the AC — stop trying to run it'],
      symptomLine: 'AC compressor doesn’t engage at all when turned on.',
      askShopTo: 'check the AC system pressures and the pressure-switch reading before condemning the compressor — a low-charge shutoff looks identical to a dead clutch from the driver’s seat but costs far less to fix.',
      whatToBring: ['Whether it worked at all this season, or never has.'],
      shopChoice: 'Any independent shop can test pressures and the clutch circuit. Get that test result before authorizing a compressor — it’s the expensive guess here.',
      match: (a) => a.symptom === 'warm-ac' && a.acBehavior === 'noClick',
    },
    {
      id: 'ac-warm-generic',
      band: 'book-soon',
      title: 'AC blows warm — worth a proper diagnosis',
      explanation:
        'AC that’s just warm, with nothing else unusual, still needs a real diagnosis — refrigerant charge, a pressure switch, and the expansion valve all look the same from the driver’s seat. A shop with gauges can usually sort it out in one visit.',
      likelyCauses: ['A pressure/charge check will point at a leak, a switch, or the compressor'],
      cost: { shopLow: 120, shopHigh: 260, dealerLow: 180, dealerHigh: 350 },
      escalation: ['A noise or smell shows up, or the compressor stops engaging at all — treat those as more urgent'],
      symptomLine: 'AC blows warm, no other symptoms noticed.',
      askShopTo: 'check system pressures and dye-test for a leak before recommending a recharge or any parts.',
      match: (a) => a.symptom === 'warm-ac' && a.acBehavior === 'none',
    },
    {
      id: 'no-heat',
      band: 'book-soon',
      title: 'No cabin heat — likely coolant, thermostat, or blend door',
      explanation:
        'Heat that blows cold usually traces to one of three things: the coolant level is low (the heater core runs dry even if the engine drives fine), the thermostat is stuck open (the engine never gets hot enough), or the blend door isn’t routing air through the heater core. None of these are usually urgent by themselves — sort it before it gets cold outside.',
      likelyCauses: ['Most often low coolant or air trapped in the system', 'Sometimes a thermostat stuck open', 'Sometimes a blend-door or actuator fault', 'Less often a clogged heater core'],
      cost: { diyLow: 0, diyHigh: 80, shopLow: 80, shopHigh: 500, dealerLow: 120, dealerHigh: 700 },
      escalation: ['The temperature gauge climbs, you see steam, or you smell coolant — that’s an overheating concern, treat it as fix-now instead'],
      symptomLine: 'No or weak cabin heat; engine otherwise running normally.',
      askShopTo: 'check the coolant level, test the thermostat, and check blend-door operation and heater-core flow before replacing any parts.',
      category: 'coolant',
      selfCheck: ['With the engine COLD, check the coolant reservoir against the min/max lines — low coolant is the cheapest and most common cause here.'],
      whatToBring: ['Whether it’s cold all the time or fades in after a while, and any coolant top-ups you’ve done recently.'],
      shopChoice: 'Any independent shop handles coolant, thermostats, and blend doors routinely — no dealer premium needed unless it turns out to be a heater core buried deep in the dash.',
      match: (a) => a.symptom === 'cold-heat',
    },
    {
      id: 'weak-filter',
      band: 'coast',
      title: 'Weak airflow — probably just the cabin air filter',
      explanation:
        'A clogged cabin air filter is the single most common cause of weak airflow on both heat and AC, and it’s a cheap, quick fix. Worth doing before assuming anything more expensive is wrong.',
      likelyCauses: ['Most often a clogged cabin air filter'],
      cost: { diyLow: 15, diyHigh: 50, shopLow: 40, shopHigh: 100, dealerLow: 60, dealerHigh: 120 },
      escalation: ['Airflow stays weak after a fresh filter, or you notice a burning smell — treat that as book-soon instead'],
      symptomLine: 'Weak airflow on both heat and AC settings.',
      askShopTo: 'check and replace the cabin air filter, and confirm airflow improves before looking at the blower motor.',
      category: 'cabin-air-filter',
      match: (a) => a.symptom === 'weak' && a.filterAge !== 'yes',
    },
    {
      id: 'weak-blower',
      band: 'book-soon',
      title: 'Weak airflow — likely the blower motor or a blockage',
      explanation:
        'With a recently-changed cabin filter ruled out, weak airflow more likely points at the blower motor losing strength, its resistor/control module, or a blocked evaporator drain. Book a proper look — it usually needs the dash opened up rather than a DIY fix.',
      likelyCauses: ['Most often a weakening blower motor or its resistor/module', 'Sometimes a blocked evaporator or drain path'],
      cost: { diyLow: 20, diyHigh: 200, shopLow: 150, shopHigh: 500, dealerLow: 250, dealerHigh: 700 },
      escalation: ['A burning smell shows up, or the fan stops completely — treat that as more urgent, especially in hot weather'],
      symptomLine: 'Weak airflow on both heat and AC, cabin filter already recently replaced.',
      askShopTo: 'test blower motor current draw, check the resistor/control module, and inspect the evaporator drain before recommending a repair.',
      match: (a) => a.symptom === 'weak' && a.filterAge === 'yes',
    },
    {
      id: 'uneven-temp',
      band: 'book-soon',
      title: 'Uneven temperature — likely a blend-door actuator',
      explanation:
        'One side or vent running a different temperature than the rest is almost always a blend-door actuator not moving where it’s told, especially on dual-zone systems. Not urgent, but worth booking since it usually won’t fix itself.',
      likelyCauses: ['Most often a blend-door actuator fault', 'Sometimes an HVAC module/calibration issue', 'Occasionally restricted airflow to one side'],
      cost: { diyLow: 30, diyHigh: 150, shopLow: 180, shopHigh: 500, dealerLow: 250, dealerHigh: 700 },
      escalation: ['A burning smell or electrical smell shows up, or the whole system shuts down — treat that as fix-now'],
      symptomLine: 'Temperature mismatch between sides or vents.',
      askShopTo: 'check blend-door actuator operation and commanded-vs-actual position, and confirm vent temperature split before recommending a fix.',
      match: (a) => a.symptom === 'uneven',
    },
  ],
  fallback: {
    id: 'ac-generic',
    band: 'book-soon',
    title: 'Worth having the AC/heat system looked at',
    explanation:
      'Climate-control issues are hard to pin down without gauges and a proper inspection. Book a diagnosis soon — describing exactly what you’re noticing (which you’ve just done) saves the shop time.',
    likelyCauses: ['A pressure and airflow check will localize the cause'],
    cost: { shopLow: 100, shopHigh: 300 },
    escalation: ['A burning smell, smoke, or sudden total loss of climate control — treat that as fix-now'],
    symptomLine: 'An AC or heat problem that needs diagnosis.',
    askShopTo: 'check system pressures, airflow, and blend-door operation, and report what they find before quoting a repair.',
  },
}

// ===========================================================================
// 8. TRANSMISSION / DRIVETRAIN FEEL  (design/perplexity-prompts.md Prompt 9)
// ===========================================================================
const transmissionFeel: Playbook = {
  id: 'transmission-feel',
  label: 'The transmission feels off',
  blurb: 'Slipping, hard or late shifts, a shudder at speed, or hesitation from a stop',
  questions: [
    {
      id: 'feel',
      eyebrow: 'Transmission / drivetrain feel',
      text: 'What does it feel like?',
      sub: 'A feel, not a noise — how the car actually moves.',
      options: [
        { value: 'slip', label: 'Slips — the engine revs but the car doesn’t speed up to match' },
        { value: 'hardShift', label: 'Hard or late shifts', hint: 'A bang, jerk, or a long pause between gears' },
        { value: 'shudder', label: 'A shudder or shake at a steady speed' },
        { value: 'hesitation', label: 'A hesitation or pause pulling away from a stop' },
      ],
    },
    {
      id: 'light',
      eyebrow: 'Transmission / drivetrain feel',
      text: 'Any warning light with it?',
      sub: 'This changes how urgent it is.',
      options: [
        { value: 'none', label: 'No warning light' },
        { value: 'cel', label: 'A general check-engine light' },
        { value: 'transWarning', label: 'A transmission, "AT", or CVT-specific warning' },
      ],
    },
    {
      id: 'transType',
      eyebrow: 'Transmission / drivetrain feel',
      text: 'Automatic or CVT?',
      sub: 'Check your owner’s manual if you’re not sure — CVTs are less forgiving of this.',
      when: (a) => a.feel === 'shudder' || a.feel === 'hesitation',
      options: [
        { value: 'automatic', label: 'Conventional automatic' },
        { value: 'cvt', label: 'CVT (continuously variable)' },
        { value: 'notSure', label: 'Not sure' },
      ],
    },
  ],
  outcomes: [
    {
      id: 'slip-warning',
      band: 'fix-now',
      title: 'Slipping with a transmission warning light — stop and get it checked',
      explanation:
        'Slip paired with a transmission-specific warning light usually means the heat and wear have already gone past a simple fluid fix — burned clutch material or internal damage is a real possibility, and every mile of continued slipping generates more heat and makes it worse.',
      likelyCauses: ['Most often burned clutch packs or advanced internal wear', 'Sometimes a failing torque converter'],
      cost: { shopLow: 2500, shopHigh: 4500, dealerLow: 3500, dealerHigh: 6500 },
      escalation: ['The car refuses to move in gear, or you smell burning — stop and arrange a tow'],
      symptomLine: 'Transmission slips (engine revs, no matching acceleration) with a transmission warning light on.',
      askShopTo:
        'scan for transmission codes, check fluid condition and pan debris, and confirm whether this is internal wear before quoting a fluid service alone.',
      selfCheck: ['Avoid highway driving and long trips until it’s looked at — heat is what turns this into a bigger repair.'],
      driveOrTow: {
        verdict: 'short-trip-only',
        note: 'Keep it to short, local trips only — every mile of continued slipping adds heat and wear. Skip the highway entirely, and if it gets worse or refuses to engage, stop and arrange a tow instead.',
      },
      whatToBring: ['Any transmission fluid service receipts and roughly when the slipping started.'],
      shopChoice:
        'A transmission specialist or dealer is worth it here — get the codes and a fluid/pan inspection before authorizing a rebuild anywhere.',
      category: 'transmission-fluid',
      match: (a) => a.feel === 'slip' && a.light === 'transWarning',
    },
    {
      id: 'slip-generic',
      band: 'book-soon',
      title: 'Transmission slipping — worth diagnosing before it gets worse',
      explanation:
        'Slip — the engine revving without the car speeding up to match — is the one drivetrain feel worth taking seriously even without a warning light, because heat makes it worse and a service-level fix now can prevent an expensive one later. Low or dirty fluid is the most common and cheapest cause; a solenoid, valve body, or torque converter issue are the next most likely.',
      likelyCauses: ['Most often low or degraded transmission fluid', 'Sometimes a solenoid or valve-body issue', 'Sometimes a torque converter problem'],
      cost: { diyLow: 0, diyHigh: 120, shopLow: 80, shopHigh: 1800, dealerLow: 150, dealerHigh: 2500 },
      escalation: ['The slipping gets stronger, a warning light comes on, or you smell burning — treat it as fix-now'],
      symptomLine: 'Transmission slips — engine revs without a matching increase in speed.',
      askShopTo:
        'check fluid level and condition first (report if it smells burned or the pan shows debris), then scan for codes and check line pressure before recommending a fluid service or teardown.',
      whatToBring: ['Any past transmission fluid service receipts, and how the slipping has changed over time.'],
      shopChoice: 'Any independent shop can check fluid and pull codes. Get that result before agreeing to solenoid, valve-body, or torque-converter work.',
      category: 'transmission-fluid',
      match: (a) => a.feel === 'slip' && has(a, 'light'),
    },
    {
      id: 'hard-shift-warning',
      band: 'fix-now',
      title: 'Hard shifting with a warning light — get it looked at now',
      explanation:
        'Hard or banging shifts together with a transmission warning light are more than an adaptive-learning quirk — the control system has flagged a real fault. Keep driving on it and a shift-quality problem can turn into a stuck gear or a stranding.',
      likelyCauses: ['Most often a solenoid or valve-body fault', 'Sometimes advanced internal wear'],
      cost: { diyLow: 0, diyHigh: 120, shopLow: 300, shopHigh: 2200, dealerLow: 450, dealerHigh: 3000 },
      escalation: ['A specific gear stops working, or the shifts get more violent — stop and arrange a tow'],
      symptomLine: 'Hard or late shifts with a transmission warning light on.',
      askShopTo: 'pull the transmission codes, road-test with live shift data, and report commanded vs. actual shift behavior before quoting parts.',
      driveOrTow: {
        verdict: 'short-trip-only',
        note: 'Fine for a short, local drive to the shop — skip the highway. If a gear stops engaging or the shifts get more violent, stop and have it towed instead.',
      },
      whatToBring: ['When the light first came on relative to the hard shifting.'],
      shopChoice: 'An independent transmission shop or dealer can pull the codes — get those before authorizing valve-body or solenoid work.',
      category: 'transmission-fluid',
      match: (a) => a.feel === 'hardShift' && a.light === 'transWarning',
    },
    {
      id: 'hard-shift-generic',
      band: 'book-soon',
      title: 'Hard or late shifts — worth a proper look',
      explanation:
        'Hard, late, or banging shifts usually trace to fluid condition, a shift solenoid, or occasionally the computer needing a relearn after a battery event. It’s not usually urgent by itself, but it’s worth booking before it changes into something a warning light flags.',
      likelyCauses: ['Most often fluid condition or the wrong fluid spec', 'Often a shift solenoid or pressure-control issue', 'Sometimes a valve-body fault', 'Occasionally a control-module relearn is all it needs'],
      cost: { diyLow: 0, diyHigh: 120, shopLow: 80, shopHigh: 1500, dealerLow: 150, dealerHigh: 2200 },
      escalation: ['A warning light comes on, a specific gear stops working, or the car suddenly bangs hard into gear after driving normally — treat those as fix-now'],
      symptomLine: 'Hard, late, or banging shifts, no warning light.',
      askShopTo: 'check fluid spec and condition, scan for stored/pending codes, and road-test with live data before recommending valve-body or solenoid work.',
      category: 'transmission-fluid',
      match: (a) => a.feel === 'hardShift' && has(a, 'light'),
    },
    {
      id: 'shudder-warning',
      band: 'fix-now',
      title: 'Shudder with a warning light — treat as urgent',
      explanation:
        'A steady-speed shudder together with a transmission or CVT warning light is a real red flag, especially on a CVT, where it often means belt/pulley slip or fluid that’s already overheated. Continued driving accelerates the damage rather than just being uncomfortable.',
      likelyCauses: ['On a CVT, most often belt/pulley slip or overheated fluid', 'On a conventional automatic, most often advanced torque-converter or internal wear'],
      cost: { shopLow: 2500, shopHigh: 5000, dealerLow: 3500, dealerHigh: 7000 },
      escalation: ['The shudder gets stronger, you get an overheating message, or you smell burning — stop and arrange a tow'],
      symptomLine: 'Steady-speed shudder with a transmission/CVT warning light on.',
      askShopTo:
        'check fluid level, condition, and temperature history, scan for codes, and confirm whether this is torque-converter- or belt/pulley-related before any fluid exchange.',
      driveOrTow: {
        verdict: 'short-trip-only',
        note: 'Keep it short and local — no highway. On a CVT especially, this combination doesn’t improve by driving through it; if the shudder worsens or a temperature warning appears, stop and have it towed.',
      },
      whatToBring: ['Whether this is a CVT or conventional automatic, and any recent fluid service history.'],
      shopChoice: 'A transmission specialist or dealer — get fluid condition and codes documented before agreeing to any belt, pulley, or torque-converter work.',
      category: 'cvt-fluid',
      match: (a) => a.feel === 'shudder' && a.light === 'transWarning',
    },
    {
      id: 'shudder-cvt',
      band: 'book-soon',
      title: 'CVT shudder — don’t let this sit',
      explanation:
        'A shudder at steady speed on a CVT is a more pointed warning than the same feel on a conventional automatic — it can mean the belt and pulleys are starting to slip, or the fluid has begun breaking down from heat. Book it soon rather than waiting for a light to confirm it.',
      likelyCauses: ['Most often CVT fluid degradation from heat', 'Sometimes early belt/pulley slip'],
      cost: { diyLow: 50, diyHigh: 120, shopLow: 150, shopHigh: 500, dealerLow: 250, dealerHigh: 700 },
      escalation: ['A CVT/transmission warning light appears, or the shudder gets stronger — treat it as fix-now'],
      symptomLine: 'Steady-speed shudder on a CVT, no warning light yet.',
      askShopTo: 'check CVT fluid condition and temperature history and confirm whether the shudder is fluid-related or early belt/pulley wear before recommending a fluid exchange.',
      category: 'cvt-fluid',
      match: (a) => a.feel === 'shudder' && a.transType === 'cvt',
    },
    {
      id: 'shudder-auto',
      band: 'book-soon',
      title: 'Shudder at speed — likely the torque converter',
      explanation:
        'On a conventional automatic, a shudder that shows up at a steady speed is the classic sign of the torque converter clutch engaging roughly, sometimes alongside fluid condition. Not usually urgent, but worth booking before it progresses.',
      likelyCauses: ['Most often torque-converter clutch shudder', 'Sometimes fluid condition contributing to it'],
      cost: { diyLow: 30, diyHigh: 120, shopLow: 150, shopHigh: 900, dealerLow: 250, dealerHigh: 1400 },
      escalation: ['A warning light appears or the shudder gets stronger — treat it as fix-now'],
      symptomLine: 'Steady-speed shudder on a conventional automatic, no warning light.',
      askShopTo: 'check fluid condition, scan for codes, and confirm whether the shudder is torque-converter-related before recommending a fluid service.',
      category: 'transmission-fluid',
      match: (a) => a.feel === 'shudder' && has(a, 'transType'),
    },
    {
      id: 'hesitation-warning',
      band: 'fix-now',
      title: 'Hesitation with a warning light — get it checked now',
      explanation:
        'A pause pulling away combined with a transmission warning light suggests the unit isn’t transmitting torque cleanly — on a CVT this can mean belt/pulley wear or overheating, on a conventional automatic it can mean the torque converter or internal wear. Both get worse with continued driving.',
      likelyCauses: ['On a CVT, often belt/pulley wear or overheating', 'On a conventional automatic, often torque-converter or internal wear'],
      cost: { shopLow: 2500, shopHigh: 5000, dealerLow: 3500, dealerHigh: 7000 },
      escalation: ['The car won’t engage a gear at all, or you smell burning — stop and arrange a tow'],
      symptomLine: 'Hesitation pulling away from a stop, with a transmission warning light on.',
      askShopTo: 'check fluid level and condition, scan for codes, and verify line pressure and clutch/belt engagement before recommending a rebuild.',
      driveOrTow: {
        verdict: 'short-trip-only',
        note: 'Keep it short and local — no highway. If it stops engaging a gear at all, don’t keep trying; have it towed instead.',
      },
      whatToBring: ['Whether this is a CVT or conventional automatic, and how long the pause lasts.'],
      shopChoice: 'A transmission specialist or dealer — get pressure, codes, and fluid condition documented before authorizing a rebuild.',
      category: 'transmission-fluid',
      match: (a) => a.feel === 'hesitation' && a.light === 'transWarning',
    },
    {
      id: 'hesitation-cvt',
      band: 'book-soon',
      title: 'Hesitation from a stop — check the CVT soon',
      explanation:
        'A pause before the car takes off is worth booking soon on any transmission, but on a CVT specifically it’s worth not letting it drag on — it can be an early sign of belt/pulley wear rather than just fluid needing attention.',
      likelyCauses: ['Most often low or degraded CVT fluid', 'Sometimes early belt/pulley wear'],
      cost: { diyLow: 0, diyHigh: 50, shopLow: 150, shopHigh: 600, dealerLow: 250, dealerHigh: 900 },
      escalation: ['A CVT/transmission warning light appears, or the car won’t engage a gear — treat it as fix-now'],
      symptomLine: 'Hesitation pulling away from a stop on a CVT, no warning light.',
      askShopTo: 'check CVT fluid level and condition and confirm whether the hesitation is fluid-related or early belt/pulley wear.',
      category: 'cvt-fluid',
      match: (a) => a.feel === 'hesitation' && a.transType === 'cvt',
    },
    {
      id: 'hesitation-auto',
      band: 'book-soon',
      title: 'Hesitation from a stop — likely fluid or a valve-body issue',
      explanation:
        'A pause before the car takes off usually points at low or degraded fluid, or a valve body/solenoid not building pressure quickly enough. Book it soon — this is normally a service-level fix if caught early.',
      likelyCauses: ['Most often low or degraded transmission fluid', 'Sometimes a valve-body or solenoid issue', 'Occasionally torque-converter wear'],
      cost: { diyLow: 0, diyHigh: 120, shopLow: 80, shopHigh: 1500, dealerLow: 150, dealerHigh: 2200 },
      escalation: ['A warning light comes on, the pause gets longer, or the car won’t engage a gear — treat it as fix-now'],
      symptomLine: 'Hesitation pulling away from a stop, no warning light.',
      askShopTo: 'check fluid level and condition, scan for codes, and verify line pressure and clutch engagement timing before recommending a repair.',
      category: 'transmission-fluid',
      match: (a) => a.feel === 'hesitation' && has(a, 'transType'),
    },
  ],
  fallback: {
    id: 'transmission-generic',
    band: 'book-soon',
    title: 'Worth having the transmission looked at',
    explanation:
      'Drivetrain feel issues are hard to pin down without a road test and a scan. Book a diagnosis soon — describing exactly what you felt (which you’ve just done) saves the shop time.',
    likelyCauses: ['A road test with live data will localize the cause'],
    cost: { shopLow: 100, shopHigh: 300 },
    escalation: ['A warning light appears, the car won’t engage a gear, or you smell burning — treat it as fix-now'],
    symptomLine: 'A transmission/drivetrain feel issue that needs diagnosis.',
    askShopTo: 'check fluid level and condition, scan for codes, and road-test with live data before recommending any repair.',
  },
}

export const PLAYBOOKS: Playbook[] = [
  warningLight,
  brakeNoise,
  otherNoise,
  leakSmell,
  carWontStart,
  steeringVibration,
  acClimate,
  transmissionFeel,
]

export function getPlaybook(id: string): Playbook | undefined {
  return PLAYBOOKS.find((p) => p.id === id)
}

// --- resolver --------------------------------------------------------------

export type StepResult =
  | { kind: 'question'; question: PlaybookQuestion }
  | { kind: 'outcome'; outcome: PlaybookOutcome }

/** The applicable questions for the current answers, in order. */
export function applicableQuestions(pb: Playbook, answers: Answers): PlaybookQuestion[] {
  return pb.questions.filter((q) => !q.when || q.when(answers))
}

/**
 * Given the answers so far, return either the next question to ask or the
 * resolved outcome. An outcome fires as soon as its `match` predicate is
 * satisfied (so a decisive first answer can short-circuit); otherwise we keep
 * asking applicable questions, and fall back to the safe generic outcome only
 * once every applicable question has been answered.
 */
export function resolveStep(pb: Playbook, answers: Answers): StepResult {
  const matched = pb.outcomes.find((o) => o.match && o.match(answers))
  if (matched) return { kind: 'outcome', outcome: matched }

  const next = applicableQuestions(pb, answers).find((q) => !has(answers, q.id))
  if (next) return { kind: 'question', question: next }

  return { kind: 'outcome', outcome: pb.fallback }
}

// --- cost + shop-brief bridge ----------------------------------------------

function money(n: number): string {
  return `$${n.toLocaleString('en-US')}`
}

/** The independent-shop range as display text (used on the verdict cost card). */
export function fairRangeText(cost: CostRange): string {
  return `${money(cost.shopLow)}–${money(cost.shopHigh)}`
}

/**
 * Adapt a resolved triage outcome into the shop-brief module's `BriefFacts`
 * (domain/shopBrief.ts's `composeBrief`) — the "one-line mapper" that module's
 * header anticipates. Keeps a single shop-brief composer in the app rather than
 * a second one here; the playbook research already carries the symptom, the
 * mechanic-language request, the cost range, and the escalation triggers.
 */
// --- context-aware verdicts (Stage 5B) --------------------------------------
//
// The engine (what's overdue) informs the triage (what's wrong): a PURE
// contextualizer that annotates an already-resolved outcome with a note when
// the outcome's own maintenance category is also overdue/due-soon on the
// engine side. `resolveStep` and every `match` predicate stay pure and
// context-free — this is a separate pass the page applies AFTER resolution,
// so the decision tree itself is untouched.

export interface TriageContext {
  overdueCategories: Set<MaintenanceCategory>
  dueSoonCategories: Set<MaintenanceCategory>
}

/**
 * Returns an annotated COPY of `outcome` when its category is overdue or due
 * soon on the reminder engine's side; otherwise returns `outcome` unchanged
 * (identity-equal, so callers can rely on reference equality for "no-op").
 * Only ever ADDS a leading context sentence to `explanation` — band and
 * escalation triggers are never touched, so this can sharpen a verdict but
 * never relax or reassure one away (same fail-safe rule as the engine).
 * Reordering `likelyCauses` is deliberately NOT done here: the research-
 * authored order already puts the "most often" cause first for every
 * outcome, so a string-matching heuristic to find "the wear-related one"
 * would be guessing at prose rather than reusing real data.
 */
export function contextualizeOutcome(outcome: PlaybookOutcome, context: TriageContext): PlaybookOutcome {
  if (!outcome.category) return outcome
  const overdue = context.overdueCategories.has(outcome.category)
  const dueSoon = !overdue && context.dueSoonCategories.has(outcome.category)
  if (!overdue && !dueSoon) return outcome

  const label = CATEGORY_LABELS[outcome.category].toLowerCase()
  const note = overdue
    ? `Your ${label} is also overdue for service, which raises the odds this is the wear-related cause below.`
    : `Your ${label} is also due soon, which raises the odds this is the wear-related cause below.`

  return { ...outcome, explanation: `${note} ${outcome.explanation}` }
}

export function outcomeToBriefFacts(outcome: PlaybookOutcome): BriefFacts {
  return {
    title: outcome.title,
    band: outcome.band,
    symptom: outcome.symptomLine,
    request: `Please ${outcome.askShopTo}`,
    likelyCause: outcome.likelyCauses[0] ?? null,
    costLow: outcome.cost.shopLow,
    costHigh: outcome.cost.shopHigh,
    diyLow: outcome.cost.diyLow ?? null,
    diyHigh: outcome.cost.diyHigh ?? null,
    escalationTriggers: outcome.escalation,
  }
}

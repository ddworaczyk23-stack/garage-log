import type { SignalBand } from './verdict'
import type { MaintenanceCategory } from '../types'
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
        { value: 'abs', label: 'ABS or traction control' },
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
      askShopTo: 'measure oil pressure with a mechanical gauge, check for leaks, and report the pump/engine condition before authorizing major work.',
      category: 'oil-change',
      match: (a) => a.light === 'oil',
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

export const PLAYBOOKS: Playbook[] = [warningLight, brakeNoise, otherNoise, leakSmell]

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

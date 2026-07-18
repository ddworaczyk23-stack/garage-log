# Product

## Register

product

## Platform

web

## Users

Everyday US drivers who are not mechanics — people who know something is squealing or a light is on, but not what it means, what it costs, or whether they can keep driving. They use Coast in stressful, low-context moments (a noise on the commute, a warning light in a parking lot, a quote at the service counter) and in calm ones (checking what the car needs this month). The job to be done: understand what my car actually needs, know how urgent it is, and walk into a shop informed instead of anxious. Installed as a PWA on a phone; the phone-at-the-counter and phone-in-the-driveway postures are primary.

## Product Purpose

Coast is a local-first PWA that tracks vehicle maintenance and translates car trouble into plain-English verdicts. It layers three things over a household's real service history: proactive verdicts (what needs attention, what can coast), guided triage for symptoms (noises, warning lights, leaks — resolved through 1–3 plain-language questions to a banded verdict with likely causes, fair cost ranges, and a drive-vs-tow call), and a shop brief that translates the owner's symptom into mechanic language with a fair price anchor and a quote checker. All data lives on-device (IndexedDB) with optional private per-user sync; no accounts required, no data sold, no referrals. Success looks like: a driver who was anxious about a noise leaves the shop having paid a fair price for the right repair — or coasted confidently on something that could wait.

## Positioning

Coast tells you what your car actually needs in plain English — and stays on your side of the counter. The claim leads; the feeling underneath it is anti-anxiety: knowing when you can coast is worth as much as knowing when to act. Honest record-keeping is the substrate that makes both trustworthy.

## Brand Personality

Calm, straight-talking, on-your-side. The voice of the interface is US road signage: short declarative verdicts set in the signage register (Overpass), explained by one humane serif sentence (Newsreader), with numbers as quiet data (Overpass Mono). Urgency is stated plainly and proportionally — never dramatized, never softened when safety is at stake. The app talks like a knowledgeable friend at the counter, not a service advisor with a sales target.

## Anti-references

- **The generic SaaS dashboard.** Stat-tile grids, gradient accents, density for its own sake, dashboard-shaped screens that answer no question a driver asked.
- **Parts-store / service-lane upsell energy.** Coupons, urgency banners, cross-sells, anything that monetizes the driver's uncertainty. Coast never sells parts, shops, or referrals.
- **The fear-mongering car app.** Red-alert overload, mechanic jargon that makes non-mechanics feel stupid, or scare-framing that pushes action through anxiety. Red is reserved for genuinely-stop-now.

## Design Principles

1. **Never narrate ignorance as reassurance.** "We don't know this car yet" must never render as "All clear." Absence of data gets its own honest state; green is earned by real history.
2. **One verdict first, depth on demand.** Every screen leads with the single plain-English answer (the sign); causes, costs, and history are one tap below (the explanation). Two instruments saying the same thing is one too many.
3. **Speak driver, translate to mechanic.** Input is always the driver's own words ("a grind or scrape"); output at the counter is mechanic language the shop respects. The app owns the translation in both directions.
4. **Err urgent on safety, calm on money.** Brakes, oil pressure, and fuel escalate conservatively — drive-vs-tow is a first-class verdict. Costs and schedules stay matter-of-fact; money is data, not a warning.
5. **Earned familiarity over novelty.** Standard affordances, one component vocabulary, verdict bands that always mean the same thing everywhere. The tool disappears into the task.

## Accessibility & Inclusion

Target **WCAG 2.1 AA**: text contrast ≥4.5:1 (≥3:1 large), full keyboard operability, visible focus, screen-reader-tested flows for triage and forms. Existing practices to preserve and extend: `role="alert"`/`role="status"` on verdicts and notices, labeled form controls, `prefers-reduced-motion` alternatives for all motion, day-light legibility (the phone-in-a-parking-lot scenario is the contrast stress case). Copy is plain-language by principle, which is itself an accessibility feature for stressed or non-expert readers.

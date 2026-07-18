# Perplexity research prompts — one playbook per conversation

Paste one at a time, in separate Perplexity threads. Use Pro Search if your free tier gives you
a few per day. Bring each result back before starting the next.

---

## Prompt 1 — Brake noise

I'm building a diagnostic playbook for a consumer car app: a driver hears a noise while braking
and answers 2-3 follow-up questions to get a verdict. Focus on mainstream US vehicles (F-150,
Rogue, Camry, Civic, CR-V and similar).

Give me a decision tree:
1. Follow-up questions asked in order (e.g. what the sound is — squeal/grind/clunk; when it
   happens — first stops of the day vs always; does it pull to one side or pulse the pedal),
   with their answer options.
2. For each terminal branch: ranked likely causes with rough likelihood, an urgency band
   (fix-now / book-soon / can-coast / all-clear) and why.
3. Real cost ranges (2025-2026, US): DIY parts-only, independent shop, dealer.
4. Escalation triggers — symptoms a non-mechanic would notice that should immediately bump the
   band to fix-now (e.g. pulsing pedal, pulling to one side, longer stopping distance).
5. Shop-brief: 1-2 sentences translating the symptom for a mechanic, plus what to ask them to
   check/report before authorizing repair.

Cite sources for the cost ranges and likelihood rankings. Structured markdown, consistent format.

---

## Prompt 2 — Other noises (not braking)

Same app, same format as above, but for noises NOT related to braking: heard when turning,
when accelerating, or constant regardless of what the driver is doing (rises/falls with speed).
Mainstream US vehicles (F-150, Rogue, Camry, Civic, CR-V and similar).

Decision tree:
1. Follow-up questions in order (when it happens — turning/accelerating/constant; pitch — hum/
   whine/clunk/squeal; front vs rear if the driver can tell), with answer options.
2. For each terminal branch: ranked likely causes with likelihood, urgency band (fix-now /
   book-soon / can-coast / all-clear) and why.
3. Real cost ranges (2025-2026, US): DIY parts-only, independent shop, dealer.
4. Escalation triggers a non-mechanic would notice that bump to fix-now (e.g. noise gets louder
   fast, steering feels loose, grinding when turning at low speed).
5. Shop-brief: symptom translated for a mechanic + what to ask them to check/report first.

Cite sources for costs and likelihood. Structured markdown, consistent format.

---

## Prompt 3 — Dashboard warning lights

Same app, same format. Focus on the lights an everyday driver actually sees and panics about:
check engine (solid vs flashing), tire pressure, battery/charging, oil pressure, ABS, traction
control. Mainstream US vehicles.

Decision tree:
1. Follow-up questions in order (which light; solid or flashing; any other symptom noticed at
   the same time — smell, noise, handling change), with answer options.
2. For each terminal branch: ranked likely causes with likelihood, urgency band (fix-now /
   book-soon / can-coast / all-clear) and why. Be explicit that a FLASHING check engine light is
   always fix-now (active misfire risk) vs solid, which usually isn't.
3. Real cost ranges (2025-2026, US) for diagnosis + the most common fixes: DIY parts-only,
   independent shop, dealer.
4. Escalation triggers a non-mechanic would notice that bump the band up.
5. Shop-brief: what to tell the shop (light + any other symptoms) + what to ask them to check/
   report (e.g. "get the OBD-II code read before authorizing any repair").

Cite sources for costs and likelihood. Structured markdown, consistent format.

---

## Prompt 4 — Leak, smell, or smoke

Same app, same format. A driver notices fluid under the car, an unusual smell, or smoke/vapor.
Mainstream US vehicles.

Decision tree:
1. Follow-up questions in order (fluid color if visible — clear/green/red-pink/brown/black/
   milky; where it's pooling — front/center/rear; any smell — sweet, burning rubber, burning oil,
   gas; any smoke color if applicable), with answer options.
2. For each terminal branch: ranked likely causes with likelihood, urgency band (fix-now /
   book-soon / can-coast / all-clear) and why. Be explicit about which combinations (e.g. white
   smoke + sweet smell, or any smoke at all) are always fix-now.
3. Real cost ranges (2025-2026, US): DIY parts-only, independent shop, dealer.
4. Escalation triggers a non-mechanic would notice that bump the band up.
5. Shop-brief: what to tell the shop (fluid color/location or smell/smoke description) + what to
   ask them to check/report before authorizing repair.

Cite sources for costs and likelihood. Structured markdown, consistent format.

---

## Prompt 5 — Drive-vs-tow thresholds (Stage 5A action layer)

I'm building the "can I keep driving?" call for a consumer car app. For each symptom below, tell
me whether a typical US driver (F-150, Rogue, Camry, Civic, CR-V and similar, 2015-2022) should:
**drive-ok** (safe to keep driving normally), **short-trip-only** (drive only to the nearest shop,
low speed, no highway), or **tow** (do not drive).

Symptoms:
1. Battery/charging light ON with headlights dimming and accessories cutting out.
2. ABS light ON *together with* the red brake warning light and a changed pedal feel.
3. Solid check-engine light WITH rough running / noticeable power loss (no flashing).
4. Small coolant seep — visible drip, sweet smell, temperature gauge still normal.
5. Flashing check-engine light (active misfire).
6. Oil pressure light that stays on after topping up the oil.

For each: the call, the concrete threshold a non-mechanic can act on (distance / speed / weather /
what to watch on the gauge), what specifically goes wrong if they ignore it, and the realistic
dollar delta between acting now vs driving on it. Flag any case where the honest answer is
"depends" and say what it depends on. Cite sources. Structured markdown.

## Prompt 6 — Independent vs dealer vs warranty, per job (Stage 5A action layer)

For a consumer car app, I need a one-line "where should I take this?" recommendation anchored to
each specific job — not generic advice. Mainstream US vehicles, 2015-2022, out of bumper-to-bumper
but possibly still in powertrain warranty.

Jobs: front brake pads/rotors · stuck brake caliper · ignition misfire (coil/plug) · catalytic
converter · alternator/battery · ABS wheel-speed sensor · ABS module · external coolant leak
(hose/radiator/water pump) · head gasket · fuel line/EVAP leak · oil pressure sensor vs oil pump.

For each, tell me:
1. Independent shop, dealer, or either — and why, in one plain sentence.
2. Whether it's commonly covered by a US powertrain warranty (typ. 5yr/60k), and whether that
   changes the answer.
3. Whether it's a common recall/TSB item (fuel systems especially) — recalls are free at a dealer.
4. Any job where a dealer genuinely has a diagnostic tool or model-specific knowledge an
   independent usually lacks.
5. The diagnostic test that should happen BEFORE anyone quotes the expensive version of this job
   (e.g. pressure test before head gasket; mechanical gauge before oil pump; code+sensor test
   before ABS module).

No referral/affiliate framing — this is on the owner's side of the counter. Cite sources.
Structured markdown.

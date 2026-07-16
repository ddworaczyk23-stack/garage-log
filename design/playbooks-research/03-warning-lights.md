# Dashboard warning lights — Perplexity research (raw, Prompt 3)

Status: usable for domain/playbooks.ts. One band ambiguity to resolve at code time, one
citation to discard.

## Question flow

1. **Which light is on?** Check Engine/MIL (solid) · Check Engine/MIL (flashing) · Tire
   Pressure/TPMS · Battery/Charging (battery icon or GEN/ALT) · Oil Pressure (oil can) · ABS ·
   Traction Control/ESC.
2. **Solid or flashing?** Solid steady · Flashing/rapidly blinking.
3. **Any additional symptoms right now?** (multi-select) Reduced power/limp mode · rough idle/
   misfire/shaking · smell (gas/sulfur/burning) or smoke · strange sounds · poor handling/pulling/
   brake issues · tire feels low/visible flat · car stalls or won't restart · no other symptom.
4. **If TPMS:** does it feel different (vibration/pulling) or is a PSI number shown? Yes/No.
5. **If battery/charging:** accessories dimming + engine stalls + light stays on, OR flickered
   once then went away.

## Decision tree

### 1. Check Engine — FLASHING
Rule: flashing = **always fix-now** (active misfire risk, can overheat/damage the catalytic
converter — regardless of any other answer).
Likely causes: active ignition misfire — coil/plug/fuel (60%), fuel delivery issue causing
misfire (15%), engine mechanical/timing or sensor failure causing misfire (15%), exhaust
leak/pre-cat failure (10%).
Cost — Diagnosis: DIY reader $20–200 or free at parts stores, pro scan $60–150. Fixes: plugs
$10–40 ea DIY, coil $25–180 ea DIY, injector/fuel pump $150–1,200, catalytic converter damage
$800–3,000+. Indie: $150–1,200 typical for ignition/fuel. Dealer: 25–40% more.
Escalate (already fix-now, these confirm severity): misfire/shaking/loss of power, rotten-egg
smell (catalyst), smoke, stalling.
Shop-brief: "Flashing MIL while driving with [symptom]. Please read OBD-II codes, report
pending misfire codes (P0300-P030X) or fuel/ignition codes, check coils/plugs/fuel trims before
any parts replacement."

### 2. Check Engine — SOLID
Likely causes: loose/faulty gas cap or EVAP leak (25%), O2 sensor/catalytic efficiency/emissions
code (25%), MAF/MAP/intake sensor or small vacuum leak (20%), intermittent misfire/minor fuel-
ignition issue (15%), transmission or other system code (15%).
Urgency: **book-soon** if no drivability symptoms → **fix-now** if loss of power, misfire, smoke,
or smells.
Cost — Diagnosis: pro $60–150, DIY reader $20–200. Fixes: gas cap $10–40 DIY, O2 sensor
$50–250 parts, MAF $80–300, vacuum leak repair $50–250, catalytic converter $800–3,000+. Indie
labor adds $80–200+/job. Dealer higher.
Escalate: new rough idle, loss of power, increased fuel consumption, engine noises.
Shop-brief: "Solid CEL, no flashing. Please pull pending and stored codes, report freeze-frame
data and readiness status, confirm EVAP/gas cap vs O2/MAF vs misfire before recommending parts."

### 3. Tire Pressure / TPMS
Likely causes: low pressure — leak or temp drop (60%), faulty/dead TPMS sensor battery (20%),
slow puncture/valve stem issue (15%), TPMS receiver/module fault (5%).
Urgency: **fix-now** if pressure significantly low or car pulls/vibrates → **book-soon** if light
on but feel normal and pressure within 4-5 psi of spec.
Cost — DIY: air fill $0–5, plug kit $10–40, sensor parts $40–150 (OE $80–200 ea). Indie: repair
$20–45 + $10–25/tire service; sensor + relearn $80–200/sensor. Dealer: $100–300/sensor incl.
programming.
Escalate: visible flat, vibration, pulling, rapid pressure loss — don't drive far.
Shop-brief: "TPMS light on; please report actual PSI per wheel, check for slow leak/repairable
puncture, confirm part number and perform sensor relearn if replacing before closing ticket."

### 4. Battery / Charging (battery icon / GEN / ALT)
Likely causes: failing alternator/voltage regulator (55%), weak/dead battery with parasitic
draw (20%), loose/failed belt or wiring/ground issue (15%), fusible link/charging circuit fuse
(10%).
Urgency: **fix-now** if accessories dim or stall possible while driving → **book-soon** if it
flickered once and went away.
Cost — DIY: battery $60–200, alternator (aftermarket) $120–400 parts. Indie: alternator
installed $200–600, battery test/replace $80–300. Dealer: $300–1,000+.
Escalate: dim/flickering lights, accessories failing, stalling, smoke/odor from under hood.
Shop-brief: "Battery/charging light on; please test battery and charging system (voltage at
idle and under load), inspect alternator belt and connections, report results before replacing
components."

### 5. Oil Pressure (oil can)
Likely causes: critically low oil level (40%), faulty oil pressure sensor/sender (20%), oil pump
failure or pickup tube blockage (25%), severe engine wear/bearings (15%).
Urgency: **fix-now**, always — stop safely, check oil level, don't keep driving if light persists
after topping up.
Cost — Top up DIY $10–40. Sensor: DIY parts $20–120, shop $80–250 installed. Oil pump/internal
engine repair: not DIY-practical, indie $500–3,500+ depending on engine/extent, dealer higher;
catastrophic failure $3,000–10,000+.
Escalate: knocking, metal smell, smoke, gauge to zero, overheating → tow, don't drive.
Shop-brief: "Oil pressure warning on; checked dipstick: [level]. Please measure pressure with a
mechanical gauge, inspect for leaks, test/replace sender if needed, report oil pump/engine
internal condition before authorizing major work."

### 6. ABS light (traction control often linked)
Likely causes: faulty wheel speed sensor or dirty tone ring (45%), wiring connector/corrosion at
sensor harness (20%), ABS module fault/pump failure (15%), low brake fluid/hydraulic issue rarely
alone (10%), faulty yaw/steering sensor for ESC (10%).
Urgency: **book-soon** if normal braking unaffected (conventional brakes still work) →
**fix-now** if brake warning light also on, reduced braking/pedal change, or ESC light plus harsh
drivability problems.
Cost — Diagnosis: $40–120 ABS scan. Sensor: DIY parts $25–150, shop $80–300/sensor incl.
relearn. Module: $300–1,400+ parts, labor extra.
Escalate: brake warning light also on, soft pedal, change in braking feel.
Shop-brief: "ABS light on (and [TC light on/off]). Please pull ABS/TC codes, inspect wheel
speed sensors and tone rings at each wheel, check module wiring, report code+test results before
recommending module replacement."

### 7. Traction Control / ESC (alone, no ABS light)
Likely causes: wheel speed sensor fault/contamination (50%), steering angle/yaw sensor
calibration needed (20%), ABS module/TC component fault (15%), low battery/charging causing
system fault (15%).
Urgency: **book-soon** — safe to drive without full stability assist → **fix-now** if ABS light
also appears, loss of braking assist, or unsafe conditions (icy/wet) make stability assist matter
more.
Cost — Sensor/recalibration $50–300; module work $300–1,400+.
Escalate: ABS light also on, loss of braking assist, ESC engaging constantly.
Shop-brief: "TC/ESC lamp on, no drivability change; please read ABS/ESC codes, check wheel speed
sensors and steering angle sensor calibration, advise if sensor replacement or re-calibration is
needed."

## General escalation triggers (any light → fix-now)
Loss of drive · severe vibration · smoke or burning smell · engine knocks · sudden fluid leaks ·
change in braking/steering control.

## Cost summary (2025-2026 US)
| Light | Diagnosis | DIY parts | Independent | Dealer |
|---|---|---|---|---|
| Flashing CEL | $60–150 scan | plugs/coils $10–180 ea | $150–1,200 | $250–1,800+ |
| Solid CEL | $60–150 scan | gas cap $10, O2 $50–250 | $100–600 | $200–1,200+ |
| TPMS | $20–90 | sensor $40–200 ea | $80–250/sensor incl. relearn | $100–300/sensor |
| Battery/Charging | $40–120 | battery $60–200, alt $120–400 | $80–600 | $300–1,000+ |
| Oil Pressure | $60–150 | sensor $20–120 | $150–800 (sensor/pump access); $500–3,500+ engine | $800–5,000+ |
| ABS/TC | $40–150 | wheel speed sensor $25–150 | $80–400/sensor; module $300–1,400+ | $500–2,000+ |

---
**Caveats (from review, not the source):**
1. Branch 7 gave "can-coast / book-soon" as one combined band. Resolve to **book-soon** at code
   time — traction-control-alone is real enough to want a shop visit, not indefinite coasting.
2. One citation (`new.risingsunartscentre.org`, an arts-centre domain repurposed for repair-cost
   content) is a squatted/content-mill domain, not a real source — discard it specifically; the
   ABS/TC numbers it's attached to roughly match the rest of the table so no need to redo the
   research, just don't treat that citation as authoritative.
3. Same pattern as prompts 1-2: likelihood percentages are heuristics from consumer/shop blogs,
   not NHTSA data — soften to "most often" in UI copy.
4. The flashing-vs-solid CEL distinction (the one thing I explicitly flagged as must-have) came
   through correctly and prominently — good.

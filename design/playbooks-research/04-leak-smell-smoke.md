# Leak / smell / smoke — Perplexity research (raw, Prompt 4)

Status: usable for domain/playbooks.ts. One citation to discard.

## Question flow

1. **What do you see?** Fluid under the car · Smoke or vapor · Both.
2. **Fluid color?** Clear · Green · Red/pink · Brown · Black · Milky/tan · Not sure.
3. **Where pooling?** Front · Center · Rear · Left · Right · Under engine bay · Under
   transmission · Under fuel tank · Not sure.
4. **Any smell?** Sweet · Burning rubber · Burning oil · Gas/fuel · None · Not sure.
5. **Smoke/vapor color + source?** White vapor from tailpipe · White smoke from engine bay ·
   Blue smoke · Black smoke · Steam near wheel/wheel well · Not sure.

## Decision tree

### A. Green fluid, sweet smell, front/center → coolant leak
Likely causes: radiator/hose/water pump/thermostat housing/reservoir leak (70%), heater hose or
heater-core circuit (20%), radiator cap/overflow (10%).
Urgency: **fix-now** if overheating, growing puddle, or any white smoke/steam → **book-soon**
only if tiny seep, no temp rise, no smell.
Cost — DIY: $10–150 (hose/cap/clamp/reservoir), $50–250 w/ fittings · Indie: $150–900 external,
$1,500+ internal/head-gasket · Dealer: $250–1,200+ external, $2,000–8,000+ internal.
Escalate: temp gauge rising, heater goes cold, low-coolant warning, white smoke, smell
strengthening fast.
Shop-brief: "Green fluid with sweet smell under front/center; please pressure-test the cooling
system, inspect radiator, hoses, water pump, reservoir, thermostat housing, confirm external vs
internal before authorizing parts."

### B. Red/pink fluid → transmission or power-steering
Likely causes: transmission fluid leak — pan gasket/cooler line/seal/drain plug (65%), power-
steering fluid on older hydraulic systems (20%), dyed coolant misread as red/pink (15%).
Urgency: **fix-now** if slipping, delayed engagement, or large/active puddle → **book-soon** if
small seep and shifts normally.
Cost — DIY: $10–150 (gasket/seal/clamp), $20–60 (top-off) · Indie: $150–900 common, $800–1,500+
pump/seal/severe · Dealer: $250–1,500+ seals/lines, $2,000+ major work.
Escalate: delayed shifting, slipping, whining in gear, burnt smell, fluid turning dark
brown/black.
Shop-brief: "Red/pink fluid under the car, likely transmission-related; please identify ATF vs
power-steering vs other, inspect pan gasket/cooler lines/seals, report fluid condition and any
shift slip."

### C. Brown/black fluid, burning-oil smell → engine oil leak
Likely causes: valve cover/oil pan/filter housing/cooler line leak (75%), oil dripping onto
exhaust and burning off (20%), drivetrain fluid/grease contamination (5%).
Urgency: **fix-now** if oil pressure warning, visible smoke, or heavy leak → **book-soon** if
slow leak, no low-oil warning, no smoke.
Cost — DIY: $10–120 (gasket/seal), $30–80 (top-off) · Indie: $150–800 common, $300–1,200 if hard
access · Dealer: $250–1,500+.
Escalate: burning smell strengthens after a drive, visible wisps under hood, oil level drops
fast, oil pressure light.
Shop-brief: "Brown/black oil leak with burning-oil smell, possible smoke; please trace to
source, check valve cover, oil filter housing, oil pan, oil-on-exhaust contact before quoting."

### D. Clear fluid, no smell → likely harmless
Likely causes: A/C condensation (55%), rain/wash/road splash (35%), washer fluid/spill (10%).
Urgency: **all-clear** if just clear water, no other symptoms.
Cost: $0 unless another symptom needs diagnosis.
Escalate: clear fluid + overheating/sweet smell/smoke → reclassify as coolant concern (branch A).
Shop-brief: "Clear fluid puddle, no smell, likely condensation; inspect only if paired with
another symptom (overheating, coolant loss)."

### E. Milky/tan fluid, sweet smell, overheating → head-gasket concern
Likely causes: coolant/oil mixing — internal leak/head-gasket failure (70%), severe cooling-
system contamination from a failed component (20%), misread stain/road grime (10%).
Urgency: **fix-now**, always.
Cost — DIY: not realistic for internal issue; minor coolant-side parts $10–150 · Indie:
$1,500–8,000+ · Dealer: $2,500–10,000+.
Escalate: overheating, white smoke, misfire, coolant loss, bubbling reservoir.
Shop-brief: "Milky/tan fluid and sweet smell with possible overheating; please check for
coolant-in-oil or oil-in-coolant contamination, pressure-test, report whether a head-gasket
test or teardown is warranted."

### F. Gas/fuel smell, visible leak → fuel system
Likely causes: fuel line/rail/injector/connector leak (45%), tank/pump seal/filler-neck leak
(35%), EVAP hose/canister/cap vapor leak (20%).
Urgency: **fix-now**, always — fire hazard, even vapor-only leaks.
Cost — DIY: $10–150 (cap/hose/connector) · Indie: $150–1,000 · Dealer: $250–1,500+, tank/module
work higher.
Escalate: stronger smell after refueling, visible dripping, hard starting, check-engine light,
any smoke.
Shop-brief: "Fuel smell with possible leak location [front/center/rear]; please pressure-test
the fuel system, inspect lines, tank, pump seal, filler neck, EVAP hoses before authorizing
repair."

### G. White smoke/steam, sweet smell → coolant burning
Likely causes: coolant vapor from overheating/external leak hitting hot parts (50%), internal
coolant burn — head/intake gasket or crack (35%), brief cold-start condensation that clears fast
(15%).
Urgency: **fix-now** if persistent, sweet-smelling, or from engine bay/tailpipe with coolant
loss — app should treat any persistent white smoke as fix-now by default.
Cost — DIY: $10–150 simple external fix, not practical internal · Indie: $150–900 external,
$1,500–8,000+ head-gasket/internal · Dealer: $250–1,200+ external, $2,500–10,000+ internal.
Escalate: temp gauge rises, heater blows cold, coolant warning, misfire, smoke gets denser.
Shop-brief: "Persistent white smoke/steam with sweet smell; please determine external coolant-
on-hot-parts vs internal coolant burn, pressure test plus combustion-gas/head-gasket checks if
needed."

### H. Blue smoke, oil smell → oil burning
Likely causes: oil burning via valve seals/rings/turbo seals (60%), oil leaking onto exhaust and
burning off (25%), PCV-related oil ingestion or overfill (15%).
Urgency: **book-soon** if light/intermittent → **fix-now** if heavy smoke, oil level dropping
fast, or drivability changes.
Cost — DIY: $10–80 (PCV/vent/accessible gasket) · Indie: $150–1,500 · Dealer: $250–2,500+.
Escalate: smoke increases on acceleration, oil level drops, misfire appears.
Shop-brief: "Blue smoke / burning oil smell; please determine oil entering exhaust vs
combustion chamber vs external leak onto hot parts, report PCV/valve cover/turbo seal/ring wear
findings."

### I. Black smoke, gas smell → rich mixture
Likely causes: rich fuel mixture/engine management fault (55%), fuel pressure/injector issue
(20%), restricted air intake or sensor fault (15%), brief cold-start puff on some vehicles (10%).
Urgency: **fix-now** if heavy smoke, strong fuel smell, or rough running → **book-soon** only if
tiny cold-start puff that clears immediately.
Cost — DIY: $10–300 (filter/sensor/basic ignition) · Indie: $150–900 · Dealer: $250–1,500+.
Escalate: rough running, flashing check-engine light, fuel smell, loss of power.
Shop-brief: "Black smoke with fuel smell; please scan for codes, check fuel trims, injectors,
air intake, ignition before replacing emissions parts."

## Always-fix-now overrides (any branch)
Any fuel smell with dripping or smoke · any white smoke/steam with sweet smell or overheating ·
any smoke from the engine bay that's growing or smells like oil/fuel · milky fluid plus
overheating/coolant loss · a large active leak of any fluid clearly growing/puddling rapidly.

## General escalation triggers
Temperature gauge climbs/overheating warning · smell strengthens after a short drive · smoke
becomes visible from engine bay or tailpipe · sudden change in shifting/braking/steering/power ·
puddle grows fast enough to form a fresh spot after a short stop.

## Cost summary (2025-2026 US)
| Scenario | DIY | Independent | Dealer |
|---|---|---|---|
| Simple coolant hose/cap leak | $10–150 | $150–500 | $250–800+ |
| External coolant leak + pressure test | $50–250 | $150–900 | $250–1,200+ |
| Head gasket/internal coolant leak | not practical | $1,500–8,000+ | $2,500–10,000+ |
| Transmission leak | $10–150 | $150–900 | $250–1,500+ |
| Oil leak/gasket | $10–120 | $150–800 | $250–1,500+ |
| Fuel leak | $10–150 | $150–1,000 | $250–1,500+ |

---
**Caveats (from review, not the source):**
1. `visualfoodie.com` (a food blog, cited for black-smoke cost data) is a repurposed/content-mill
   domain — same pattern as the arts-centre citation in prompt 3. Discard as a source; the
   numbers roughly match the rest of the table so no need to re-research.
2. All bands used this time are within vocabulary (fix-now/book-soon/all-clear) — no cleanup
   needed, unlike prompts 2 and 3.
3. Branch D (clear fluid) is the first "genuine all-clear" case across all 4 playbooks — good,
   confirms the tree isn't defaulting to alarm for harmless cases.
4. Same standing caveat: percentages are heuristic, not NHTSA-measured — soften to "most often"
   in UI copy.

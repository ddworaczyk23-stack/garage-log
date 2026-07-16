# Brake noise — Perplexity research (raw, Prompt 1)

Status: usable for domain/playbooks.ts. See caveat at bottom.

Below is a practical diagnostic playbook for common US vehicles (F-150, Rogue, Camry, Civic,
CR-V and similar), optimized for common brake-noise scenarios using 2025–2026 cost benchmarks
and symptom-based urgency triggers.

## Question flow

1. **What kind of sound is it?** Squeal/squeak · Grind/scrape · Click/clunk/knock ·
   Hum/hiss/rubbing · No sound, but vibration or pulsation.
2. **When does it happen?** Only first few stops of the day · Only light braking · Only hard
   braking · Every brake application · Only at low speed · Only after rain/washing/overnight.
3. **What else do you feel?** Nothing else · Pedal pulses · Steering wheel shakes · Car pulls
   left or right · Pedal feels soft/spongy/longer travel · Stopping distance seems longer.
4. **Is the noise from one wheel or both?** Front left/right · Rear · Both sides · Not sure.
5. **Did anything change recently?** New pads/rotors recently installed · No recent brake work ·
   Brake warning light on · Visible dust/smoke/smell.

## Decision tree

### A. Squeal only
Likely causes: pad wear indicator (60%), pad glazing/dust/light rust (25%), missing anti-rattle
hardware (10%), caliper drag beginning (5%).
Urgency: **book-soon** if most stops; **can-coast** if only first stop or after rain and then
gone; escalate to **fix-now** if it becomes grinding, pulls, or lengthens stopping distance.
Cost per axle — DIY: $40–180 (+$80–250 if rotors added) · Indie: $150–300 (pads only), $300–600
(pads+rotors) · Dealer: $250–450 (pads only), $450–850 (pads+rotors).
Shop-brief: "Light-to-moderate brake squeal, mostly on light braking. Please inspect pad
thickness, rotor condition, pad hardware/shims, and caliper slide pins; report whether this is
normal wear, glazing, or uneven wear."

### B. Grind or scrape
Likely causes: pads fully worn through (70%), rotor damage from metal-to-metal contact (20%),
stuck caliper/seized slide pins (10%).
Urgency: **fix-now**. Drive only if necessary, to the nearest safe repair location; tow if
stopping distance has changed or the car pulls.
Cost per axle — DIY: $100–300 · Indie: $300–700 · Dealer: $500–1,000+.
Shop-brief: "Metallic grinding during braking, likely pad wear-through. Please measure pad
thickness, inspect rotor scoring/minimum thickness, and check for seized caliper or slide pins
before quoting only pads."

### C. Clunk, knock, or click
Likely causes: loose/missing pad hardware or anti-rattle clips (45%), caliper/bracket movement
(30%), worn suspension play showing up under braking (15%), pad contact/install issue (10%).
Urgency: **book-soon** if braking still feels normal; **fix-now** if it also pulls, pedal feels
odd, or accompanied by vibration.
Cost per axle — DIY: $20–120 (hardware only), $100–350 (caliper/bracket) · Indie: $120–400 ·
Dealer: $200–700+.
Shop-brief: "Single clunk/click tied to brake application. Please check pad hardware, caliper
bracket torque, slide pins, rotor-to-pad fit, and whether the sound is actually suspension under
braking."

### D. Pulsation or shake
Likely causes: rotor thickness variation/runout (65%), pad deposits/uneven transfer layer (20%),
front-end or hub issue amplifying the symptom (15%).
Urgency: **book-soon** if braking still predictable; **fix-now** if the pulse is strong, the car
wanders, or stopping distance is longer.
Cost per axle — DIY: $80–250 · Indie: $300–650 · Dealer: $450–900+.
Shop-brief: "Brake pedal pulse and/or steering wheel shake under braking. Please measure rotor
runout and thickness variation, inspect hub face cleanliness, and confirm whether rotors can be
machined or need replacement."

### E. Pulling to one side
Likely causes: sticking caliper/slide pins (50%), brake hose restriction/fluid issue (20%),
uneven pad wear/contaminated pad (20%), tire/suspension contribution (10%).
Urgency: **fix-now** — don't assume "just alignment"; braking pull is a brake-system problem
until proven otherwise.
Cost per axle — DIY: $60–250 (pads/hardware), $120–400 (caliper) · Indie: $200–600 ·
Dealer: $350–900+.
Shop-brief: "Vehicle pulls under braking, side not always obvious. Please compare left/right
brake temperatures, inspect caliper slide pins and piston operation, and check hoses for
restriction or collapse."

## Escalation triggers (override any branch → fix-now)
Pedal pulses strongly or steering wheel shakes · vehicle pulls to one side · stopping distance
longer than normal · pedal feels soft/spongy/sinks further · grinding/metal-on-metal appears ·
burning smell, smoke, or brake warning light appears · one wheel much hotter than others after a
short drive.

## Cost bands (2025-2026, per axle unless noted)
| Scope | DIY | Independent | Dealer |
|---|---|---|---|
| Pads only | $40–180 | $150–320 | $250–450 |
| Pads + rotors | $80–300 | $300–650 | $450–900 |
| Caliper, each | $60–180 | $200–500 | $300–700+ |
| Full brake service | $100–350 | $300–700 | $500–1,000+ |

---
**Caveat (from review, not the source):** citations are shop-pricing/consumer-advice blogs
(JiffyLube, Massey Automotive, Delphi, Motor1, etc.), not NHTSA complaint data as originally
requested — free-tier search didn't reach that. The likelihood percentages (60%/70%/etc.) are
therefore industry-consensus estimates, not measured frequencies. Fine for ranking causes
(that's the product's actual need) but when this ships into the app UI, soften language to
"most often" / "less commonly" rather than displaying the percentages as precise statistics.
Cost ranges look internally consistent and sane — no further check needed.

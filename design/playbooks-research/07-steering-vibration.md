# Steering feels wrong / vibration while driving — new playbook

Status: usable for domain/playbooks.ts. Deliberately scoped away from braking
(the existing brake-noise playbook already owns "pulsing pedal when
braking") — this one covers steering-wheel feel independent of the brake
pedal.

## Question flow

1. **When do you feel it?** Mostly at highway speed · When turning the wheel
   · All the time, even parking-lot speeds.
2. **What does it feel like?** A vibration or shimmy in the wheel · The car
   pulls or wanders to one side · The steering feels loose, with play before
   it responds · The steering feels heavy or hard to turn · A clunk or
   grinding when turning.

## Decision tree

### A. Vibration at highway speed
Likely causes: unbalanced tire/wheel (most common per Auto Barn and Park(ing)
Day) · a bent wheel · out-of-round tire. Auto Barn: "steering wheel vibration
is most commonly caused by unbalanced tires."
Urgency: **book-soon**.
Cost: wheel balance $20–80 indie · bent wheel repair/replace $100–400.

### B. Vibration when turning (not at steady highway speed)
Likely causes: worn outer tie rod end (cartreatments.com: resolves the issue
in roughly 7 of 10 cases where balance isn't the cause) · CV joint wear
overlapping with a clicking sound (see the other-noise playbook's cv-joint
outcome for the click-only version of this).
Urgency: **book-soon**.
Cost: tie rod end $150–350 per end indie (cartreatments.com, oards.com);
$100-300 parts-only DIY range across sources.

### C. Steering feels loose / play before it responds
Likely causes: worn tie rod ends or ball joints (gsplatinamerica.com: worn
ball joints "introduce excessive play... causing instability and vibration,
especially during turns") · a worn steering rack. This is a genuine safety
concern — play in steering means slower, less precise response exactly when
you need it.
Urgency: **fix-now**, verdict **short-trip-only** — driveable at low speed to
a shop, but the play tends to worsen, and highway speed amplifies the risk.
Cost: ball joint $200–600 per joint indie (vehicleruns.com, gsplatinamerica.com)
· tie rod end $150–350 indie · steering rack (less common) $500–1,500 indie.

### D. Steering feels heavy / hard to turn
Likely causes: low power-steering fluid or a leak · a failing power-steering
pump · (electric power steering) a fault in the EPS motor/assist system.
Sudden heaviness usually means fluid/belt; gradual heaviness over weeks can
be pump wear.
Urgency: **fix-now**, verdict **short-trip-only** — still steerable, just
harder, and it's safer to finish the trip locally than push on.
Cost: fluid top-up/leak fix $20–150 · power-steering pump $150–500 indie ·
EPS module diagnosis/repair varies widely, $200–1,200+.

### E. Clunk or grinding when turning
Likely causes: worn CV joint or axle (constant turning-only clunk) · a
strut mount or suspension bushing · rarely a steering rack issue. Overlaps
with the other-noise playbook's driveline-clunk outcome; this entry exists
so "it's specifically the steering, when I turn" reaches a verdict without
first routing through the noise-type chooser.
Urgency: **book-soon**.
Cost: CV joint/axle $250–700 indie · strut mount $150–400 indie.

## Escalation triggers
Loose/play steering gets noticeably worse over a single drive · a clunk
turns to a bang or the wheel jerks · steering suddenly goes very heavy (belt
or pump failure) — any of these push it to fix-now / tow if not already
there.

Sources: [Steering Wheel Vibration — Auto Barn](https://www.autobarn.net/symptoms/steering-wheel-vibration),
[Tie Rod End Symptoms & Cost — cartreatments.com](https://cartreatments.com/symptoms-of-a-bad-tie-rod-end-and-replacement-cost/),
[Ball Joint vs Tie Rod — gsplatinamerica.com](https://www.gsplatinamerica.com/post/bad-ball-joint-vs-bad-tie-rod-symptoms-risks-costs),
[Ball Joint Replacement Cost — vehicleruns.com](https://vehicleruns.com/maintenance-repair/ball-joint/replacement-cost/),
[What causes steering wheel vibration — Park(ing) Day](https://parkingday.org/what-causes-steering-wheel-vibration/)

---
**Caveat:** consumer-advice / shop-marketing sources, same tier as the
existing playbook research. No percentages carried into the app copy beyond
the one qualitative "roughly 7 of 10" note, softened to "most often" in the
outcome text.

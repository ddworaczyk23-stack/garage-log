# Car won't start — new playbook

Status: usable for domain/playbooks.ts.

## Question flow

1. **What happens when you turn the key / press start?** Nothing at all — no
   lights, no sound · A click or rapid clicking, engine doesn't turn over ·
   Engine cranks (turns over) but doesn't catch · It starts, then dies right
   away.
2. **(if clicking) One solid click, or rapid clicking?** — the two point at
   different parts. Sources (Firestone, Les Schwab, Cars.com, CarParts.com)
   consistently split it this way: rapid/repeated clicking = battery too weak
   to supply full cranking current; one solid click with no crank = usually
   the starter solenoid or starter motor itself (the battery has enough for
   the solenoid to engage, just not enough — or the motor can't — to turn the
   engine).

## Decision tree

### A. Nothing at all (no lights, no sound) / rapid clicking
Likely causes: dead or badly discharged battery (most common by far) ·
corroded or loose battery terminals · a bad ground connection. Consistent
across every source checked.
Urgency: **fix-now**, verdict **tow**-leaning but jump-startable in practice —
framed as "try a jump, then get the charging system tested" rather than a
flat tow, since a jump start is the normal, safe first move here (unlike the
oil-pressure or overheating lights, where continuing to run the engine causes
damage).
Cost: battery alone $100–300 installed indie, $60–200 diy; if it turns out to
be the alternator (battery keeps dying), $200–600 indie / $300–1,000 dealer.

### B. One solid click, no crank
Likely causes: faulty starter solenoid or starter motor (most common) ·
sometimes still a weak battery / bad connection (a solenoid needs less power
than a full crank, so a battery that's borderline can trigger this too).
Urgency: **fix-now**, verdict **tow** — a car that won't crank isn't
driveable regardless of cause, and a bad starter can leave you stranded
somewhere worse.
Cost: starter motor $150–600 part, $300–800 indie installed, $400–1,000+
dealer; starter solenoid alone (if replaced separately) $400–600 indie.

### C. Cranks but doesn't catch
Likely causes: no spark (ignition coil/plugs) · no fuel delivery (pump,
filter, or a failed relay) · in rarer cases a security/immobilizer fault
refusing to let the engine run. Cranking normally rules out the battery and
starter, which narrows it to spark or fuel.
Urgency: **fix-now**, verdict **tow** — without knowing which of spark/fuel/
security it is, driving it isn't an option and diagnosis needs a shop anyway.
Cost: wide range since the cause varies — ignition coil/plugs $150–1,200
indie (reuses the spark-plugs cost band from the flashing-CEL research);
fuel pump $400–1,000 indie, $600–1,400 dealer; security system diagnosis
alone $80–200.

### D. Starts, then dies right away
Likely causes: idle air control / idle circuit issue · vacuum leak · fuel
pump losing prime or delivery pressure · a failing sensor confusing the idle.
Not a driving-in-progress safety issue the way the others are, but the car
still can't be relied on to stay running.
Urgency: **fix-now** (the car is currently unusable), driveOrTow
**short-trip-only** if it manages to idle for more than a few seconds after
restart — otherwise tow.
Cost: Indie $150–600 typical, up to $900 if it's a fuel pump; dealer
$250–1,000.

## Escalation triggers
A jump gets it running but it dies again soon after · a burning smell during
or after cranking · repeated cranking with a fuel smell (flooding / possible
fuel leak — treat as the leak-smell playbook's fuel outcome instead).

Sources: [Car Won't Start & Clicking Noise — Firestone](https://www.firestonecompleteautocare.com/blog/maintenance/car-wont-start-clicking-noise/),
[Car Clicking When Starting — Les Schwab](https://www.lesschwab.com/article/batteries/car-clicking-when-trying-to-start.html),
[Car Clicks But Won't Start — Cars.com](https://www.cars.com/articles/car-clicks-when-trying-to-start-5-common-causes-422045/),
[Starter Solenoid Clicks — CarParts.com](https://www.carparts.com/blog/starter-solenoid-clicks-but-starter-does-not-crank-engine-2/)

---
**Caveat:** consumer-advice / shop-marketing sources, same tier as the
existing playbook research. Cost ranges are consistent across sources; no
percentages carried into the app copy.

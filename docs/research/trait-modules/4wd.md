# Trait module: 4WD (with transfer case)

Source: Perplexity, 2026-10-15. Raw research, not yet in code.

## Decisions (Claude review)

- Adds `transfer-case-fluid`: factory 50k / 60 mo, consensus 50k / 60 mo.
- Adds `differential-fluid`, label "Front & rear axle fluid": 50k / 60 mo.
  One item for both axles (Coast has one category; F-150 does the same).
- F-150 template stays as is (60k each, curated). Close enough; not a bug.
- Note: "Sooner if you tow, plow, go off-road, or drive through deep water.
  Milky gear oil means water got in: service it now."
- Drop: extra inspection item, limited-slip flags, extra record fields.

## Exceptions found

- Toyota Land Cruiser (2025): transfer case + front/rear diffs are separate
  items; inspect or replace at listed intervals.
- Lexus TX: 30k / 36 mo (even though it is sold as AWD).

## Key sources

- https://assets.sia.toyota.com/publications/en/omms-s/T-MMS-25LandCruiser/pdf/T-MMS-25LandCruiser.pdf
- https://assets.sia.toyota.com/publications/en/omms-s/L-MMS-24TX350/pdf/L-MMS-24TX350.pdf

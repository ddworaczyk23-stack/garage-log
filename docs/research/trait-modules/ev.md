# Trait module: battery EV

Source: Perplexity, 2026-10-15. Raw research, not yet in code.

## Decisions (Claude review)

- REMOVES from the generic list: oil-change, engine-air-filter, spark-plugs,
  timing-belt, fuel-filter, transmission-fluid, serpentine-belt.
- KEEPS: tire rotation (generic 5k; EVs are heavy and wear tires faster),
  brake inspection, brake fluid (36 mo), cabin air filter, wipers, alignment.
- `battery-check`: relabel "12V battery check". Every 12 mo. The big
  battery has no routine replacement.
- `coolant`: battery/motor cooling. 120k / 60 mo (conservative pick;
  bZ4X 120k first, GM OPTIQ 150k / 5 yr, Ford ~200k). Note: "Dealer job.
  Never open the high-voltage cooling system yourself."
- `brake-inspection` note: "Regen braking means the pads wear slowly, but
  rotors rust and calipers stick. Check yearly."
- Drop: NEW "drive-unit fluid" category. No real interval exists; it is
  per-maker. Note only.
- Two-motor EVs do NOT get the AWD or 4WD block.

## Exceptions found

- Toyota bZ4X: coolant 120k then every 50k; brake visual every 5k.
- Ford EVs: tire rotation 10k / 12 mo; check the 12V battery often;
  drive-unit fluid per model.

## Key sources

- https://assets.sia.toyota.com/publications/en/omms-s/T-MMS-25bZ4X/pdf/T-MMS-25bZ4X.pdf
- https://www.ford.com/support/how-tos/electric-vehicles/electric-vehicle-maintenance/electric-vehicle-care/

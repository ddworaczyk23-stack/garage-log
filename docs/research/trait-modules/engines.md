# Trait modules: engine (no turbo, turbo, diesel, hybrid)

Source: Perplexity, 2026-10-15. Raw research, not yet in code.
EV is in ev.md.

## No turbo (naturally aspirated gas)

- Adds NOTHING. The generic list is already this car. Marker only.

## Turbo gas

- Adds no new item. Generic oil consensus is already 5k / 6 mo (the
  turbo-safe number), so no override.
- Oil note addition: "Turbo: use the exact oil spec in your manual."
- Does NOT shorten spark plugs (see spark-plugs.md).
- Drop: turbo inspection item.

## Diesel

- REMOVES `spark-plugs` (diesels have none).
- Adds `fuel-filter`: factory 15k / 12 mo, consensus 15k / 12 mo.
  Note: "10k if you idle a lot, tow heavy, or drive in dust."
- `oil-change` override: factory 10k / 12 mo, consensus 7.5k / 6 mo.
  Note: "Use diesel-rated oil (the spec in your manual)."
- Drop: NEW water-separator and NEW emissions (DEF/DPF) categories. The
  dashboard warns for these; no fixed interval exists. One line in the
  fuel-filter note: "Drain the water separator when the light comes on."
- Drop: engine-hours tracking (work-truck feature, not worth it here).

## Hybrid (incl. plug-in)

- Keeps ALL engine items (oil, filters, plugs, coolant, brake fluid).
- Gets NO transmission block. Toyota/Ford-style eCVT is not a CVT; skip
  `cvt-fluid` and `transmission-fluid`.
- `battery-check`: relabel "12V battery check", every 12 mo.
- `brake-inspection` note: same as EV (pads last, rotors rust, check yearly).
- HV battery cooling filter (Toyota: check 5k, clean 20k): would need a NEW
  category. Skipped for now; one line in the 12V note instead:
  "Toyota hybrids: clean the battery cooling vent filter about every 20k."
  Revisit if a hybrid gets added to the garage.
- Drop: inverter coolant (150k first change; too far out to matter).

## Exceptions found

- Ford Power Stroke: fuel filter 15k normal; 10k / 6 mo / 400 hr severe.
- Ram Cummins: oil up to 15k on some engines.
- Toyota Sienna Hybrid: HV filter check 5k, clean 20k; inverter coolant
  150k / 180 mo first, then 50k / 60 mo.

## Key sources

- https://assets.sia.toyota.com/publications/en/omms-s/T-MMS-22SiennaHV/pdf/T-MMS-22SiennaHV.pdf
- https://www.toyota.com/content/dam/toyota/brochures/pdf/2024/T-MMS-24SequoiaHV.pdf
- https://wwwac.ownaem.ford.com/content/dam/global-owner/ford/us/en-us/images/category/power-stroke-diesel/engine/7_3L/infosheets/info-sheet-F250-F550-Maintenance-Flyer-v2_a11y.pdf
- https://www.ramtrucks.com/assets/pdf/brochures/MY15_Ram_Commercial_Catalog_eBrochure.pdf

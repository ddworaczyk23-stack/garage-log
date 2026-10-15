# Trait module: conventional automatic transmission

Source: Perplexity, 2026-10-15. Raw research, not yet in code.

## Decisions (Claude review)

- Applies only to normal (torque-converter) automatics. Not CVT, dual-clutch,
  manual, or hybrid eCVT. A car gets ONE transmission block.
- Keep: `transmission-fluid`. Factory shown as 60k / 72 mo (representative;
  real OEM range is 45k-150k or "severe use only"). Consensus 60k / 72 mo.
- Matches the F-150 template (consensus 60k; factory 150k "fill for life").
- Note text: "Preventive long-ownership interval. Many makers say
  'lifetime' or list it for severe use only. Use the fluid in your manual.
  45k if towing, heat, or lots of stop-and-go."
- Drop: the extra `multi-point-inspection` item.
- Drop: the extra service-record fields (fluid spec, capacity, filter, etc.).
  The existing notes/parts fields on a logged event cover this.

## Exceptions found

- Toyota/Lexus 2025 guides: 50k / 60 mo. Older Toyota: 60k/48 mo or 75k/60 mo.
- GM: often severe-service only. 2025 Envista: 45k severe.
- Ford: per-vehicle schedule. Ford Protect lists 150k. No Ford-wide number.
- "Lifetime" fluid is OEM wording, not proof it never needs service.

## Key sources

- https://assets.sia.toyota.com/publications/en/omms-s/T-MMS-25Tundra/pdf/T-MMS-25Tundra.pdf
- https://www.toyota.com/content/dam/toyota/brochures/pdf/2025/MY25_WMG_Crown_Signia.pdf
- https://experience.gm.com/ownercenter/content/dam/gmownercenter/gmna/dynamic/manuals/2016/Chevrolet/Trax/2016%20Chevrolet%20Trax.pdf
- https://fordprotect.ford.com/media/brochure/ford/64172_1503b_FP_PMP_OCT_2023.pdf
- https://www.toyota.com/car-tips/change-transmission-fluid/

# Trait modules: dual-clutch (DCT) and manual transmission

Source: Perplexity, 2026-10-15. Raw research, not yet in code.

## Dual-clutch (DCT / DSG / PDK)

- Adds `transmission-fluid`, label "Dual-clutch fluid (and filter)".
  Factory 40k / 48 mo, consensus 40k / 48 mo.
  Note: "Many dual-clutch boxes need fluid and a filter together. Some
  (VW 7-speed) go 80k. Use the exact fluid; no flush."
- Drop: NEW "DCT filter" category. Covered by the label and note.
- Drop: extra inspection item, wet/dry clutch tracking, extra fields.

## Manual

- Adds `transmission-fluid`, label "Manual gearbox oil".
  Factory 60k / 48 mo, consensus 60k / 48 mo.
  Note: "Use the exact gear oil in your manual. The wrong type can harm
  the shifting parts. On many FWD cars this oil also serves the front
  differential."
- Clutch fluid: no new item. Most hydraulic clutches share the brake fluid.
  Brake-fluid note addition for manual cars: "Also covers clutch fluid."
- Never a clutch replacement reminder (wear depends on driving).
- Drop: extra inspection item, extra fields.

## Exceptions found

- VW 6-speed DSG: fluid + filter 40k. VW Golf R 7-speed DSG: fluid 80k.
- Subaru manuals: gear oil 60k / 48 mo (2018, 2020); inspect only in
  2014/2016/2019. 2020 Subaru: brake + clutch fluid 30k / 24 mo.

## Key sources

- https://static.nhtsa.gov/odi/tsbs/2019/MC-10168646-0001.pdf
- https://contactus.subaru.com/knowledgebase/article/1002183/en-us
- https://contactus.subaru.com/knowledgebase/article/1001833/en-us

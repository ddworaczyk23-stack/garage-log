# Trait module: AWD

Source: Perplexity, 2026-10-15. Raw research, not yet in code.

## Decisions (Claude review)

- Adds ONE item: `differential-fluid`, label "Rear differential / AWD unit
  fluid". Factory 60k / 48 mo, consensus 60k / 48 mo.
  Note: "Many AWD cars have a rear differential and a transfer unit up front
  (PTU). Some use special fluid. Toyota/Lexus can be 30k. Check your manual."
- Does NOT add `transfer-case-fluid` (that is 4WD only).
- Drop: NEW "AWD coupling/PTU fluid" category. Covered by the note above.
- Drop: extra inspection item.
- Note tip worth keeping: keep all four tires the same size and similar wear.
- EV with two motors is NOT this block (EV block handles it).

## Exceptions found

- Lexus TX AWD (2024): rear diff + transfer case 30k / 36 mo.
- Subaru (2018, 2020): front + rear diff 60k / 48 mo (not BRZ).

## Key sources

- https://assets.sia.toyota.com/publications/en/omms-s/L-MMS-24TX350/pdf/L-MMS-24TX350.pdf
- https://contactus.subaru.com/knowledgebase/article/1001833/en-us
- https://contactus.subaru.com/knowledgebase/article/1002183/en-us

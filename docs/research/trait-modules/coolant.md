# Base item: coolant

Source: Perplexity, 2026-10-15. Raw research, not yet in code.
Not a trait block. Generic list has factory 100k / 120 mo,
consensus 60k / 60 mo (scheduleTemplates.ts).

## Decisions (Claude review)

- NO CHANGE to the numbers. Factory 100k/120 mo matches the research.
  Keep consensus 60k/60 mo: OEMs drop to ~50k/60 mo after the first change,
  and Coast can't tell a first change from a later one. For used cars with
  unknown history, the shorter number is the safe one.
- Skip "first vs later interval". That is a new engine feature, and it
  is not worth the cost.
- Skip multiple coolant circuits (intercooler, inverter, battery) and the
  extra inspection item.
- Note addition: "Use the coolant type in your manual. Don't go by color.
  Don't mix types."
- For the EV block: EVs still get a `coolant` item (battery/motor cooling),
  much longer: GM OPTIQ 150k / 60 mo, Ford EVs ~200k, Toyota bZ4X 120k first.

## Exceptions found

- Toyota/Lexus: 100k/120 mo first, then 50k/60 mo.
- Subaru: 137.5k / 11 yr first, then 75k / 6 yr.
- GM DEX-COOL: 150k / 5 yr. The wrong coolant can cut that to 30k / 2 yr.
- Older Toyota: 60k / 48 mo.

## Key sources

- https://www.toyota.com/content/dam/toyota/brochures/pdf/2025/MY25_WMG_Crown_Signia.pdf
- https://techinfo.subaru.com/stis/doc/warrantyBooklet/2024_war_and_maint_041723.pdf
- https://contentdelivery.ext.gm.com/bypass/gma-content-api/resources/sites/GMA/content/staging/MANUALS/9000/MA9450/en_US/2.0/25_CAD_OPTIQ_OM_en_US_U_18469671B_2025APR07_2P.pdf
- https://assets.sia.toyota.com/publications/en/omms-s/T-MMS-25bZ4X/pdf/T-MMS-25bZ4X.pdf

# Base item: brake fluid

Source: Perplexity, 2026-10-15. Raw research, not yet in code.
Not a trait block. Brake fluid is already in the generic list at 36 mo
(factory and consensus) in scheduleTemplates.ts.

## Decisions (Claude review)

- NO CHANGE needed. The research confirms 36 mo, time-based, no miles.
- Keep brake fluid for EVs and hybrids too (engine block must not remove it).
- Optional note addition: "Use the fluid type printed on the reservoir cap
  (DOT 3, DOT 4...). Do not mix types."
- Drop: the extra `brake-inspection` item and the extra record fields.

## Exceptions found

- Honda/Acura: every 3 years, separate from the Maintenance Minder.
- Subaru: 15k mi / 15 mo in high humidity or mountain areas.
- Toyota/Lexus: often inspection only. Do not call 36 mo a Toyota rule.

## Key sources

- https://owners.honda.com/utility/download?path=/static/pdfs/2023/Ridgeline/MY23_Ridgeline_Maintenance_Minder_System.pdf
- https://techinfo.subaru.com/stis/doc/warrantyBooklet/2024_war_and_maint_041723.pdf
- https://assets.sia.toyota.com/publications/en/omms-s/T-MMS-24Tundra/pdf/T-MMS-24Tundra.pdf

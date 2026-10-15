# Trait module: timing belt / timing chain

Source: Perplexity, 2026-10-15. Raw research, not yet in code.

## Decisions (Claude review)

- Belt and chain are two traits. A car has one or the other, never both.
- Belt: one `timing-belt` reminder. Factory 100k / 96 mo. Consensus 90k / 84 mo.
  Note says: water pump, tensioner and idlers are often done in the same job.
- Drop: the NEW "timing-belt service bundle" category. The bundle goes in the
  note. No new category.
- Chain: adds NO reminder. Drop the suggested condition-based inspection item.
  Coast's milestone checklists can mention chain noise if wanted.
- Belt vs chain can NOT come from the VIN. The same model and year can have
  either. So Coast asks the user: "Timing belt?" Yes / No / Not sure.
  Only "Yes" adds the reminder.
- Why it matters: `timing-belt` is a red safety category in verdict.ts. A guessed
  belt reminder could show a false red "fix now".
- Unknown history fits the existing "Unknown" pill (never-logged items).
- DECIDED (David, 2026-10-15): ask the user "Timing belt? Yes / No / Not sure".
  Only "Yes" adds the reminder. No engine table; do not re-research it.

## Exceptions found

- Toyota 2009 4Runner / Sequoia: 90k / 108 mo.
- Some older Toyota Avalon, Camry, Solara, Sienna: 90k.
- Honda/Acura: Maintenance Minder sub-item 4, with water-pump inspection.
  Older manuals: 60k for extreme heat/cold or frequent towing.
- Subaru: most modern NA engines use chains. WRX STI 2014-2016: 105k / 105 mo.
  WRX STI 2018-2020: 100k / 96 mo.

## Key sources

- https://assets.sia.toyota.com/publications/en/omms-s/T-MMS-094Runner/pdf/09%204Runner%20SMG%20127072.pdf
- https://owners.honda.com/utility/download?path=/static/pdfs/2023/Ridgeline/MY23_Ridgeline_Maintenance_Minder_System.pdf
- https://contactus.subaru.com/knowledgebase/article/1001835/en-us
- https://contactus.subaru.com/knowledgebase/article/1002183/en-us
- https://assets.sia.toyota.com/publications/en/omms-s/MSTOY02-MS0003/pdf/MSTOY02-MS0003.pdf

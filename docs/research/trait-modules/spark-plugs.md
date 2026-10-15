# Base item: spark plugs

Source: Perplexity, 2026-10-15. Raw research, not yet in code.
Not a trait block. Spark plugs are already in the generic list
(factory 100k, consensus 90k, in scheduleTemplates.ts).

## Decisions (Claude review)

- Keep the generic item. Change consensus 90k -> 100k to match the research
  (most modern plugs are iridium/platinum, 100k-120k).
- Remove spark plugs for diesel and EV cars (engine block decides this).
  Keep them for hybrids and plug-in hybrids.
- Drop the copper/nickel 60k override. It needs the plug type, and users
  do not know it. The note says "check your manual" instead.
- Drop the extra `multi-point-inspection` item (symptom checks).
- Fix the generic note: it says turbo engines wear plugs "much sooner".
  The research says do not assume that for all turbos. Say "some turbo
  engines use a shorter interval; check your manual."

## Exceptions found

- Toyota/Lexus: often 120k (Prius 120k/96 mo, 2008 Tacoma 120k/144 mo).
  Use the same plug type as the factory.
- Honda/Acura: Maintenance Minder code 4. Can pair with timing belt,
  water pump inspection, valve clearance on belt engines.
- Ford: owner's manual per vehicle. No Ford-wide number.
- No reliable "severe service" plug interval exists. Do not make one up.

## Key sources

- https://assets.sia.toyota.com/publications/en/omms-s/MSTOY01_MS0002/pdf/MSTOY01_MS0002.pdf
- https://assets.sia.toyota.com/publications/en/omms-s/T-MMS-08Tacoma/pdf/T-MMS-08Tacoma.pdf
- https://owners.honda.com/utility/download?path=/static/pdfs/2021/Odyssey/2021_Odyssey_Maintenance_Minder_System.PDF
- https://www.ford.com/support/how-tos/more-vehicle-topics/engine-and-transmission/how-often-should-i-replace-the-spark-plugs-in-my-ford-engine/

# Base items: engine air filter + cabin air filter

Source: Perplexity, 2026-10-15. Raw research, not yet in code.
Not trait blocks. Generic list today: engine 30k (no months),
cabin 25k (no months), in scheduleTemplates.ts.

## Decisions (Claude review)

- Engine air filter: add a time limit. 30k / 36 mo (factory + consensus).
- Cabin air filter: factory 30k / 36 mo, consensus 20k / 24 mo
  (was 25k, no months). It clogs from pollen, smoke and traffic over time,
  not only from miles.
- EV block: remove `engine-air-filter`, keep `cabin-air-filter`.
- Note addition: "Dusty roads or heavy city traffic: about 15k."
- Drop: the extra inspection item and the extra record fields.

## Exceptions found

- Toyota (2009 Camry): both filters 30k / 36 mo.
- Honda/Acura: Maintenance Minder sub-item 2. Severe: 15k for dust (engine)
  or city soot (cabin).
- Subaru (2018): engine filter 60k / 48 mo.
- Some older/base cars have no cabin filter.

## Key sources

- https://assets.sia.toyota.com/publications/en/omms-s/T-MMS-09Camry/pdf/09%20Camry%20SMG%20142979%20EN%202nd.pdf
- https://owners.honda.com/static/pdfs/2017/CR-V/2017_CR-V_Maintenance_Minder_System.pdf
- https://contactus.subaru.com/knowledgebase/article/1001833/en-us

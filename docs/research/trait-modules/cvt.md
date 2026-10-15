# Trait module: CVT

Source: Perplexity, 2026-10-15. Raw research, not yet in code.

## Decisions (Claude review)

- Keep: `cvt-fluid`. Factory shown as 60k / 72 mo (Nissan severe-use figure;
  most makers list inspection only under normal use). Consensus 40k / 48 mo.
- Rule: CVT trait REPLACES `transmission-fluid`. Never both.
- Drop: the extra `multi-point-inspection` item. CVT checks go in the
  cvt-fluid note instead. A separate inspection reminder would be noise.
- Severe service (Coast has no severe mode yet): put "30k if towing, short
  trips, heat, dust" in the note.
- Hybrid eCVT (Toyota/Ford power-split) is NOT this module.
- Note text must say: OEM fluid only, drain-and-fill, no flush.

## Exceptions found

- Nissan: inspect every 10k/12 mo; replace 60k/72 mo severe. Not "lifetime".
- Honda: Maintenance Minder; 25k under low-speed mountain driving.
- Subaru: inspection only normal use; ~25k (40,000 km) severe.
- Toyota/Lexus gas CVTs: often inspection only; check the manual.

## Key sources

- https://maintenance-schedules.nissanusa.com/maintenance-schedules/2025/altima/components/cvt-transmission-fluid/?MakeID=67
- https://owners.nissanusa.com/content/techpub/common/2016/2016-nissan-service-maintenance-guide.pdf
- https://owners.honda.com/utility/download?path=/static/pdfs/2022/HR-V/2022_HR-V_Maintenance_Minder_System.pdf
- https://techinfo.subaru.com/stis/doc/warrantyBooklet/2024_war_and_maint_041723.pdf
- https://www.toyota.com/car-tips/change-transmission-fluid/

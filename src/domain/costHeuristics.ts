// Local regional-rate math: turns provider/OEM labor-hour + parts-range data
// (services/costProvider.ts) into a dollar estimate. Kept as its own pure
// module so the rate math is swappable/testable without touching the adapter,
// and so cost estimates stay a distinct layer from maintenance-schedule data
// and practical-timing guidance (see types.ts's CostEstimateData header).

export const DEFAULT_LABOR_RATE_PER_HOUR = 130 // rough US national average independent-shop rate — not vehicle- or region-specific

export interface CostRange {
  laborCost: number
  totalLow: number
  totalHigh: number
}

export function estimateCostRange(
  laborHours: number,
  partsCostLow: number,
  partsCostHigh: number,
  ratePerHour: number = DEFAULT_LABOR_RATE_PER_HOUR,
): CostRange {
  const laborCost = Math.round(laborHours * ratePerHour)
  return {
    laborCost,
    totalLow: laborCost + Math.round(partsCostLow),
    totalHigh: laborCost + Math.round(partsCostHigh),
  }
}

export type CostConfidence = 'low' | 'medium' | 'high'

/**
 * 'high' only when both labor hours AND parts range came from real provider
 * data rather than a flat sample placeholder. The only provider wired up
 * today (mockCostProvider) is sample data, so real usage currently always
 * lands on 'low' — kept as a real function (not a constant) so a future real
 * provider can raise it without any call site changing.
 */
export function deriveCostConfidence(hasProviderLaborData: boolean, hasProviderPartsData: boolean): CostConfidence {
  if (hasProviderLaborData && hasProviderPartsData) return 'high'
  if (hasProviderLaborData || hasProviderPartsData) return 'medium'
  return 'low'
}

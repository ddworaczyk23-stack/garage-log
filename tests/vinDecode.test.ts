import { describe, it, expect, vi, afterEach } from 'vitest'
import { decodeVin } from '../src/services/vinDecode'

function stubVpic(fields: Record<string, string>) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      json: async () => ({ Results: [{ ModelYear: '2021', Make: 'TOYOTA', Model: 'RAV4', ...fields }] }),
    })),
  )
}

afterEach(() => vi.unstubAllGlobals())

describe('decodeVin suggestedTraits', () => {
  it('reads a strong hybrid as hybrid, not EV', async () => {
    stubVpic({ ElectrificationLevel: 'HEV (Strong Hybrid Electric Vehicle)', FuelTypePrimary: 'Gasoline' })
    const r = await decodeVin('2T3RWRFV0MW000000')
    expect(r.ok && r.suggestedTraits?.power).toBe('hybrid')
  })

  it('reads a battery EV as ev', async () => {
    stubVpic({ ElectrificationLevel: 'BEV (Battery Electric Vehicle)', FuelTypePrimary: 'Electric' })
    const r = await decodeVin('5YJ3E1EA0MF000000')
    expect(r.ok && r.suggestedTraits?.power).toBe('ev')
  })

  it('reads an EV from fuel type when electrification is blank', async () => {
    stubVpic({ FuelTypePrimary: 'Electric' })
    const r = await decodeVin('5YJ3E1EA0MF000000')
    expect(r.ok && r.suggestedTraits?.power).toBe('ev')
  })
})

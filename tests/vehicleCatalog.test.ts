import { afterEach, describe, expect, it, vi } from 'vitest'
import { COMMON_MAKES, fetchModels, modelNamesFor } from '../src/services/vehicleCatalog'

describe('modelNamesFor', () => {
  it('keeps only the exact make, de-dupes, and sorts', () => {
    const rows = [
      { Make_Name: 'RAM', Model_Name: '2500' },
      { Make_Name: 'RAM', Model_Name: '1500' },
      { Make_Name: 'RAM', Model_Name: '1500' },
      { Make_Name: 'RAMSEY TRAILERS', Model_Name: 'Hauler' },
      { Make_Name: 'RAM', Model_Name: '  ' },
    ]
    expect(modelNamesFor('Ram', rows)).toEqual(['1500', '2500'])
  })

  it('bundles the household makes the app ships with', () => {
    expect(COMMON_MAKES).toContain('Ford')
    expect(COMMON_MAKES).toContain('Nissan')
  })
})

describe('fetchModels', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('merges car, truck and MPV results', async () => {
    const byType: Record<string, { Make_Name: string; Model_Name: string }[]> = {
      car: [{ Make_Name: 'NISSAN', Model_Name: 'Altima' }],
      truck: [{ Make_Name: 'NISSAN', Model_Name: 'Frontier' }],
      mpv: [{ Make_Name: 'NISSAN', Model_Name: 'Rogue' }],
    }
    const fetchMock = vi.fn(async (url: string) => {
      const type = url.match(/vehicletype\/(\w+)/)![1]
      return new Response(JSON.stringify({ Results: byType[type] }))
    })
    vi.stubGlobal('fetch', fetchMock)
    expect(await fetchModels('Nissan', 2020)).toEqual({ ok: true, models: ['Altima', 'Frontier', 'Rogue'] })
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('reports failure when every lookup fails (offline)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('offline') }))
    expect(await fetchModels('Kia', 2019)).toEqual({ ok: false })
  })
})

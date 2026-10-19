import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchTrims, matchEpaModels, toTrimVersion, uniqueVersions } from '../src/services/trimCatalog'

describe('matchEpaModels', () => {
  it('matches EPA names that add body/drive words to the NHTSA model', () => {
    const epa = ['Expedition', 'F150 Pickup 2WD', 'F150 Pickup 4WD', 'Ranger 4WD']
    expect(matchEpaModels('F-150', epa, ['F-150', 'Ranger'])).toEqual(['F150 Pickup 2WD', 'F150 Pickup 4WD'])
  })

  it('leaves a longer sibling model out', () => {
    const epa = ['Rogue', 'Rogue AWD', 'Rogue Sport', 'Rogue Sport AWD']
    expect(matchEpaModels('Rogue', epa, ['Rogue', 'Rogue Sport'])).toEqual(['Rogue', 'Rogue AWD'])
    expect(matchEpaModels('Rogue Sport', epa, ['Rogue', 'Rogue Sport'])).toEqual(['Rogue Sport', 'Rogue Sport AWD'])
  })

  it('ignores a leading make in the EPA name', () => {
    expect(matchEpaModels('1500', ['Ram 1500 Pickup 4WD', '2500'], ['1500'], 'Ram')).toEqual(['Ram 1500 Pickup 4WD'])
  })
})

describe('toTrimVersion', () => {
  it('reads a turbo 4WD automatic', () => {
    expect(toTrimVersion({ id: 1, displ: '2.7', cylinders: '6', trany: 'Automatic (S10)', drive: '4-Wheel Drive', tCharger: 'T', atvType: '' })).toMatchObject({
      label: '2.7L 6-cyl Turbo · 10-spd auto · 4WD',
      trim: '2.7L 6-cyl Turbo 4WD',
      engine: '2.7L 6-cyl Turbo',
      power: 'turbo',
      trans: 'auto',
      drive: '4WD',
    })
  })

  it('reads a CVT FWD and a hybrid', () => {
    expect(toTrimVersion({ id: 2, displ: 2.5, cylinders: 4, trany: 'Automatic (variable gear ratios)', drive: 'Front-Wheel Drive', tCharger: null })).toMatchObject({ power: 'gas', trans: 'cvt', drive: 'FWD' })
    expect(toTrimVersion({ id: 3, displ: 2.5, cylinders: 4, trany: 'Automatic (AV-S6)', drive: 'All-Wheel Drive', atvType: 'Hybrid' })).toMatchObject({ power: 'hybrid', trans: 'cvt', drive: 'AWD' })
  })

  it('reads an EV and a dual-clutch', () => {
    expect(toTrimVersion({ id: 4, trany: 'Automatic (A1)', drive: 'Rear-Wheel Drive', atvType: 'EV', fuelType: 'Electricity' })).toMatchObject({ label: 'Electric · RWD', power: 'ev' })
    expect(toTrimVersion({ id: 5, displ: 2, cylinders: 4, trany: 'Automatic (AM-S7)', drive: 'Front-Wheel Drive', tCharger: true })?.trans).toBe('dct')
  })
})

it('uniqueVersions drops look-alike rows', () => {
  const a = toTrimVersion({ id: 1, displ: 3.5, cylinders: 6, trany: 'Automatic (S10)', drive: '4-Wheel Drive' })
  const b = toTrimVersion({ id: 2, displ: 3.5, cylinders: 6, trany: 'Automatic (S10)', drive: '4-Wheel Drive', atvType: 'FFV' })
  expect(uniqueVersions([a, b, null])).toHaveLength(1)
})

describe('fetchTrims', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('walks models -> options -> vehicles', async () => {
    const json = (body: unknown) => new Response(JSON.stringify(body))
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('/menu/model')) return json({ menuItem: [{ text: 'Rogue', value: 'Rogue' }, { text: 'Rogue Sport', value: 'Rogue Sport' }] })
      if (url.includes('/menu/options')) return json({ menuItem: { text: 'Auto (AV), 4 cyl, 2.5 L', value: '41001' } })
      return json({ id: 41001, displ: '2.5', cylinders: '4', trany: 'Automatic (variable gear ratios)', drive: 'Front-Wheel Drive' })
    }))
    const result = await fetchTrims('Nissan', 'Rogue', 2020, ['Rogue', 'Rogue Sport'])
    expect(result).toEqual({ ok: true, versions: [expect.objectContaining({ label: '2.5L 4-cyl · CVT · FWD' })] })
  })

  it('reports failure when the service is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('offline') }))
    expect(await fetchTrims('Kia', 'Soul', 2019, ['Soul'])).toEqual({ ok: false })
  })
})

import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchTrims, matchEpaModels, optionToVehicle, toTrimVersion, uniqueVersions } from '../src/services/trimCatalog'

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

describe('optionToVehicle', () => {
  const version = (text: string, model: string) => toTrimVersion(optionToVehicle('1', text, model))

  it('reads engine and transmission from the text and drive from the model name', () => {
    expect(version('Auto (S10), 6 cyl, 2.7 L, Turbo', 'F150 Pickup 4WD')).toMatchObject({ label: '2.7L 6-cyl Turbo · 10-spd auto · 4WD', power: 'turbo', trans: 'auto', drive: '4WD' })
    expect(version('Auto (S10), 6 cyl, 3.3 L, FFV', 'F150 Pickup 2WD')).toMatchObject({ power: 'gas', drive: 'RWD' })
    expect(version('Man 6-spd, 4 cyl, 2.0 L', 'Civic')).toMatchObject({ label: '2.0L 4-cyl · 6-spd manual', trans: 'manual', drive: undefined })
  })

  it('spots hybrids, EVs and superchargers', () => {
    expect(version('Auto (AV), 4 cyl, 2.5 L', 'Camry Hybrid LE')?.power).toBe('hybrid')
    expect(version('Auto (A1)', 'Model 3 Long Range AWD')).toMatchObject({ label: 'Electric · AWD', power: 'ev' })
    expect(version('Auto (S8), 8 cyl, 6.2 L, S-Charge', 'Camaro')).toMatchObject({ engine: '6.2L 8-cyl Supercharged', power: 'turbo' })
  })
})

it('uniqueVersions drops look-alike rows', () => {
  const a = toTrimVersion({ id: 1, displ: 3.5, cylinders: 6, trany: 'Automatic (S10)', drive: '4-Wheel Drive' })
  const b = toTrimVersion({ id: 2, displ: 3.5, cylinders: 6, trany: 'Automatic (S10)', drive: '4-Wheel Drive', atvType: 'FFV' })
  expect(uniqueVersions([a, b, null])).toHaveLength(1)
})

describe('fetchTrims', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('reads versions from the options menus, with no per-vehicle calls', async () => {
    const json = (body: unknown) => new Response(JSON.stringify(body))
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/menu/model')) return json({ menuItem: [{ text: 'Rogue AWD', value: 'Rogue AWD' }, { text: 'Rogue FWD', value: 'Rogue FWD' }, { text: 'Rogue Sport', value: 'Rogue Sport' }] })
      if (url.includes('/menu/options') && url.includes('AWD')) return json({ menuItem: { text: 'Auto (AV-S7), 4 cyl, 2.5 L', value: '41002' } })
      if (url.includes('/menu/options')) return json({ menuItem: { text: 'Auto (AV-S7), 4 cyl, 2.5 L', value: '41001' } })
      throw new Error(`unexpected ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    const result = await fetchTrims('Nissan', 'Rogue', 2020, ['Rogue', 'Rogue Sport'])
    expect(result).toEqual({
      ok: true,
      versions: [expect.objectContaining({ id: '41002', label: '2.5L 4-cyl · CVT · AWD' }), expect.objectContaining({ id: '41001', label: '2.5L 4-cyl · CVT · FWD' })],
    })
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('reports failure when the service is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('offline') }))
    expect(await fetchTrims('Kia', 'Soul', 2019, ['Soul'])).toEqual({ ok: false })
  })
})

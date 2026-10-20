import { afterEach, describe, expect, it, vi } from 'vitest'
import { bundleModels, bundleTrims, catalogSlug, loadMakeBundle, mergeModelNames, type MakeBundle } from '../src/services/catalogBundle'

const ford: MakeBundle = {
  make: 'Ford',
  years: {
    '2020': {
      F150: [
        [41001, 2.7, 6, 'Automatic (S10)', '4-Wheel Drive', 1, 0, '', 'Regular Gasoline'],
        [41002, 2.7, 6, 'Automatic (S10)', 'Rear-Wheel Drive', 1, 0, '', 'Regular Gasoline'],
        [41003, 3.3, 6, 'Automatic (S10)', '4-Wheel Drive', 0, 0, 'FFV', 'Gasoline or E85'],
      ],
      Ranger: [[41010, 2.3, 4, 'Automatic (S10)', '4-Wheel Drive', 1, 0, '', 'Regular Gasoline']],
    },
  },
}

describe('bundled catalog', () => {
  it('lists the year\'s models, sorted, and none for a missing year', () => {
    expect(bundleModels(ford, 2020)).toEqual(['F150', 'Ranger'])
    expect(bundleModels(ford, 2027)).toEqual([])
  })

  it('turns rows into trim versions with schedule traits', () => {
    const trims = bundleTrims(ford, 2020, 'F150')
    expect(trims.map((t) => t.label)).toEqual(['2.7L 6-cyl Turbo · 10-spd auto · 4WD', '2.7L 6-cyl Turbo · 10-spd auto · RWD', '3.3L 6-cyl · 10-spd auto · 4WD'])
    expect(trims[0]).toMatchObject({ id: '41001', power: 'turbo', trans: 'auto', drive: '4WD' })
    expect(trims[2].power).toBe('gas')
    expect(bundleTrims(ford, 2020, 'F-250')).toEqual([])
  })

  it('merges in NHTSA-only models, keeping the bundled spelling', () => {
    expect(mergeModelNames(['F150', 'Ranger'], ['F-150', 'F-250', 'Ranger'])).toEqual(['F-250', 'F150', 'Ranger'])
    expect(mergeModelNames(['Rogue'], [])).toEqual(['Rogue'])
  })

  it('slugs make names for file names', () => {
    expect(catalogSlug('Mercedes-Benz')).toBe('mercedes-benz')
    expect(catalogSlug(' Land Rover ')).toBe('land-rover')
  })
})

describe('loadMakeBundle', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('fetches the make\'s file once', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(ford)))
    vi.stubGlobal('fetch', fetchMock)
    expect(await loadMakeBundle('Ford')).toEqual(ford)
    expect(await loadMakeBundle('FORD')).toEqual(ford)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith('./catalog/ford.json')
  })

  it('treats a missing file or a dev-server HTML page as no bundle, and retries later', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<!doctype html>', { status: 200 })))
    expect(await loadMakeBundle('Kia')).toBeNull()
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 404 })))
    expect(await loadMakeBundle('Kia')).toBeNull()
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ make: 'Kia', years: {} }))))
    expect(await loadMakeBundle('Kia')).toEqual({ make: 'Kia', years: {} })
  })
})

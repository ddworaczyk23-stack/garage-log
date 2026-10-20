// Builds public/catalog/<make>.json from the EPA's full vehicle list
// (fueleconomy.gov, every rated car since 1984), so "Add a car" can fill its
// model and trim pickers from one same-origin file instead of waiting on live
// lookups. Runs in the deploy workflow; output is gitignored.
//
//   npm run catalog                    download from fueleconomy.gov
//   npm run catalog -- vehicles.csv    use a local copy (.csv or .csv.zip)
//
// The app reads these files in src/services/catalogBundle.ts. Without them it
// still works, using the slower live lookups.
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { inflateRawSync } from 'node:zlib'

const SOURCE = 'https://www.fueleconomy.gov/feg/epadata/vehicles.csv.zip'
const OUT_DIR = new URL('../public/catalog/', import.meta.url)

/** Same rule as catalogSlug() in src/services/catalogBundle.ts. */
export function catalogSlug(make) {
  return make.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

/** RFC 4180 CSV: quoted fields, doubled quotes, CRLF or LF. */
export function parseCsv(text) {
  const rows = []
  let row = []
  let field = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') field += text[++i]
      else if (c === '"') quoted = false
      else field += c
    } else if (c === '"') quoted = true
    else if (c === ',') {
      row.push(field)
      field = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else field += c
  }
  if (field || row.length) rows.push([...row, field])
  return rows
}

/** The first .csv file in a zip archive (EPA ships one). */
export function unzipCsv(buf) {
  let eocd = buf.length - 22
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--
  if (eocd < 0) throw new Error('not a zip file')
  const entries = buf.readUInt16LE(eocd + 10)
  let cd = buf.readUInt32LE(eocd + 16)
  for (let n = 0; n < entries; n++) {
    const method = buf.readUInt16LE(cd + 10)
    const size = buf.readUInt32LE(cd + 20)
    const nameLen = buf.readUInt16LE(cd + 28)
    const local = buf.readUInt32LE(cd + 42)
    const name = buf.toString('utf8', cd + 46, cd + 46 + nameLen)
    if (name.toLowerCase().endsWith('.csv')) {
      const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28)
      const data = buf.subarray(start, start + size)
      return method === 0 ? data : inflateRawSync(data)
    }
    cd += 46 + nameLen + buf.readUInt16LE(cd + 30) + buf.readUInt16LE(cd + 32)
  }
  throw new Error('no .csv file in the zip')
}

const flag = (value) => {
  const v = (value ?? '').trim().toLowerCase()
  return v !== '' && v !== 'false' && v !== 'null' ? 1 : 0
}
const num = (value) => {
  const n = Number(value)
  return value?.trim() && Number.isFinite(n) && n > 0 ? n : null
}

/**
 * EPA rows -> one bundle per make: { make, years: { [year]: { [model]: rows } } }.
 * Models use EPA's baseModel ("F150", "Rogue"), which drops the drive/body
 * words its full model names carry. Each row is
 * [id, displ, cylinders, trany, drive, turbo, supercharged, atvType, fuelType];
 * rows that differ only by id are kept once.
 */
export function buildBundles(rows) {
  const [header = [], ...body] = rows
  const col = Object.fromEntries(header.map((name, i) => [name.trim(), i]))
  const needed = ['id', 'year', 'make', 'model', 'baseModel', 'displ', 'cylinders', 'trany', 'drive', 'tCharger', 'sCharger', 'atvType', 'fuelType']
  const missing = needed.filter((name) => !(name in col))
  if (missing.length) throw new Error(`EPA CSV is missing columns: ${missing.join(', ')}`)

  const bundles = new Map()
  const seen = new Set()
  for (const r of body) {
    const make = r[col.make]?.trim()
    const year = r[col.year]?.trim()
    const model = (r[col.baseModel]?.trim() || r[col.model]?.trim()) ?? ''
    const id = Number(r[col.id])
    if (!make || !year || !model || !id) continue
    const slug = catalogSlug(make)
    const spec = [num(r[col.displ]), num(r[col.cylinders]), r[col.trany].trim(), r[col.drive].trim(), flag(r[col.tCharger]), flag(r[col.sCharger]), r[col.atvType].trim(), r[col.fuelType].trim()]
    const key = JSON.stringify([slug, year, model, spec])
    if (seen.has(key)) continue
    seen.add(key)
    if (!bundles.has(slug)) bundles.set(slug, { make, years: {} })
    const years = bundles.get(slug).years
    years[year] ??= {}
    ;(years[year][model] ??= []).push([id, ...spec])
  }
  return bundles
}

async function main() {
  const path = process.argv[2]
  let raw
  if (path) raw = await readFile(path)
  else {
    const res = await fetch(SOURCE)
    if (!res.ok) throw new Error(`EPA download failed: ${res.status}`)
    raw = Buffer.from(await res.arrayBuffer())
  }
  const isZip = raw[0] === 0x50 && raw[1] === 0x4b
  const bundles = buildBundles(parseCsv((isZip ? unzipCsv(raw) : raw).toString('utf8')))
  if (!bundles.size) throw new Error('EPA CSV had no vehicles')

  await rm(OUT_DIR, { recursive: true, force: true })
  await mkdir(OUT_DIR, { recursive: true })
  let bytes = 0
  for (const [slug, bundle] of bundles) {
    const json = JSON.stringify(bundle)
    bytes += json.length
    await writeFile(new URL(`${slug}.json`, OUT_DIR), json)
  }
  console.log(`catalog: ${bundles.size} makes, ${(bytes / 1e6).toFixed(1)} MB -> public/catalog/`)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((err) => {
    console.error(err.message)
    process.exit(1)
  })
}

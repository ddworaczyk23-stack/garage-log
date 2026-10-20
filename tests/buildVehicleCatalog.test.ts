import { deflateRawSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { buildBundles, parseCsv, unzipCsv } from '../scripts/build-vehicle-catalog.mjs'

const HEADER = 'id,year,make,model,baseModel,displ,cylinders,trany,drive,tCharger,sCharger,atvType,fuelType,city08'

describe('parseCsv', () => {
  it('handles quotes, embedded commas and CRLF', () => {
    expect(parseCsv('a,"b, c","say ""hi"""\r\n1,,3\n')).toEqual([['a', 'b, c', 'say "hi"'], ['1', '', '3']])
  })
})

describe('buildBundles', () => {
  const csv = [
    HEADER,
    '41001,2020,Ford,F150 Pickup 4WD,F150,2.7,6,Automatic (S10),4-Wheel Drive,T,,,Regular Gasoline,18',
    '41005,2020,Ford,F150 Pickup 4WD,F150,2.7,6,Automatic (S10),4-Wheel Drive,T,,,Regular Gasoline,19',
    '41002,2020,Ford,F150 Pickup 2WD,F150,3.3,6,Automatic (S10),Rear-Wheel Drive,,,FFV,Gasoline or E85,19',
    '40100,2020,Nissan,Rogue FWD,Rogue,2.5,4,Automatic (AV-S7),Front-Wheel Drive,,,,Regular Gasoline,26',
    '40200,2020,Tesla,Model 3 Long Range,,,,Automatic (A1),Rear-Wheel Drive,,,EV,Electricity,134',
  ].join('\n')

  it('groups by make, year and base model, dropping id-only duplicates', () => {
    const bundles = buildBundles(parseCsv(csv))
    expect([...bundles.keys()]).toEqual(['ford', 'nissan', 'tesla'])
    expect(bundles.get('ford')).toEqual({
      make: 'Ford',
      years: {
        '2020': {
          F150: [
            [41001, 2.7, 6, 'Automatic (S10)', '4-Wheel Drive', 1, 0, '', 'Regular Gasoline'],
            [41002, 3.3, 6, 'Automatic (S10)', 'Rear-Wheel Drive', 0, 0, 'FFV', 'Gasoline or E85'],
          ],
        },
      },
    })
    // No baseModel: falls back to the full model name. No engine numbers: null.
    expect(bundles.get('tesla')!.years['2020']['Model 3 Long Range'][0]).toEqual([40200, null, null, 'Automatic (A1)', 'Rear-Wheel Drive', 0, 0, 'EV', 'Electricity'])
  })

  it('fails loudly when EPA renames a column', () => {
    expect(() => buildBundles(parseCsv('id,year,make\n1,2020,Ford'))).toThrow(/missing columns/)
  })
})

describe('unzipCsv', () => {
  // A minimal one-file zip, laid out the way zip tools write it.
  function zip(name: string, content: string): Buffer {
    const data = deflateRawSync(Buffer.from(content))
    const fileName = Buffer.from(name)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(8, 8)
    local.writeUInt32LE(data.length, 18)
    local.writeUInt32LE(content.length, 22)
    local.writeUInt16LE(fileName.length, 26)
    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(8, 10)
    central.writeUInt32LE(data.length, 20)
    central.writeUInt32LE(content.length, 24)
    central.writeUInt16LE(fileName.length, 28)
    central.writeUInt32LE(0, 42)
    const cdOffset = local.length + fileName.length + data.length
    const eocd = Buffer.alloc(22)
    eocd.writeUInt32LE(0x06054b50, 0)
    eocd.writeUInt16LE(1, 8)
    eocd.writeUInt16LE(1, 10)
    eocd.writeUInt32LE(central.length + fileName.length, 12)
    eocd.writeUInt32LE(cdOffset, 16)
    return Buffer.concat([local, fileName, data, central, fileName, eocd])
  }

  it('extracts the CSV', () => {
    expect(unzipCsv(zip('vehicles.csv', `${HEADER}\n`)).toString()).toBe(`${HEADER}\n`)
  })

  it('rejects a non-zip', () => {
    expect(() => unzipCsv(Buffer.from('not a zip at all, just text here'))).toThrow(/not a zip/)
  })
})

import { describe, it, expect } from 'vitest'
import { vehicleBody, vehicleLabel } from '../src/domain/vehicle'

describe('vehicleLabel', () => {
  it('uses the seeded name when there is no nickname', () => {
    expect(vehicleLabel({ name: 'F-150 STX' })).toBe('F-150 STX')
    expect(vehicleLabel({ name: 'F-150 STX', nickname: undefined })).toBe('F-150 STX')
  })

  it('prefers the nickname when set', () => {
    expect(vehicleLabel({ name: 'F-150 STX', nickname: 'The Beast' })).toBe('The Beast')
  })

  it('falls back to the name for a blank/whitespace nickname', () => {
    expect(vehicleLabel({ name: 'Rogue SL', nickname: '' })).toBe('Rogue SL')
    expect(vehicleLabel({ name: 'Rogue SL', nickname: '   ' })).toBe('Rogue SL')
  })

  it('trims a nickname with surrounding whitespace', () => {
    expect(vehicleLabel({ name: 'Rogue SL', nickname: '  Daily  ' })).toBe('Daily')
  })
})

describe('vehicleBody', () => {
  it('reads pickups, SUVs and cars from the model name', () => {
    expect(vehicleBody({ make: 'Ford', model: 'F-150 STX' })).toBe('pickup')
    expect(vehicleBody({ make: 'Nissan', model: 'Rogue SL' })).toBe('suv')
    expect(vehicleBody({ make: 'Toyota', model: 'Camry' })).toBe('car')
  })
  it('treats any Ram as a pickup', () => {
    expect(vehicleBody({ make: 'Ram', model: '1500' })).toBe('pickup')
  })
  it('matches whole model words only (Edgewood is not an Edge)', () => {
    expect(vehicleBody({ make: 'Ford', model: 'Edgewood' })).toBe('car')
  })
})

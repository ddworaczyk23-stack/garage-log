import { describe, it, expect } from 'vitest'
import { vehicleEmoji, vehicleLabel } from '../src/domain/vehicle'

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

describe('vehicleEmoji', () => {
  it('picks a truck for pickup models', () => {
    expect(vehicleEmoji({ model: 'F-150' })).toBe('🛻')
    expect(vehicleEmoji({ model: 'Tacoma' })).toBe('🛻')
  })

  it('picks an SUV for crossover/SUV models', () => {
    expect(vehicleEmoji({ model: 'Rogue' })).toBe('🚙')
    expect(vehicleEmoji({ model: 'RAV4' })).toBe('🚙')
  })

  it('picks a van for minivan models', () => {
    expect(vehicleEmoji({ model: 'Odyssey' })).toBe('🚐')
  })

  it('falls back to a generic car for unrecognized models', () => {
    expect(vehicleEmoji({ model: 'Camry' })).toBe('🚗')
    expect(vehicleEmoji({ model: 'Civic' })).toBe('🚗')
  })

  it('is case-insensitive', () => {
    expect(vehicleEmoji({ model: 'f-150' })).toBe('🛻')
  })
})

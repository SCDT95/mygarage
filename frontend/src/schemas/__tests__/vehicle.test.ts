import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { vehicleEditSchema } from '../vehicle'

// Mock vehicle schema based on typical structure
const vehicleSchema = z.object({
  vin: z.string().length(17, 'VIN must be 17 characters'),
  year: z.number().int().min(1900).max(new Date().getFullYear() + 1),
  make: z.string().min(1, 'Make is required'),
  model: z.string().min(1, 'Model is required'),
  trim: z.string().optional(),
  nickname: z.string().optional(),
  license_plate: z.string().optional(),
  current_odometer: z.number().int().min(0).optional(),
  purchase_date: z.string().optional(),
  purchase_price: z.number().min(0).optional(),
})

describe('Vehicle Schema', () => {
  it('validates valid vehicle object', () => {
    const validVehicle = {
      vin: '1HGBH41JXMN109186',
      year: 2018,
      make: 'Honda',
      model: 'Accord',
    }

    const result = vehicleSchema.safeParse(validVehicle)
    expect(result.success).toBe(true)
  })

  it('requires 17-character VIN', () => {
    const invalidVehicle = {
      vin: 'SHORT',
      year: 2018,
      make: 'Honda',
      model: 'Accord',
    }

    const result = vehicleSchema.safeParse(invalidVehicle)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].message).toContain('17 characters')
    }
  })

  it('requires make and model', () => {
    const invalidVehicle = {
      vin: '1HGBH41JXMN109186',
      year: 2018,
      make: '',
      model: '',
    }

    const result = vehicleSchema.safeParse(invalidVehicle)
    expect(result.success).toBe(false)
  })

  it('validates year range', () => {
    const invalidVehicle = {
      vin: '1HGBH41JXMN109186',
      year: 1800, // Too old
      make: 'Honda',
      model: 'Accord',
    }

    const result = vehicleSchema.safeParse(invalidVehicle)
    expect(result.success).toBe(false)
  })

  it('validates positive odometer', () => {
    const invalidVehicle = {
      vin: '1HGBH41JXMN109186',
      year: 2018,
      make: 'Honda',
      model: 'Accord',
      current_odometer: -100, // Negative
    }

    const result = vehicleSchema.safeParse(invalidVehicle)
    expect(result.success).toBe(false)
  })

  it('allows optional fields', () => {
    const validVehicle = {
      vin: '1HGBH41JXMN109186',
      year: 2018,
      make: 'Honda',
      model: 'Accord',
      // trim, nickname, etc. are optional
    }

    const result = vehicleSchema.safeParse(validVehicle)
    expect(result.success).toBe(true)
  })
})

// Task 3 (frontend fuel-type hardening): the real vehicleEditSchema used by
// VehicleWizard/VehicleEdit. fuel_type must transform blank/missing input to
// an explicit `null`, not `undefined` — the vehicle update endpoint uses
// Pydantic's `model_dump(exclude_unset=True)`, so an `undefined` key gets
// dropped by JSON.stringify and the backend treats it as "unchanged" rather
// than "clear this field".
describe('vehicleEditSchema — fuel_type null-vs-undefined', () => {
  it('passes through a valid canonical fuel_type value unchanged', () => {
    const result = vehicleEditSchema.parse({ fuel_type: 'diesel' })
    expect(result.fuel_type).toBe('diesel')
  })

  it('transforms the empty-option selection ("") to null', () => {
    const result = vehicleEditSchema.parse({ fuel_type: '' })
    expect(result.fuel_type).toBeNull()
  })

  it('transforms an omitted fuel_type to null', () => {
    const result = vehicleEditSchema.parse({})
    expect(result.fuel_type).toBeNull()
  })

  it('transforms a null fuel_type (as loaded from an unset vehicle record) to null', () => {
    const result = vehicleEditSchema.parse({ fuel_type: null })
    expect(result.fuel_type).toBeNull()
  })

  it('serializes to a `"fuel_type":null` key, unlike undefined which JSON.stringify drops', () => {
    const result = vehicleEditSchema.parse({ fuel_type: '' })
    const roundTripped = JSON.parse(JSON.stringify(result))
    expect(roundTripped).toHaveProperty('fuel_type', null)
  })
})

// Task 19 (fold-in fix): the same null-vs-undefined bug documented above for
// fuel_type also affects every other optional string field on this schema
// (nickname, trim, make, model, etc. — all backed by optionalStringSchema).
// Clearing one of these fields in the UI must submit an explicit `null`, not
// `undefined` (which JSON.stringify drops, and which the backend's
// `exclude_unset=True` partial update then reads as "leave unchanged").
describe('vehicleEditSchema — sibling optional-string fields null-vs-undefined', () => {
  it('passes through a set nickname unchanged', () => {
    const result = vehicleEditSchema.parse({ nickname: 'My Truck' })
    expect(result.nickname).toBe('My Truck')
  })

  it('transforms a blanked-out nickname ("") to null', () => {
    const result = vehicleEditSchema.parse({ nickname: '' })
    expect(result.nickname).toBeNull()
  })

  it('transforms an omitted nickname to null', () => {
    const result = vehicleEditSchema.parse({})
    expect(result.nickname).toBeNull()
  })

  it('transforms a null nickname to null', () => {
    const result = vehicleEditSchema.parse({ nickname: null })
    expect(result.nickname).toBeNull()
  })

  // JSON.stringify's null-vs-undefined serialization behavior is already
  // locked in by the fuel_type round-trip test above; nickname goes through
  // the same `nullOnBlank` transform, so re-asserting it here would only
  // re-test JSON.stringify itself, not new schema logic.

  it('transforms a blanked-out trim ("") to null (spot-check a second sibling field)', () => {
    const result = vehicleEditSchema.parse({ trim: '' })
    expect(result.trim).toBeNull()
  })
})

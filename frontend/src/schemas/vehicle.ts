import { z } from 'zod'
import { FUEL_TYPE_VALUES } from '../constants/fuel'

/**
 * Vehicle schema for VehicleEdit and VehicleWizard forms.
 * Matches backend Pydantic validators.
 * See: backend/app/schemas/vehicle.py
 */

export const VEHICLE_TYPES = [
  'Car',
  'SUV',
  'Truck',
  'Motorcycle',
  'RV',
  'Trailer',
  'FifthWheel',
  'TravelTrailer',
  'Electric',
  'Hybrid',
] as const

const yearSchema = z
  .number()
  .int('Year must be a whole number')
  .min(1900, 'Year must be 1900 or later')
  .max(2100, 'Year must be 2100 or earlier')
  .or(z.nan())
  .transform(val => isNaN(val) ? undefined : val)
  .optional()

const doorsSchema = z
  .number()
  .int('Doors must be a whole number')
  .min(0, 'Doors cannot be negative')
  .or(z.nan())
  .transform(val => isNaN(val) ? undefined : val)
  .optional()

const cylindersSchema = z
  .number()
  .int('Cylinders must be a whole number')
  .min(0, 'Cylinders cannot be negative')
  .or(z.nan())
  .transform(val => isNaN(val) ? undefined : val)
  .optional()

const purchasePriceSchema = z
  .number()
  .or(z.nan())
  .nullable()
  .optional()
  .transform(val => (val === null || (typeof val === 'number' && isNaN(val))) ? undefined : val)

const soldPriceSchema = z
  .number()
  .or(z.nan())
  .nullable()
  .optional()
  .transform(val => (val === null || (typeof val === 'number' && isNaN(val))) ? undefined : val)

// Handle date fields that may be null, undefined, or empty string from the database
const optionalDateSchema = z
  .string()
  .nullable()
  .optional()
  .transform(val => (val === null || val === '') ? undefined : val)

// Collapse a blank/missing value to an explicit `null` rather than
// `undefined`. The vehicle update endpoint uses Pydantic's
// `model_dump(exclude_unset=True)` — an omitted key means "leave
// unchanged" — so a blank/cleared field must submit `null` (not
// `undefined`, which JSON.stringify/axios would drop) for the backend to
// actually clear it. Used by optionalStringSchema and fuelTypeSchema below;
// both are shared by VehicleEdit (PUT, partial update) and VehicleWizard
// (POST, create). The create endpoint calls `.model_dump()` without
// `exclude_unset`, so every field is always present in the create payload
// regardless — sending an explicit `null` there is identical to omitting
// it, so this is safe for both consumers.
const nullOnBlank = <T,>(val: T | '' | null | undefined): T | null => val || null

// Handle optional string fields that may be null from the database.
const optionalStringSchema = z
  .string()
  .nullable()
  .optional()
  .transform(nullOnBlank)

// fuel_type gets the same null-on-clear treatment (see nullOnBlank above),
// but as its own schema because it's additionally validated against the
// canonical enum (the <select> only ever emits one of these values or "")
// so a stray non-canonical value fails fast in the form instead of
// round-tripping to a 422 from the API.
const fuelTypeSchema = z
  .union([z.enum(FUEL_TYPE_VALUES), z.literal(''), z.null()])
  .optional()
  .transform(nullOnBlank)

export const vehicleEditSchema = z.object({
  // Basic Information
  nickname: optionalStringSchema,
  license_plate: optionalStringSchema,
  vehicle_type: optionalStringSchema,
  color: optionalStringSchema,

  // Vehicle Details
  year: yearSchema,
  make: optionalStringSchema,
  model: optionalStringSchema,

  // VIN Decoded Information
  trim: optionalStringSchema,
  body_class: optionalStringSchema,
  drive_type: optionalStringSchema,
  doors: doorsSchema,
  gvwr_class: optionalStringSchema,

  // Engine & Transmission
  displacement_l: optionalStringSchema, // Backend expects string
  cylinders: cylindersSchema,
  fuel_type: fuelTypeSchema,
  transmission_type: optionalStringSchema,
  transmission_speeds: optionalStringSchema,

  // Purchase Information
  purchase_date: optionalDateSchema,
  purchase_price: purchasePriceSchema,

  // Sale Information
  sold_date: optionalDateSchema,
  sold_price: soldPriceSchema,

  // DEF Tracking — canonical liters
  def_tank_capacity_liters: z
    .number()
    .min(0, 'Tank capacity cannot be negative')
    .max(9999.99, 'Tank capacity too large')
    .or(z.nan())
    .nullable()
    .optional()
    .transform(val => (typeof val === 'number' && isNaN(val)) ? null : val),
})

// Use z.output for Zod v4 compatibility with z.coerce fields
export type VehicleEditInput = z.input<typeof vehicleEditSchema>
export type VehicleEditFormData = z.output<typeof vehicleEditSchema>

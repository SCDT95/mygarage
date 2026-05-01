/**
 * Fuel-tracking enum vocabularies — single source of truth for the frontend.
 *
 * Mirrors backend/app/constants/fuel.py. The values must stay in sync; the
 * backend Pydantic validators will reject any string outside these sets.
 */

export const PAYMENT_METHOD_VALUES = [
  'cash',
  'credit',
  'debit',
  'fleet_card',
  'app',
  'other',
] as const

export type PaymentMethod = (typeof PAYMENT_METHOD_VALUES)[number]

export const TRIP_TYPE_VALUES = [
  'private',
  'business',
  'commute',
  'other',
] as const

export type TripType = (typeof TRIP_TYPE_VALUES)[number]

export const FUEL_TYPE_VALUES = [
  'gasoline',
  'diesel',
  'electric',
  'hybrid',
  'plugin_hybrid',
  'e85',
  'propane_lpg',
  'cng',
  'hydrogen',
  'other',
] as const

export type FuelType = (typeof FUEL_TYPE_VALUES)[number]

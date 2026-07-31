// ============================================================================
// Section A: Generated type aliases from OpenAPI schema
// Source of truth: backend Pydantic models -> openapi.json -> api.generated.ts
// Run `bun run generate:api` after backend schema changes and commit both files.
// ============================================================================

import type { components } from './api.generated'

export type HoursRecord = components['schemas']['HoursRecordResponse']
export type HoursRecordCreate = components['schemas']['HoursRecordCreate']
export type HoursRecordUpdate = components['schemas']['HoursRecordUpdate']
export type HoursRecordListResponse = components['schemas']['HoursRecordListResponse']

// ============================================================================
// Section B: Hand-maintained frontend-only types
// Backend uses str, not Literal[] -- see models/hours.py's `source` column
// comment ("manual, fuel, service_visit"). Keep manual.
// ============================================================================

export type HoursSource = 'manual' | 'fuel' | 'service_visit'

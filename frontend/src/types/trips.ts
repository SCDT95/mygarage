/**
 * Trip type definitions — GPS-tracked drive sessions (Task 14)
 *
 * A "trip" is a DriveSession with at least one recorded GPS location point.
 * Generated aliases from openapi-typescript.
 */

import type { components } from './api.generated'

// -- Trip Types --
export type Trip = components['schemas']['TripSummary']
export type TripList = components['schemas']['TripListResponse']

// -- Location Tracking Toggle Types (R1-H4) --
export type LocationTrackingUpdate = components['schemas']['LocationTrackingUpdate']
export type LocationTrackingResponse = components['schemas']['LocationTrackingResponse']

// -- Trip Points (GPS polyline) Types (Task 15) --
export type TripPoint = components['schemas']['LocationPointOut']
export type TripPointsResponse = components['schemas']['TripPointsResponse']

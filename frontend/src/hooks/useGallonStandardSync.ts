/**
 * Pull the imperial gallon standard (US/UK) from settings into the store.
 *
 * The store already initialised itself synchronously from localStorage, so this
 * only reconciles it with the server. It reads /settings/public rather than
 * /settings: the latter is admin-only, so every non-admin took a 403 here and
 * silently stayed on US gallons while the admin had configured UK, showing
 * every volume and MPG about 20 percent wrong.
 *
 * Precedence, and it is the whole point of this hook's shape:
 *
 * - A successfully parsed `default_unit_prefs` wins. It is the resolved set the
 *   backend publishes for clients with no user, and its gallon flavour follows
 *   D4b (`gallonStandardFor`).
 * - Otherwise the retiring `imperial_gallon_standard` row, which phase 4 removes.
 * - A FAILED reconcile writes nothing at all, so the store keeps whatever it
 *   loaded from localStorage. That is deliberate: a user who is correctly on UK
 *   must not be reset to US by one unreachable request. A SUCCESSFUL reconcile
 *   always replaces the cached value, because a stale local key that outlives a
 *   good server answer is the failure this precedence exists to prevent.
 */

import { useEffect } from 'react'
import api from '@/services/api'
import type { GallonStandard } from '@/utils/units'
import { setGallonStandard } from '@/utils/gallonStandardStore'
import {
  gallonStandardFor,
  readPublicUnitDefaults,
  type PublicSetting,
} from '@/utils/publicUnitDefaults'

/** The pre-D5 instance-wide setting, retired in phase 4. */
const LEGACY_GALLON_STANDARD_KEY = 'imperial_gallon_standard'

/**
 * Decide the gallon standard a successful `/settings/public` response implies.
 *
 * @param settings The payload's settings rows.
 * @returns The standard to write into the store.
 */
function reconciledStandard(settings: readonly PublicSetting[]): GallonStandard {
  const defaults = readPublicUnitDefaults(settings)
  if (defaults) return gallonStandardFor(defaults)

  const legacy = settings.find((setting) => setting.key === LEGACY_GALLON_STANDARD_KEY)
  return legacy?.value === 'uk' ? 'uk' : 'us'
}

export function useGallonStandardSync(): void {
  useEffect(() => {
    let cancelled = false

    const sync = async () => {
      try {
        const response = await api.get('/settings/public')
        const settings: PublicSetting[] = response.data?.settings || []
        const standard = reconciledStandard(settings)
        if (cancelled) return
        setGallonStandard(standard)
      } catch {
        // Keep whatever the store loaded from localStorage; a failed reconcile
        // must not reset a user who is correctly on UK.
      }
    }

    void sync()
    return () => {
      cancelled = true
    }
  }, [])
}

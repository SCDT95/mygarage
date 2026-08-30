/**
 * The instance-wide default unit set, as an admin control.
 *
 * ★ IT REPLACES THE GALLON CONTROL RATHER THAN MERELY FOLLOWING IT. Until this
 * card, an admin's only lever on what anonymous visitors and `auth_mode=none`
 * clients render was `imperial_gallon_standard`, one bit where an account holds
 * eleven columns. Task 5 retires that control, and retiring it with nothing in
 * its place is D5's own failure mode moved from users to instances. Ruling R5:
 * this card writes `default_unit_prefs`, and the backend keeps the gallon row as
 * a seed and fallback only.
 *
 * The row reaches further than the settings screen. `new_user_unit_kwargs`
 * seeds every new account from it (local registration, admin creation and OIDC
 * provisioning alike), and `render_context_default` renders every `auth_mode=none`
 * PDF and notification from it. It is the instance's answer for everyone who has
 * not given one.
 *
 * ★ `isAdmin || authMode === 'none'`, NEVER `isAdmin` ALONE. In `auth_mode=none`
 * the backend deliberately allows settings administration and returns no user
 * (`app/services/auth.py`), so `AuthContext` reports `isAdmin === false` for the
 * single dev user. An `isAdmin` gate would hide this control from precisely the
 * population whose instance default it exists to manage. Same shape as
 * `SettingsIntegrationsTab`'s LiveLink gate, for the same reason.
 *
 * ★ `POST /settings/batch`, NOT `PUT /settings/{key}`. The single-key PUT 404s
 * when the row is absent; the batch route upserts. Migration 093 seeds the row,
 * but an instance whose row was deleted through the generic
 * `DELETE /api/settings/{key}` is exactly the case the backend fallback exists
 * for, and the batch route is the one that can recover it.
 *
 * ★ AND THE WRITE APPLIES LIVE. `defaultUnitPrefs` is React state populated only
 * inside `AuthContext.loadUser`, and nothing re-reads it after a settings write.
 * Without the reload below, every mounted consumer on an `auth_mode=none`
 * instance keeps rendering the old default until the page is refreshed. The
 * retiring gallon control did not have this problem because it wrote a
 * subscribed store; `refreshUser` re-reads `/settings/public`, which is where
 * this row is published, so one call serves both auth modes.
 */

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { useAuth } from '@/contexts/AuthContext'
import api from '@/services/api'
import { basePresetFor, presetTagFor, type UnitSet } from '@/types/units'
import { DEFAULT_UNIT_PREFS_KEY } from '@/utils/publicUnitDefaults'
import UnitSetEditor, { type UnitSetSelection } from './UnitSetEditor'

export default function InstanceUnitDefaultsCard(): React.ReactElement | null {
  const { t } = useTranslation('settings')
  const { isAdmin, authMode, defaultUnitPrefs, refreshUser } = useAuth()
  // Optimistic overlay, so the control responds before the round trip lands.
  // Null while the published row is authoritative.
  const [pendingUnits, setPendingUnits] = useState<UnitSet | null>(null)
  const [saving, setSaving] = useState(false)

  if (!isAdmin && authMode !== 'none') return null

  // The same fallback `parse_default_unit_prefs` applies on the server, so the
  // control shows what an unparseable or absent row actually resolves to rather
  // than an empty state that claims nothing is set.
  const units = pendingUnits ?? defaultUnitPrefs ?? basePresetFor('imperial')

  const applySelection = async (selection: UnitSetSelection): Promise<void> => {
    // A preset expands to the set the ROUTE would resolve it to, exactly as the
    // account writer does, so the same button means the same thing here.
    const next = selection.units ?? basePresetFor(selection.unit_preference)
    setSaving(true)
    setPendingUnits(next)

    try {
      await api.post('/settings/batch', {
        settings: { [DEFAULT_UNIT_PREFS_KEY]: JSON.stringify(next) },
      })
      // Re-reads `/settings/public`, which is where this row is published, so
      // every mounted consumer repaints instead of waiting for a reload.
      await refreshUser()
      toast.success(t('units.instanceDefaultSaved'))
    } catch {
      toast.error(t('units.instanceDefaultError'))
    } finally {
      // Either way the published row is authoritative again: on success it now
      // holds what was written, and on failure it still holds what it did.
      setPendingUnits(null)
      setSaving(false)
    }
  }

  return (
    <section aria-label={t('units.instanceDefault')}>
      <h3 className="block text-sm font-medium text-garage-text mb-3">
        {t('units.instanceDefault')}
      </h3>
      <UnitSetEditor
        preference={presetTagFor(units)}
        units={units}
        busy={saving}
        idPrefix="instance-unit"
        onSelect={(selection) => void applySelection(selection)}
        description={
          <p className="mt-2 text-sm text-garage-text-muted">
            {t('units.instanceDefaultDescription')}
          </p>
        }
      />
    </section>
  )
}

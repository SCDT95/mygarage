import { describe, it, expect, afterEach } from 'vitest'
import { getActiveLocale, setActiveLocale } from '@/constants/i18n'
import { UnitFormatter } from '@/utils/units'
import { formatDateForDisplay, getDateFnsLocale } from '@/utils/dateUtils'

/**
 * Number formatting must follow the language the user picked in the app.
 *
 * A bare `toLocaleString()` follows the BROWSER locale instead, so a German
 * user could still get English separators (and an English user German ones)
 * depending on their browser rather than their setting. UnitFormatter is a
 * static class outside React and cannot call useDateLocale(), so it reads the
 * active locale that src/i18n.ts keeps in sync on languageChanged.
 */
describe('locale-aware number formatting', () => {
  afterEach(() => setActiveLocale('en'))

  it('maps a language to its Intl locale', () => {
    setActiveLocale('de')
    expect(getActiveLocale()).toBe('de-DE')
    setActiveLocale('pl')
    expect(getActiveLocale()).toBe('pl-PL')
  })

  it('falls back to en-US for an unknown language', () => {
    setActiveLocale('xx')
    expect(getActiveLocale()).toBe('en-US')
  })

  it('formats distance with the separators of the active language', () => {
    setActiveLocale('en')
    const en = UnitFormatter.formatDistance(12345, 'metric')
    setActiveLocale('de')
    const de = UnitFormatter.formatDistance(12345, 'metric')

    // en-US groups with a comma, de-DE with a period — the point is that the
    // two differ, which is exactly what a bare toLocaleString() failed to do.
    expect(en).toBe('12,345 km')
    expect(de).toBe('12.345 km')
    expect(en).not.toBe(de)
  })

  it('formats weight with the separators of the active language', () => {
    setActiveLocale('en')
    const en = UnitFormatter.formatWeight(1500, 'metric')
    setActiveLocale('de')
    const de = UnitFormatter.formatWeight(1500, 'metric')
    expect(en).not.toBe(de)
  })

  it('formats dates in the active language by default', () => {
    // The default used to be a hardcoded 'en-US', and 26 of 34 call sites omit
    // the argument — so most dates in the UI ignored the chosen language.
    setActiveLocale('en')
    const en = formatDateForDisplay('2026-08-14')
    setActiveLocale('de')
    const de = formatDateForDisplay('2026-08-14')

    expect(en).toContain('Aug')
    expect(en).not.toBe(de)
  })

  it('still honours an explicitly passed locale', () => {
    setActiveLocale('de')
    expect(formatDateForDisplay('2026-08-14', undefined, 'en-US')).toContain('Aug')
  })

  it('maps the active language to a date-fns locale object', () => {
    // date-fns needs a locale OBJECT, not the Intl string, which is why
    // relative times ("3 months ago") stayed English everywhere.
    setActiveLocale('de')
    expect(getDateFnsLocale().code).toBe('de')
    setActiveLocale('en')
    expect(getDateFnsLocale().code).toBe('en-US')
  })
})

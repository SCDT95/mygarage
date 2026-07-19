import { describe, it, expect, afterEach } from 'vitest'
import { getActiveLocale, setActiveLocale } from '@/constants/i18n'
import { UnitFormatter } from '@/utils/units'

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
})

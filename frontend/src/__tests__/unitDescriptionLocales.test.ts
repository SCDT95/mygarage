import { describe, it, expect } from 'vitest'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { SUPPORTED_LANGUAGES } from '@/constants/i18n'

/**
 * The composed unit description exists, and interpolates, in EVERY shipped locale.
 *
 * ★ WHY A TEST AND NOT A GATE. `validate-translations.ts` treats a MISSING key
 * as a non-blocking warning on purpose (an untranslated key falls back to
 * English while a language is in progress), so shipping this key in `en` alone
 * would leave six languages reading the retired sentence until their next
 * translation pass, and nothing would have said so. Its `interpolation` check
 * IS blocking, but only for a key a language already has. The gap between those
 * two is exactly this key.
 *
 * ★ AND WHY THE LOCALE BUNDLES NEEDED SAYING AT ALL. `validate-reachability.ts`
 * walks textual imports from `src/main.tsx`, and the non-English bundles are
 * fetched by HTTP URL template (`i18n.ts`), so the walker cannot see them.
 * Plan 3b ruling R9 names them explicitly for this reason: the description this
 * file guards exists in seven languages and nothing mechanical would have
 * pointed at six of them.
 *
 * ★ EVERY NAME IS READ, NEVER TRANSCRIBED. The key and the interpolation
 * variable are parsed out of `SettingsSystemTab.tsx`'s own `t(...)` call, so
 * renaming either one in the component fails here until all seven bundles
 * follow. Transcribing them would recreate the defect one file over: the
 * component could move to `{{unitList}}`, every bundle would keep rendering a
 * raw `{{units}}` to users, and this file would stay green. The language list
 * is read from `SUPPORTED_LANGUAGES` for the same reason.
 */

const FRONTEND = resolve(__dirname, '..', '..')
const COMPONENT = resolve(FRONTEND, 'src/components/tabs/SettingsSystemTab.tsx')
const EN_BUNDLE = resolve(FRONTEND, 'src/locales/en/settings.json')
const PUBLIC_LOCALES = resolve(FRONTEND, 'public/locales')

/**
 * The two fixed sentences the composed one replaced.
 *
 * Written out here because they are being DELETED, so there is no source left
 * to read them from. Plan 3b ruling R1: they selected on the binary system,
 * which is collapsed from volume, so a `{volume:'L', distance:'mi',
 * pressure:'psi'}` account was told it uses kilometres and bar.
 */
const RETIRED_KEYS = ['imperialDescription', 'metricDescription'] as const

/** The settings namespace, as one flat object of dotted keys under `units.`. */
type UnitsBlock = Record<string, unknown>

/**
 * The key and interpolation variable the component actually renders with.
 *
 * A hard error rather than a skipped assertion when it cannot be read: this
 * whole file derives from that one call, so a failed read means the assertions
 * below would be checking nothing.
 *
 * @returns The `units.*` key and the name inside its `{{...}}` placeholder.
 */
function contractFromComponent(): { key: string; variable: string } {
  const source = readFileSync(COMPONENT, 'utf-8')
  const match = /\bt\(\s*'units\.([A-Za-z]+)'\s*,\s*\{\s*([A-Za-z]+):/.exec(source)
  if (match === null) {
    throw new Error(
      'could not find an interpolating t(\'units.*\', { ... }) call in ' +
        'src/components/tabs/SettingsSystemTab.tsx. The unit description is composed ' +
        'from the resolved set (plan 3b R1), so a component that no longer interpolates ' +
        'has either regressed to a fixed string or renamed the call beyond this reader. ' +
        'Either way the locale assertions below would be checking nothing.'
    )
  }
  return { key: match[1], variable: match[2] }
}

const { key: DESCRIPTION_KEY, variable: DESCRIPTION_VARIABLE } = contractFromComponent()
const PLACEHOLDER = `{{${DESCRIPTION_VARIABLE}}}`

const LANGUAGES = SUPPORTED_LANGUAGES.map((language) => language.code)

/** Where a language's `settings` namespace ships. English is bundled in `src`. */
function bundlePathFor(language: string): string {
  return language === 'en' ? EN_BUNDLE : join(PUBLIC_LOCALES, language, 'settings.json')
}

/** The `units` block of one language's settings bundle. */
function unitsBlockFor(language: string): UnitsBlock {
  const path = bundlePathFor(language)
  const parsed = JSON.parse(readFileSync(path, 'utf-8')) as { units?: UnitsBlock }
  if (parsed.units === undefined) {
    throw new Error(`${path} has no "units" block`)
  }
  return parsed.units
}

describe('the composed unit description ships in every locale', () => {
  it('checks every language the app can load, and no orphan directory', () => {
    // Both directions. A language in the constant with no directory would be
    // skipped by a disk-driven loop; a directory absent from the constant is
    // translated forever and never fetched. The gate catches the second; this
    // catches the first, which is the one that lets a locale miss this key.
    const shipped = readdirSync(PUBLIC_LOCALES)
      .filter((entry) => statSync(join(PUBLIC_LOCALES, entry)).isDirectory())
      .sort()
    expect(shipped).toStrictEqual(LANGUAGES.filter((code) => code !== 'en').sort())
    expect(LANGUAGES).toContain('en')
  })

  it.each(LANGUAGES)('%s composes the description from the resolved set', (language) => {
    const path = bundlePathFor(language)
    expect(existsSync(path), `${path} is missing`).toBe(true)

    const units = unitsBlockFor(language)
    const description = units[DESCRIPTION_KEY]
    expect(typeof description, `units.${DESCRIPTION_KEY} in ${path}`).toBe('string')
    expect(description as string).toContain(PLACEHOLDER)
  })

  it.each(LANGUAGES)('%s no longer ships either fixed sentence', (language) => {
    const units = unitsBlockFor(language)
    for (const retired of RETIRED_KEYS) {
      expect(Object.keys(units), `units.${retired} survives in ${bundlePathFor(language)}`).not.toContain(retired)
    }
  })
})

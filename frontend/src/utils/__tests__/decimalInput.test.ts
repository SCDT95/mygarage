import { describe, it, expect } from 'vitest'
import { parseDecimalInput, localeDecimalSeparator } from '@/utils/decimalInput'

const val = (raw: string, locale = 'en-US'): number | string => {
  const r = parseDecimalInput(raw, locale)
  return r.kind === 'value' ? r.value : r.kind
}
const amb = (raw: string, locale = 'en-US'): boolean => {
  const r = parseDecimalInput(raw, locale)
  return r.kind === 'value' && r.ambiguous
}

describe('parseDecimalInput', () => {
  it('treats a lone separator as the decimal point, either character', () => {
    expect(val('528,25')).toBe(528.25)
    expect(val('528.25')).toBe(528.25)
  })

  it('uses the LAST separator when both kinds appear', () => {
    expect(val('1.234,56')).toBe(1234.56)
    expect(val('1,234.56')).toBe(1234.56)
    expect(val('1,234,567.89')).toBe(1234567.89)
    expect(val('1.234.567,89')).toBe(1234567.89)
  })

  // [rev2] regression: these were silently accepted as numbers
  it('rejects mixed separators whose groups are not exactly three digits', () => {
    expect(val('12,34.56')).toBe('invalid')
    expect(val('1.23,45')).toBe('invalid')
    expect(val('1,2.3')).toBe('invalid')
    expect(val('12345,67.89')).toBe('invalid')
    expect(val('1,23,456.78')).toBe('invalid')
  })

  it('treats one repeated separator as thousands grouping', () => {
    expect(val('1,234,567')).toBe(1234567)
    expect(val('1.234.567')).toBe(1234567)
    expect(val('1,23,456')).toBe('invalid')
  })

  it('resolves the three-digit ambiguity by locale and FLAGS it', () => {
    expect(val('1,234', 'en-US')).toBe(1234)
    expect(val('1,234', 'pl-PL')).toBe(1.234)
    expect(val('12.345', 'de-DE')).toBe(12345)
    expect(amb('1,234', 'en-US')).toBe(true)
    expect(amb('12,345', 'pl-PL')).toBe(true)
  })

  it('is NOT ambiguous when only one reading is well formed', () => {
    expect(val('1,23')).toBe(1.23)
    expect(amb('1,23')).toBe(false)
    expect(val('1,2345')).toBe(1.2345)
    expect(amb('1,2345')).toBe(false)
    // first group too long to be a thousands group -> plain decimal
    expect(val('12345,678')).toBe(12345.678)
    expect(amb('12345,678')).toBe(false)
  })

  it('tolerates grouping whitespace, apostrophes, symbols and sign', () => {
    expect(val('1 234,56')).toBe(1234.56)
    expect(val("1'234.56")).toBe(1234.56)
    expect(val('$528.25')).toBe(528.25)
    expect(val('-528,25')).toBe(-528.25)
    expect(val('+528.25')).toBe(528.25)
  })

  it('accepts bare leading and trailing separators', () => {
    expect(val('.5')).toBe(0.5)
    expect(val('1.')).toBe(1)
    expect(val('1,')).toBe(1)
  })

  it('reports empty for blank input', () => {
    expect(val('')).toBe('empty')
    expect(val('   ')).toBe('empty')
  })

  it('reports invalid rather than coercing', () => {
    for (const bad of ['abc', '1,2,3', '1..2', '5-3', ',', '.', '-', '+', '..5', '1.2.3', '1.-2']) {
      expect(val(bad)).toBe('invalid')
    }
  })

  it('rejects scientific notation instead of mangling it', () => {
    // stripping the 'e' would silently turn 1e5 into 15
    expect(val('1e5')).toBe('invalid')
    expect(val('1E5')).toBe('invalid')
  })

  it('rejects non-ASCII digit systems rather than guessing', () => {
    expect(val('１２３')).toBe('invalid')
    expect(val('١٢٣')).toBe('invalid')
  })
})

describe('localeDecimalSeparator', () => {
  it('derives the separator from Intl, not a hardcoded table', () => {
    expect(localeDecimalSeparator('en-US')).toBe('.')
    expect(localeDecimalSeparator('pl-PL')).toBe(',')
    expect(localeDecimalSeparator('de-DE')).toBe(',')
  })
})

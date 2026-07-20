import { describe, it, expect } from 'vitest'
import type { TFunction } from 'i18next'
import { makeTollTagSchema, TOLL_SYSTEMS, TOLL_SYSTEM_OPTIONS } from '../tollTag'

// Same shape as the global react-i18next mock in src/__tests__/setup.ts:
// messages come back as their i18n key, which is all these tests need.
const t = ((key: string) => key) as unknown as TFunction

const tollTagSchema = makeTollTagSchema(t)

describe('Toll Tag Schema', () => {
  const validTag = {
    toll_system: 'EZ TAG' as const,
    tag_number: 'TAG-12345',
    status: 'active' as const,
  }

  it('validates valid toll tag', () => {
    const result = tollTagSchema.safeParse(validTag)
    expect(result.success).toBe(true)
  })

  it('requires toll_system to be a valid enum', () => {
    const result = tollTagSchema.safeParse({
      ...validTag,
      toll_system: 'InvalidSystem',
    })
    expect(result.success).toBe(false)
  })

  it('accepts all valid toll systems', () => {
    for (const system of TOLL_SYSTEMS) {
      const result = tollTagSchema.safeParse({ ...validTag, toll_system: system })
      expect(result.success).toBe(true)
    }
  })

  it('requires tag_number', () => {
    const result = tollTagSchema.safeParse({
      toll_system: 'EZ TAG',
      status: 'active',
    })
    expect(result.success).toBe(false)
  })

  it('rejects tag_number over 50 characters', () => {
    const result = tollTagSchema.safeParse({
      ...validTag,
      tag_number: 'A'.repeat(51),
    })
    expect(result.success).toBe(false)
  })

  it('requires status to be active or inactive', () => {
    const result = tollTagSchema.safeParse({
      ...validTag,
      status: 'suspended',
    })
    expect(result.success).toBe(false)
  })

  // The dropdown renders TOLL_SYSTEM_OPTIONS, the schema validates
  // TOLL_SYSTEMS. If they drift, a user picks an option the schema rejects (or
  // a valid system is unpickable) — with no other signal.
  it('exposes exactly one labelled option per accepted toll system', () => {
    expect(TOLL_SYSTEM_OPTIONS.map((o) => o.value)).toEqual([...TOLL_SYSTEMS])
    for (const option of TOLL_SYSTEM_OPTIONS) {
      expect(option.labelKey).toMatch(/^forms:tollSystems\./)
    }
  })
})

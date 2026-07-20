import { z } from 'zod'
import type { TFunction } from 'i18next'

/**
 * Authentication schemas matching backend Pydantic validators.
 * See: backend/app/schemas/user.py
 *
 * Every schema here is a FACTORY, not a module-level constant. Zod messages are
 * baked in at construction time, and a module-level constant is constructed at
 * import — outside React, before a language is even resolved — so its messages
 * would be permanently English. Passing `t` in and memoising the result in the
 * consumer (`useMemo(() => makeLoginSchema(t), [t])`) rebuilds the schema on a
 * language change, so validation errors follow the selected language.
 *
 * Keys are namespace-qualified (`common:…`) because these factories are used
 * from components bound to different namespaces (`common` and `forms`).
 */

// Username validation - matches backend UserBase
export const makeUsernameSchema = (t: TFunction) =>
  z
    .string()
    .min(3, t('common:validation.username.minLength'))
    .max(100, t('common:validation.username.maxLength'))
    .regex(/^[a-zA-Z0-9_-]+$/, t('common:validation.username.pattern'))

// Password validation - matches backend UserCreate validator
export const makePasswordSchema = (t: TFunction) =>
  z
    .string()
    .min(8, t('common:validation.password.minLength'))
    .max(100, t('common:validation.password.maxLength'))
    .regex(/[A-Z]/, t('common:validation.password.uppercase'))
    .regex(/[a-z]/, t('common:validation.password.lowercase'))
    .regex(/\d/, t('common:validation.password.digit'))
    .regex(/[!@#$%^&*(),.?":{}|<>]/, t('common:validation.password.specialChar'))

// Email validation
export const makeEmailSchema = (t: TFunction) =>
  z
    .string()
    .min(1, t('common:validation.email.required'))
    .email(t('common:validation.email.invalid'))
    .max(255, t('common:validation.email.maxLength'))

// Login schema - matches backend LoginRequest
export const makeLoginSchema = (t: TFunction) =>
  z.object({
    username: z.string().min(1, t('common:validation.username.required')).max(100),
    password: z.string().min(1, t('common:validation.password.required')).max(100),
  })

export type LoginFormData = z.infer<ReturnType<typeof makeLoginSchema>>

// Registration schema - matches backend UserCreate
export const makeRegisterSchema = (t: TFunction) =>
  z
    .object({
      username: makeUsernameSchema(t),
      email: makeEmailSchema(t),
      password: makePasswordSchema(t),
      confirmPassword: z.string().min(1, t('common:validation.password.confirmRequired')),
      full_name: z.string().max(255).optional(),
    })
    .refine((data) => data.password === data.confirmPassword, {
      message: t('common:validation.password.mismatch'),
      path: ['confirmPassword'],
    })

export type RegisterFormData = z.infer<ReturnType<typeof makeRegisterSchema>>

/** Stable, never-translated identifier for a password-strength bucket. */
export type PasswordStrengthLevel = 'weak' | 'medium' | 'strong'

export interface PasswordStrength {
  score: number
  /**
   * Stable identifier, NOT display text. Branch on this; look the display
   * string up from a translation key at the render site. Comparing against
   * translated text would silently stop matching in every non-English locale.
   */
  level: PasswordStrengthLevel
  color: string
}

// Password strength helper for UI indicators
export function getPasswordStrength(password: string): PasswordStrength {
  let score = 0

  if (password.length >= 8) score++
  if (password.length >= 12) score++
  if (/[A-Z]/.test(password)) score++
  if (/[a-z]/.test(password)) score++
  if (/\d/.test(password)) score++
  if (/[!@#$%^&*(),.?":{}|<>]/.test(password)) score++

  if (score <= 2) {
    return { score, level: 'weak', color: 'text-red-500' }
  } else if (score <= 4) {
    return { score, level: 'medium', color: 'text-yellow-500' }
  } else {
    return { score, level: 'strong', color: 'text-green-500' }
  }
}

import { z } from 'zod'

/**
 * Address-book categories, in display order.
 *
 * `value` is PERSISTED and sent to the backend verbatim — it must never be
 * translated or renamed. `labelKey` is resolved at the render site so the
 * <select> shows the user's language, matching the RELATIONSHIP_PRESETS
 * precedent in types/family.ts.
 */
export const ADDRESS_BOOK_CATEGORIES = [
  { value: 'Service', labelKey: 'common:addressBook.categoryService' },
  { value: 'Parts', labelKey: 'common:addressBook.categoryParts' },
  { value: 'Dealer', labelKey: 'common:addressBook.categoryDealer' },
  { value: 'Insurance', labelKey: 'common:addressBook.categoryInsurance' },
  { value: 'RV Park', labelKey: 'common:addressBook.categoryRvPark' },
  { value: 'Other', labelKey: 'common:addressBook.categoryOther' },
] as const

export type AddressBookCategory = (typeof ADDRESS_BOOK_CATEGORIES)[number]['value']

export const addressBookSchema = z.object({
  business_name: z.string().min(1, 'Business name is required').max(150, 'Business name too long'),
  name: z.string().max(100, 'Contact name too long').optional(),
  email: z.string().email('Invalid email').or(z.literal('')).optional(),
  phone: z.string().max(20, 'Phone number too long').optional(),
  website: z.string().url('Invalid URL').or(z.literal('')).optional(),
  address: z.string().max(200, 'Address too long').optional(),
  city: z.string().max(100, 'City name too long').optional(),
  state: z.string().max(50, 'State/region too long').optional(),
  zip_code: z.string().max(10, 'ZIP code too long').optional(),
  category: z.string().optional(),
  notes: z.string().optional(),
})

export type AddressBookFormData = z.infer<typeof addressBookSchema>

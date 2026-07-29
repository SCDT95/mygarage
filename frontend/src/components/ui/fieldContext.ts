import { createContext, useContext } from 'react'

interface FieldDescription {
  /** Space-joined ids for the enclosing Field's hint/error text, merged into
   *  the control's aria-describedby. */
  describedBy?: string
}

export const FieldContext = createContext<FieldDescription | null>(null)

/**
 * Merge the enclosing Field's hint/error ids into a control's aria-describedby.
 *
 * The ui primitives (Input, Select, Textarea) call this so a Field's hint and
 * error text are programmatically associated with the control WITHOUT the
 * caller wiring aria-describedby by hand — and without Field reaching into its
 * opaque `children` via cloneElement (which no-ops on fragments / Controller
 * render props, the shapes this codebase uses). A primitive rendered outside a
 * Field sees a null context and keeps only its own explicit aria-describedby.
 */
export function useFieldDescribedBy(explicit?: string): string | undefined {
  const ctx = useContext(FieldContext)
  const merged = [explicit, ctx?.describedBy].filter(Boolean).join(' ')
  return merged || undefined
}

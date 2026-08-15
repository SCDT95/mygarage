import type { FieldValues, UseFormSetError, Path } from 'react-hook-form'
import { parseApiError } from '@/utils/httpErrorHandler'
import type { FieldProblem } from '@/utils/apiValidation'

export interface ApplyResult {
  /** Problems attached to a control the user can see. */
  attached: FieldProblem[]
  /** Problems with nowhere to go — the caller MUST surface these itself. */
  unhandled: FieldProblem[]
}

/**
 * Attach a failed request's field problems to the controls that caused them.
 *
 * Only fields the form actually registers are attached. A problem addressed to
 * anything else (a query parameter, a field this form does not render) is
 * returned as `unhandled`, because react-hook-form silently keeps an error for
 * an unregistered name and the user would never see it.
 *
 * Matching is exact-string on the field name. Nested react-hook-form paths like
 * `items.0.qty` will only attach if the caller enumerates that exact expanded
 * path — otherwise they route to `unhandled` for the caller's toast.
 *
 * [rev2] Callers must surface `unhandled`. The previous boolean return caused a
 * mixed payload to suppress the toast and lose the unmapped problem entirely.
 */
export function applyServerErrors<T extends FieldValues>(
  setFieldError: UseFormSetError<T>,
  error: unknown,
  knownFields: ReadonlyArray<Path<T>>
): ApplyResult {
  const { fieldErrors } = parseApiError(error)
  const attached: FieldProblem[] = []
  const unhandled: FieldProblem[] = []

  for (const problem of fieldErrors) {
    if (knownFields.includes(problem.field as Path<T>)) {
      setFieldError(problem.field as Path<T>, { type: 'server', message: problem.message })
      attached.push(problem)
    } else {
      unhandled.push(problem)
    }
  }
  return { attached, unhandled }
}

import { useState, useCallback } from 'react'
import { getActionErrorMessage } from '@/utils/httpErrorHandler'

interface UseFormSubmitOptions {
  onSuccess: () => void
  onClose: () => void
  /**
   * Action description fed into the translated "Failed to {{action}}. …"
   * template — the caller passes the translated string of a `*.saveAction`
   * key (e.g. warranty.saveAction), not the key itself. Required so every consumer
   * surfaces a real backend `detail` on 400/401/403/404/422 (via
   * getActionErrorMessage) instead of the raw axios `err.message` status
   * line this hook used to fall back to — the same #140 opaque-string class
   * the rest of this release fixes everywhere else.
   */
  action: string
}

/**
 * Hook that extracts the common form submit pattern:
 * - Manages error state
 * - Wraps submit function with try/catch
 * - Calls onSuccess + onClose on success
 * - Extracts error message on failure
 *
 * Note: isSubmitting is intentionally NOT managed here because
 * all forms use react-hook-form's formState.isSubmitting instead.
 */
export function useFormSubmit<T>(
  submitFn: (data: T) => Promise<void>,
  { onSuccess, onClose, action }: UseFormSubmitOptions,
): {
  error: string | null
  setError: React.Dispatch<React.SetStateAction<string | null>>
  handleSubmit: (data: T) => Promise<void>
} {
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = useCallback(
    async (data: T) => {
      setError(null)
      try {
        await submitFn(data)
        onSuccess()
        onClose()
      } catch (err) {
        setError(getActionErrorMessage(err, action))
      }
    },
    [submitFn, onSuccess, onClose, action],
  )

  return { error, setError, handleSubmit }
}

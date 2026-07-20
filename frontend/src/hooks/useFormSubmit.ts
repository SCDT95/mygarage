import { useState, useCallback } from 'react'
import i18next from 'i18next'

/**
 * Translate the generic submit fallback without ever risking a throw.
 *
 * Deliberately reads the i18next singleton rather than useTranslation: `t`
 * changes identity on every language change, and adding it to handleSubmit's
 * dependency array would hand every consumer a new submit callback mid-edit.
 * Same defensive shape as the tSafe helper in components/ErrorBoundary.tsx.
 */
function tSafe(key: string, fallback: string): string {
  try {
    const value = i18next.t(key, { ns: 'common', defaultValue: fallback })
    return typeof value === 'string' && value.length > 0 ? value : fallback
  } catch {
    return fallback
  }
}

interface UseFormSubmitOptions {
  onSuccess: () => void
  onClose: () => void
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
  { onSuccess, onClose }: UseFormSubmitOptions,
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
        // Backend/thrown error text passes through as-is; only the generic
        // fallback is translated.
        setError(
          err instanceof Error
            ? err.message
            : tSafe('httpError.formSubmitFallback', 'An error occurred'),
        )
      }
    },
    [submitFn, onSuccess, onClose],
  )

  return { error, setError, handleSubmit }
}

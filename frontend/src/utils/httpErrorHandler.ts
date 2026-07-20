/**
 * HTTP Error Handler Utility
 *
 * Maps HTTP status codes to user-friendly error messages.
 * Complements backend error handling standardization (v2.11.0).
 *
 * These functions run outside React (interceptors, service helpers, catch
 * blocks) so there is no component to call useTranslation from. They read the
 * i18next singleton defensively via `tSafe`, mirroring the pattern in
 * components/ErrorBoundary.tsx: a hard English default plus a try/catch, so an
 * error path can never itself throw or render a raw key.
 *
 * Backend-supplied `detail` text is passed through verbatim — only the generic
 * fallbacks below are translated.
 */

import { AxiosError } from 'axios'
import i18next from 'i18next'

/**
 * Translate an error string without ever risking a throw.
 *
 * Error handling has to keep working when i18n is the thing that broke (not
 * initialised yet, namespace failed to load). An English message beats an
 * exception inside a catch block.
 */
function tSafe(key: string, fallback: string, values?: Record<string, unknown>): string {
  try {
    const value = i18next.t(key, { ns: 'common', defaultValue: fallback, ...values })
    return typeof value === 'string' && value.length > 0 ? value : fallback
  } catch {
    return fallback
  }
}

/** A translation key paired with its hard English fallback. */
type Message = readonly [key: string, fallback: string]

/**
 * HTTP status code to user-friendly message mapping
 */
const STATUS_MESSAGES: Record<number, Message> = {
  400: ['httpError.status.badRequest', 'Invalid request. Please check your input.'],
  401: ['httpError.status.unauthorized', 'Session expired. Please log in again.'],
  403: ['httpError.status.forbidden', 'You do not have permission to perform this action.'],
  404: ['httpError.status.notFound', 'The requested resource was not found.'],
  409: ['httpError.status.conflict', 'This action conflicts with existing data.'],
  422: ['httpError.status.unprocessable', 'The submitted data could not be processed.'],
  500: ['httpError.status.serverError', 'An unexpected server error occurred.'],
  502: ['httpError.status.badGateway', 'Server is temporarily unavailable. Please try again.'],
  503: [
    'httpError.status.serviceUnavailable',
    'Service temporarily unavailable. Please try again shortly.',
  ],
  504: ['httpError.status.gatewayTimeout', 'Request timed out. Please try again.'],
}

/**
 * Context-specific error messages for common operations
 */
const CONTEXT_MESSAGES: Record<string, Record<number, Message>> = {
  database: {
    409: ['httpError.database.conflict', 'A record with this data already exists.'],
    503: ['httpError.database.unavailable', 'Database temporarily unavailable. Please try again.'],
  },
  file: {
    403: ['httpError.file.forbidden', 'Permission denied. Cannot access file.'],
    404: ['httpError.file.notFound', 'File not found.'],
    500: ['httpError.file.serverError', 'Error accessing file.'],
  },
  external_api: {
    503: [
      'httpError.externalApi.unavailable',
      'External service unavailable. Please try again later.',
    ],
    504: ['httpError.externalApi.timeout', 'External service timed out. Please try again.'],
  },
}

const NETWORK_ERROR: Message = [
  'httpError.network',
  'Network error. Please check your connection.',
]
const GENERIC_ERROR: Message = ['httpError.generic', 'An error occurred.']
const UNEXPECTED_ERROR: Message = ['httpError.unexpected', 'An unexpected error occurred.']

/** Resolve a (key, English) pair through i18next. */
const translate = ([key, fallback]: Message): string => tSafe(key, fallback)

export interface ParsedApiError {
  /** HTTP status code (0 for network errors) */
  status: number
  /** User-friendly error message */
  message: string
  /** Raw error detail from API response */
  detail?: string
  /** Whether this is a network/connectivity error */
  isNetworkError: boolean
  /** Whether this is a timeout error */
  isTimeout: boolean
  /** Whether user should retry the operation */
  shouldRetry: boolean
}

/**
 * Parse an API error into a structured format with user-friendly message.
 *
 * @param error - The error from an API call (typically AxiosError)
 * @param context - Optional context for more specific messages ('database', 'file', 'external_api')
 * @returns Parsed error with user-friendly message
 */
export function parseApiError(error: unknown, context?: string): ParsedApiError {
  // Handle Axios errors
  if (isAxiosError(error)) {
    const status = error.response?.status || 0
    const detail = (error.response?.data as { detail?: string })?.detail || error.message

    // Network error (no response)
    if (!error.response) {
      return {
        status: 0,
        message: translate(NETWORK_ERROR),
        detail: error.message,
        isNetworkError: true,
        isTimeout: error.code === 'ECONNABORTED',
        shouldRetry: true,
      }
    }

    // Context-specific message if available, else the general status message
    const entry = CONTEXT_MESSAGES[context || '']?.[status] ?? STATUS_MESSAGES[status]
    let message = entry ? translate(entry) : translate(GENERIC_ERROR)

    // For 409 conflicts, use the API detail if it's more specific
    if (status === 409 && detail && !detail.includes('Exception')) {
      message = detail
    }

    return {
      status,
      message,
      detail,
      isNetworkError: false,
      isTimeout: status === 504,
      shouldRetry: [502, 503, 504].includes(status),
    }
  }

  // Handle standard Error objects
  if (error instanceof Error) {
    return {
      status: 0,
      message: error.message || translate(GENERIC_ERROR),
      detail: error.message,
      isNetworkError: false,
      isTimeout: false,
      shouldRetry: false,
    }
  }

  // Handle unknown errors
  return {
    status: 0,
    message: translate(UNEXPECTED_ERROR),
    detail: String(error),
    isNetworkError: false,
    isTimeout: false,
    shouldRetry: false,
  }
}

/**
 * Get a user-friendly error message from an API error.
 * Convenience function for simple error display.
 *
 * @param error - The error from an API call
 * @param fallbackMessage - Optional fallback message (already user-ready text)
 * @returns User-friendly error message
 */
export function getErrorMessage(error: unknown, fallbackMessage?: string): string {
  const parsed = parseApiError(error)
  return parsed.message || fallbackMessage || translate(GENERIC_ERROR)
}

/**
 * Get error message with action context.
 *
 * @param error - The error from an API call
 * @param action - The action being performed (e.g., 'save', 'delete', 'load')
 * @returns Contextual error message
 */
export function getActionErrorMessage(error: unknown, action: string): string {
  const parsed = parseApiError(error)
  const failed = (): string =>
    tSafe('httpError.actionFailed', 'Failed to {{action}}. {{message}}', {
      action,
      message: parsed.message,
    })

  // For timeouts and service unavailable, add retry suggestion
  if (parsed.shouldRetry) {
    return failed()
  }

  // For validation errors, show the backend detail verbatim when there is one
  if (parsed.status === 400 || parsed.status === 422) {
    return (
      parsed.detail ||
      tSafe('httpError.actionFailedCheckInput', 'Failed to {{action}}. Please check your input.', {
        action,
      })
    )
  }

  // For conflicts, the message is usually descriptive enough
  if (parsed.status === 409) {
    return parsed.message
  }

  return failed()
}

/**
 * Type guard for AxiosError
 */
function isAxiosError(error: unknown): error is AxiosError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'isAxiosError' in error &&
    (error as AxiosError).isAxiosError === true
  )
}

/**
 * Determine if an error should trigger a retry attempt.
 *
 * @param error - The error from an API call
 * @returns Whether retry is recommended
 */
export function shouldRetryRequest(error: unknown): boolean {
  const parsed = parseApiError(error)
  return parsed.shouldRetry || parsed.isNetworkError
}

/**
 * Check if error is an authentication error requiring login.
 *
 * @param error - The error from an API call
 * @returns Whether this is an auth error
 */
export function isAuthError(error: unknown): boolean {
  if (isAxiosError(error)) {
    return error.response?.status === 401
  }
  return false
}

/**
 * Check if error is a permission/authorization error.
 *
 * @param error - The error from an API call
 * @returns Whether this is a permission error
 */
export function isPermissionError(error: unknown): boolean {
  if (isAxiosError(error)) {
    return error.response?.status === 403
  }
  return false
}

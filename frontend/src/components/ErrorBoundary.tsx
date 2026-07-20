import { Component, ErrorInfo, ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'
import i18next from 'i18next'
import { withBase } from '../utils/basePath'

/**
 * Translate a crash-screen string without ever risking a throw.
 *
 * This is the app's outermost error boundary, so its fallback UI has to render
 * even when the thing that broke IS i18n (singleton not initialised yet, a
 * namespace that failed to load, a bad locale bundle). A class component can't
 * call useTranslation, and wrapping it in withTranslation() would make the
 * crash screen depend on the very runtime that may be dead. So: read the
 * i18next singleton defensively and fall back to the English literal on
 * anything unexpected. An English crash screen beats a crashing one.
 */
function tSafe(key: string, fallback: string): string {
  try {
    const value = i18next.t(key, { ns: 'common', defaultValue: fallback })
    return typeof value === 'string' && value.length > 0 ? value : fallback
  } catch {
    return fallback
  }
}

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
  errorInfo: ErrorInfo | null
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    }
  }

  static getDerivedStateFromError(_error: Error): Partial<State> {
    return { hasError: true }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary]', error, errorInfo)
    this.setState({
      error,
      errorInfo,
    })
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    })
  }

  render() {
    if (this.state.hasError) {
      // Custom fallback UI if provided
      if (this.props.fallback) {
        return this.props.fallback
      }

      // Default error UI
      return (
        <div className="min-h-screen bg-garage-bg flex items-center justify-center p-4">
          <div className="bg-garage-surface border border-garage-border rounded-lg p-8 max-w-lg w-full">
            <div className="flex items-center space-x-3 mb-4">
              <AlertTriangle className="w-8 h-8 text-danger-500" />
              <h1 className="text-2xl font-bold text-garage-text">
                {tSafe('errorBoundary.title', 'Something went wrong')}
              </h1>
            </div>

            <p className="text-garage-text-muted mb-6">
              {tSafe(
                'errorBoundary.description',
                'An unexpected error occurred. Please try refreshing the page or contact support if the problem persists.',
              )}
            </p>

            {import.meta.env.DEV && this.state.error && (
              <details className="mb-6 p-4 bg-garage-bg border border-garage-border rounded">
                {/* i18n-exempt — developer-only debug output, DEV builds only */}
                <summary className="cursor-pointer font-semibold text-garage-text mb-2">
                  Error Details (Development Only)
                </summary>
                <div className="text-sm text-garage-text-muted space-y-2">
                  <div>
                    <strong>Error:</strong> {this.state.error.toString()}
                  </div>
                  {this.state.errorInfo && (
                    <div>
                      {/* i18n-exempt — developer-only debug output, DEV builds only */}
                      <strong>Component Stack:</strong>
                      <pre className="mt-2 overflow-auto text-xs bg-garage-surface p-2 rounded">
                        {this.state.errorInfo.componentStack}
                      </pre>
                    </div>
                  )}
                </div>
              </details>
            )}

            <div className="flex space-x-3">
              <button
                onClick={this.handleReset}
                className="btn btn-secondary flex-1"
              >
                {tSafe('errorBoundary.tryAgain', 'Try Again')}
              </button>
              <button
                onClick={() => window.location.href = withBase('/')}
                className="btn btn-primary flex-1"
              >
                {tSafe('errorBoundary.goToDashboard', 'Go to Dashboard')}
              </button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

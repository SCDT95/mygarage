import { CheckCircle, XCircle, AlertTriangle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { InspectionResult as InspectionResultType, InspectionSeverity } from '../types/serviceVisit'

interface InspectionResultProps {
  result: InspectionResultType | ''
  severity: InspectionSeverity | ''
  onResultChange: (result: InspectionResultType | '') => void
  onSeverityChange: (severity: InspectionSeverity | '') => void
  disabled?: boolean
}

// Labels are i18n keys resolved at render time — these module-scope constants
// are evaluated once, before any language is selected.
const RESULT_OPTIONS: { value: InspectionResultType; labelKey: string; icon: typeof CheckCircle; color: string }[] = [
  { value: 'passed', labelKey: 'inspectionResult.resultPassed', icon: CheckCircle, color: 'text-success' },
  { value: 'needs_attention', labelKey: 'inspectionResult.resultNeedsAttention', icon: AlertTriangle, color: 'text-warning' },
  { value: 'failed', labelKey: 'inspectionResult.resultFailed', icon: XCircle, color: 'text-danger' },
]

const SEVERITY_OPTIONS: { value: InspectionSeverity; labelKey: string; bgClass: string }[] = [
  { value: 'green', labelKey: 'inspectionResult.severityMinor', bgClass: 'bg-success/20 border-success text-success' },
  { value: 'yellow', labelKey: 'inspectionResult.severityModerate', bgClass: 'bg-warning/20 border-warning text-warning' },
  { value: 'red', labelKey: 'inspectionResult.severitySevere', bgClass: 'bg-danger/20 border-danger text-danger' },
]

export default function InspectionResult({
  result,
  severity,
  onResultChange,
  onSeverityChange,
  disabled = false,
}: InspectionResultProps) {
  const { t } = useTranslation('vehicles')
  const showSeverity = result === 'failed' || result === 'needs_attention'

  return (
    <div className="space-y-3">
      {/* Result selection */}
      <div>
        <label className="block text-xs font-medium text-garage-text-muted mb-2">
          {t('inspectionResult.title')}
        </label>
        <div className="flex gap-2">
          {RESULT_OPTIONS.map((option) => {
            const Icon = option.icon
            const isSelected = result === option.value
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  onResultChange(isSelected ? '' : option.value)
                  // Reset severity when result changes
                  if (!isSelected && option.value === 'passed') {
                    onSeverityChange('')
                  }
                }}
                disabled={disabled}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-sm border rounded-md transition-colors ${
                  isSelected
                    ? `border-current ${option.color} bg-current/10`
                    : 'border-garage-border text-garage-text-muted hover:border-garage-text hover:text-garage-text'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                <Icon className="w-4 h-4" />
                <span>{t(option.labelKey)}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Severity selection (only for failed/needs_attention) */}
      {showSeverity && (
        <div>
          <label className="block text-xs font-medium text-garage-text-muted mb-2">
            {t('inspectionResult.severityLevel')}
          </label>
          <div className="flex gap-2">
            {SEVERITY_OPTIONS.map((option) => {
              const isSelected = severity === option.value
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => onSeverityChange(isSelected ? '' : option.value)}
                  disabled={disabled}
                  className={`px-3 py-1.5 text-sm border rounded-md transition-colors ${
                    isSelected
                      ? option.bgClass
                      : 'border-garage-border text-garage-text-muted hover:border-garage-text hover:text-garage-text'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  {t(option.labelKey)}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

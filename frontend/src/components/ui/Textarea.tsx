import type { TextareaHTMLAttributes } from 'react'
import { useFieldDescribedBy } from './fieldContext'

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean
}

/** Multi-line sibling of Input, sharing its surface and focus treatment. */
export default function Textarea({
  invalid = false,
  rows = 4,
  className = '',
  'aria-describedby': ariaDescribedBy,
  ...rest
}: TextareaProps) {
  const describedBy = useFieldDescribedBy(ariaDescribedBy)
  return (
    <textarea
      rows={rows}
      aria-invalid={invalid || undefined}
      aria-describedby={describedBy}
      className={[
        'ui-focus-input ui-motion ui-disabled w-full rounded-control border bg-surface-2 px-3 py-2 text-sm text-text placeholder-text-faint',
        invalid ? 'border-danger' : 'border-border',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    />
  )
}

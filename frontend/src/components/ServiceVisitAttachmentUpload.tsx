import { useState, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Upload, X, AlertCircle } from 'lucide-react'
import api from '../services/api'
import { Button, IconButton } from './ui'

interface ServiceVisitAttachmentUploadProps {
  visitId: number
  onUploadSuccess: () => void
}

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'application/pdf']
const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.pdf']

export default function ServiceVisitAttachmentUpload({
  visitId,
  onUploadSuccess,
}: ServiceVisitAttachmentUploadProps) {
  const { t } = useTranslation('vehicles')
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const validateFile = (file: File): string | null => {
    // Check file size
    if (file.size > MAX_FILE_SIZE) {
      return t('serviceVisitAttachmentUpload.errorTooLarge', {
        size: (file.size / 1024 / 1024).toFixed(2),
      })
    }

    // Check file type
    const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase()
    if (!ALLOWED_TYPES.includes(file.type) && !ALLOWED_EXTENSIONS.includes(fileExtension)) {
      return t('serviceVisitAttachmentUpload.errorInvalidType')
    }

    return null
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const validationError = validateFile(file)
    if (validationError) {
      setError(validationError)
      setSelectedFile(null)
      return
    }

    setError(null)
    setSelectedFile(file)
  }

  const handleUpload = async () => {
    if (!selectedFile) return

    setUploading(true)
    setError(null)

    try {
      const formData = new FormData()
      formData.append('file', selectedFile)

      await api.post(`/service-visits/${visitId}/attachments`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      })

      // Reset state
      setSelectedFile(null)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }

      // Notify parent
      onUploadSuccess()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('serviceVisitAttachmentUpload.errorUploadFailed'))
    } finally {
      setUploading(false)
    }
  }

  const handleCancel = () => {
    setSelectedFile(null)
    setError(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="mb-2 block text-sm font-medium text-text">{t('serviceVisitAttachmentUpload.title')}</label>
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".jpg,.jpeg,.png,.gif,.pdf"
            onChange={handleFileSelect}
            className="hidden"
            id="visit-file-upload"
          />
          <label
            htmlFor="visit-file-upload"
            className="ui-motion flex flex-1 cursor-pointer items-center gap-2 rounded-control border border-border bg-surface-2 px-4 py-2 text-text hover:border-(--accent-line)"
          >
            <Upload aria-hidden="true" className="w-4 h-4" />
            <span className="text-sm">{selectedFile ? selectedFile.name : t('serviceVisitAttachmentUpload.chooseFile')}</span>
          </label>
          {selectedFile && (
            <>
              <Button variant="primary" onClick={handleUpload} loading={uploading}>
                {t('serviceVisitAttachmentUpload.upload')}
              </Button>
              <IconButton
                icon={X}
                label={t('serviceVisitAttachmentUpload.cancel')}
                variant="ghost"
                onClick={handleCancel}
                disabled={uploading}
              />
            </>
          )}
        </div>
        <p className="mt-1 text-xs text-text-mute">{t('serviceVisitAttachmentUpload.supportedFormats')}</p>
      </div>

      {error && (
        <div className="flex items-start gap-2 p-3 bg-danger/10 border border-danger/20 rounded-md">
          <AlertCircle aria-hidden="true" className="w-4 h-4 text-danger flex-shrink-0 mt-0.5" />
          <p className="text-sm text-danger">{error}</p>
        </div>
      )}
    </div>
  )
}

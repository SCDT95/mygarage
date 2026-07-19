import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Download, Trash2, FileText, Image, AlertCircle } from 'lucide-react'
import { formatDateForDisplay } from '../utils/dateUtils'
import { toast } from 'sonner'
import api from '../services/api'
import { apiRelative } from '../utils/basePath'
import type { Attachment } from '../types/attachment'

interface ServiceVisitAttachmentListProps {
  visitId: number
  refreshTrigger?: number
}

export default function ServiceVisitAttachmentList({
  visitId,
  refreshTrigger,
}: ServiceVisitAttachmentListProps) {
  const { t } = useTranslation('vehicles')
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null)

  const fetchAttachments = useCallback(async () => {
    try {
      const response = await api.get(`/service-visits/${visitId}/attachments`)
      setAttachments(response.data.attachments)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('serviceVisitAttachments.errorOccurred'))
    }
  }, [visitId, t])

  useEffect(() => {
    setLoading(true)
    fetchAttachments().finally(() => setLoading(false))
  }, [fetchAttachments, refreshTrigger])

  const handleDelete = async (attachmentId: number) => {
    if (!confirm(t('serviceVisitAttachments.confirmDelete'))) {
      return
    }

    setDeletingId(attachmentId)
    try {
      await api.delete(`/attachments/${attachmentId}`)
      await fetchAttachments()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('serviceVisitAttachments.deleteFailed'))
    } finally {
      setDeletingId(null)
    }
  }

  const handleDownload = async (attachment: Attachment) => {
    try {
      const response = await api.get(apiRelative(attachment.download_url), {
        responseType: 'blob',
      })

      const url = window.URL.createObjectURL(response.data)
      const a = document.createElement('a')
      a.href = url
      a.download = attachment.file_name
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('serviceVisitAttachments.downloadFailed'))
    }
  }

  const getFileIcon = (fileType?: string | null) => {
    if (!fileType) return <FileText className="w-4 h-4" />
    if (fileType.startsWith('image/')) return <Image className="w-4 h-4" />
    return <FileText className="w-4 h-4" />
  }

  const formatFileSize = (bytes?: number | null): string => {
    if (!bytes) return t('serviceVisitAttachments.unknownSize')
    if (bytes < 1024) return t('serviceVisitAttachments.sizeBytes', { size: bytes })
    if (bytes < 1024 * 1024) return t('serviceVisitAttachments.sizeKb', { size: (bytes / 1024).toFixed(1) })
    return t('serviceVisitAttachments.sizeMb', { size: (bytes / 1024 / 1024).toFixed(1) })
  }

  if (loading) {
    return (
      <div className="text-center py-4 text-garage-text-muted text-sm">
        {t('serviceVisitAttachments.loading')}
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-start gap-2 p-3 bg-danger/10 border border-danger/20 rounded-md">
        <AlertCircle className="w-4 h-4 text-danger flex-shrink-0 mt-0.5" />
        <p className="text-sm text-danger">{error}</p>
      </div>
    )
  }

  if (attachments.length === 0) {
    return (
      <div className="text-center py-4 text-garage-text-muted text-sm">
        <FileText className="w-8 h-8 mx-auto mb-2 opacity-50" />
        <p>{t('serviceVisitAttachments.empty')}</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
        {attachments.map((attachment) => (
          <div
            key={attachment.id}
            className="flex items-center justify-between p-3 bg-garage-bg border border-garage-border rounded-md hover:border-primary/50 transition-colors"
          >
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="text-garage-text-muted">{getFileIcon(attachment.file_type)}</div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-garage-text truncate">{attachment.file_name}</p>
                <p className="text-xs text-garage-text-muted">
                  {formatFileSize(attachment.file_size)} •{' '}
                  {formatDateForDisplay(attachment.uploaded_at.split('T')[0])}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => handleDownload(attachment)}
                className="p-2 text-primary hover:bg-primary/10 rounded transition-colors"
                aria-label={t('serviceVisitAttachments.download')}
                title={t('serviceVisitAttachments.download')}
              >
                <Download className="w-4 h-4" />
              </button>
              <button
                onClick={() => handleDelete(attachment.id)}
                disabled={deletingId === attachment.id}
                className="p-2 text-danger hover:bg-danger/10 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                aria-label={t('common:delete')}
                title={t('common:delete')}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
    </div>
  )
}

import { useState, useRef, type SyntheticEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Upload, X, FileText } from 'lucide-react'
import { useUploadDocument } from '../hooks/queries/useDocuments'

interface DocumentUploadProps {
  vin: string
  onSuccess: () => void
  onClose: () => void
}

export default function DocumentUpload({ vin, onSuccess, onClose }: DocumentUploadProps) {
  const { t } = useTranslation('vehicles')
  const uploadMutation = useUploadDocument(vin)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [title, setTitle] = useState('')
  const [documentType, setDocumentType] = useState<string>('')
  const [description, setDescription] = useState('')
  const [dragActive, setDragActive] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0])
    }
  }

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0])
    }
  }

  const handleFile = (selectedFile: File) => {
    // Validate file type
    const ext = selectedFile.name.split('.').pop()?.toLowerCase()
    const validExtensions = ['pdf', 'doc', 'docx', 'txt', 'jpg', 'jpeg', 'png', 'webp', 'xls', 'xlsx', 'csv']

    if (!ext || !validExtensions.includes(ext)) {
      setError(t('documentUpload.misc.invalidFileType'))
      return
    }

    // Validate file size (25MB)
    if (selectedFile.size > 25 * 1024 * 1024) {
      setError(t('documentUpload.misc.fileTooLarge'))
      return
    }

    setFile(selectedFile)
    setError(null)

    // Auto-populate title from filename if not set
    if (!title) {
      const fileName = selectedFile.name.replace(/\.[^/.]+$/, '') // Remove extension
      setTitle(fileName)
    }
  }

  const handleSubmit = async (e: SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!file) return

    setUploading(true)
    setError(null)

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('title', title)
      if (documentType) formData.append('document_type', documentType)
      if (description) formData.append('description', description)

      await uploadMutation.mutateAsync(formData)

      onSuccess()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('documentUpload.misc.errorOccurred'))
    } finally {
      setUploading(false)
    }
  }

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return t('documentUpload.misc.sizeZero')
    const k = 1024
    const sizes = [
      t('documentUpload.misc.unitBytes'),
      t('documentUpload.misc.unitKb'),
      t('documentUpload.misc.unitMb'),
    ]
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i]
  }

  return (
    <div className="fixed inset-0 modal-overlay flex items-center justify-center p-4 z-50">
      <div className="bg-garage-surface rounded-lg shadow-2xl max-w-2xl w-full border border-garage-border">
        <div className="bg-garage-surface border-b border-garage-border px-6 py-4 flex justify-between items-center rounded-t-lg">
          <h2 className="text-xl font-semibold text-garage-text">{t('documentUpload.title')}</h2>
          <button
            onClick={onClose}
            className="text-garage-text-muted hover:text-garage-text"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="bg-danger/10 border border-danger rounded-lg p-3">
              <p className="text-sm text-danger">{error}</p>
            </div>
          )}

          {!file ? (
            <div
              className={`border-2 border-dashed rounded-lg p-12 text-center transition-colors ${
                dragActive
                  ? 'border-primary bg-primary/10'
                  : 'border-garage-border hover:border-primary/50'
              }`}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
            >
              <Upload className="w-12 h-12 text-garage-text-muted mx-auto mb-4" />
              <p className="text-garage-text mb-2">
                {t('documentUpload.misc.dragDropPrompt')}
              </p>
              <p className="text-sm text-garage-text-muted mb-4">
                {t('documentUpload.misc.fileTypes')}
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.doc,.docx,.txt,.jpg,.jpeg,.png,.webp,.xls,.xlsx,.csv"
                onChange={handleFileInput}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="btn btn-primary rounded-lg transition-colors"
              >
                {t('documentUpload.misc.selectFile')}
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="bg-garage-bg border border-garage-border rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <FileText className="w-8 h-8 text-primary flex-shrink-0 mt-1" />
                  <div className="flex-1 min-w-0">
                    <p className="text-garage-text font-medium truncate">{file.name}</p>
                    <p className="text-sm text-garage-text-muted">{formatFileSize(file.size)}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setFile(null)
                      if (fileInputRef.current) fileInputRef.current.value = ''
                    }}
                    className="p-2 text-danger hover:bg-danger/10 rounded-full"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div>
                <label htmlFor="title" className="block text-sm font-medium text-garage-text mb-1">
                  {t('documentList.titleLabel')} <span className="text-danger">*</span>
                </label>
                <input
                  type="text"
                  id="title"
                  required
                  maxLength={200}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={t('documentUpload.misc.titlePlaceholder')}
                  className="w-full px-3 py-2 border border-garage-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary bg-garage-bg text-garage-text"
                />
              </div>

              <div>
                <label htmlFor="document_type" className="block text-sm font-medium text-garage-text mb-1">
                  {t('documentUpload.misc.documentTypeLabel')}
                </label>
                <select
                  id="document_type"
                  value={documentType}
                  onChange={(e) => setDocumentType(e.target.value)}
                  className="w-full px-3 py-2 border border-garage-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary bg-garage-bg text-garage-text"
                >
                  <option value="" className="bg-garage-bg text-garage-text">{t('documentList.selectType')}</option>
                  <option value="Insurance" className="bg-garage-bg text-garage-text">{t('documentUpload.misc.typeInsurance')}</option>
                  <option value="Registration" className="bg-garage-bg text-garage-text">{t('documentUpload.misc.typeRegistration')}</option>
                  <option value="Manual" className="bg-garage-bg text-garage-text">{t('documentUpload.misc.typeManual')}</option>
                  <option value="Receipt" className="bg-garage-bg text-garage-text">{t('documentUpload.misc.typeReceipt')}</option>
                  <option value="Inspection" className="bg-garage-bg text-garage-text">{t('documentUpload.misc.typeInspection')}</option>
                  <option value="Other" className="bg-garage-bg text-garage-text">{t('documentUpload.misc.typeOther')}</option>
                </select>
              </div>

              <div>
                <label htmlFor="description" className="block text-sm font-medium text-garage-text mb-1">
                  {t('documentList.descriptionLabel')}
                </label>
                <textarea
                  id="description"
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={t('documentUpload.misc.descriptionPlaceholder')}
                  className="w-full px-3 py-2 border border-garage-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary bg-garage-bg text-garage-text"
                />
              </div>
            </div>
          )}

          <div className="flex gap-3 pt-4">
            <button
              type="submit"
              disabled={uploading || !file || !title}
              className="flex items-center gap-2 btn btn-primary rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Upload className="w-4 h-4" />
              <span>{uploading ? t('documentUpload.uploading') : t('documentUpload.uploadBtn')}</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="btn btn-primary rounded-lg transition-colors"
            >
              {t('common:cancel')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

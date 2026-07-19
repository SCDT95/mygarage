import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FileText, Download, Calendar, FileSpreadsheet } from 'lucide-react'
import { toast } from 'sonner'
import api from '../services/api'
import { useCurrencyPreference } from '../hooks/useCurrencyPreference'

interface ReportsPanelProps {
  vin: string
}

export default function ReportsPanel({ vin }: ReportsPanelProps) {
  const { t } = useTranslation('analytics')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())
  const [isGenerating, setIsGenerating] = useState(false)
  const { currencyCode, locale } = useCurrencyPreference()

  const currentYear = new Date().getFullYear()
  const years = Array.from({ length: 10 }, (_, i) => currentYear - i)

  const handleDownloadPDF = async (reportType: string) => {
    setIsGenerating(true)
    try {
      const params = new URLSearchParams()
      if (reportType === 'service-history') {
        if (startDate) params.set('start_date', startDate)
        if (endDate) params.set('end_date', endDate)
      } else {
        params.set('year', String(selectedYear))
      }
      params.set('currency_code', currencyCode)
      params.set('locale', locale)

      const url = `/vehicles/${vin}/reports/${reportType}-pdf?${params.toString()}`
      const response = await api.get(url, { responseType: 'blob' })

      const blob = response.data
      const downloadUrl = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = downloadUrl
      a.download = `${reportType}_${vin}_${Date.now()}.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(downloadUrl)
    } catch (error) {
      console.error('PDF generation error:', error)
      const message = error instanceof Error ? error.message : t('reports.pdfError')
      toast.error(message)
    } finally {
      setIsGenerating(false)
    }
  }

  const handleDownloadCSV = async (reportType: string) => {
    setIsGenerating(true)
    try {
      let url = `/vehicles/${vin}/reports/${reportType}-csv?`

      if (reportType === 'service-history') {
        if (startDate) url += `start_date=${startDate}&`
        if (endDate) url += `end_date=${endDate}&`
      } else if (reportType === 'all-records') {
        url += `year=${selectedYear}`
      }

      const response = await api.get(url, { responseType: 'blob' })

      const blob = response.data
      const downloadUrl = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = downloadUrl
      a.download = `${reportType}_${vin}_${Date.now()}.csv`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(downloadUrl)
    } catch (error) {
      console.error('CSV export error:', error)
      const message = error instanceof Error ? error.message : t('reports.csvError')
      toast.error(message)
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-garage-text">{t('reports.title')}</h2>
      </div>

      {/* Date Range Selector */}
      <div className="bg-garage-surface border border-garage-border rounded-lg p-6">
        <h3 className="text-lg font-semibold text-garage-text mb-4 flex items-center gap-2">
          <Calendar className="w-5 h-5 text-primary-500" />
          {t('reports.dateRangeTitle')}
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-garage-text mb-2">
              {t('reports.startDate')}
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-3 py-2 bg-garage-bg border border-garage-border rounded-lg text-garage-text focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-garage-text mb-2">
              {t('reports.endDate')}
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-3 py-2 bg-garage-bg border border-garage-border rounded-lg text-garage-text focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
        </div>
      </div>

      {/* PDF Reports */}
      <div className="bg-garage-surface border border-garage-border rounded-lg p-6">
        <h3 className="text-lg font-semibold text-garage-text mb-4 flex items-center gap-2">
          <FileText className="w-5 h-5 text-danger-500" />
          {t('reports.pdfReports')}
        </h3>
        <div className="space-y-4">
          {/* Service History Report */}
          <div className="flex items-center justify-between p-4 bg-garage-bg border border-garage-border rounded-lg hover:border-primary-500 transition-colors">
            <div className="flex-1">
              <h4 className="font-medium text-garage-text">{t('reports.serviceHistoryTitle')}</h4>
              <p className="text-sm text-garage-text-muted mt-1">
                {t('reports.serviceHistoryDesc')}{' '}
                {startDate || endDate ? t('reports.rangeCustom') : t('reports.rangeAll')}
              </p>
            </div>
            <button
              onClick={() => handleDownloadPDF('service-history')}
              disabled={isGenerating}
              aria-label={t('reports.downloadPdf')}
              className="ml-4 flex items-center gap-2 px-4 py-2 btn btn-primary rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">{t('reports.downloadPdf')}</span>
            </button>
          </div>

          {/* Annual Cost Summary */}
          <div className="flex items-center justify-between p-4 bg-garage-bg border border-garage-border rounded-lg hover:border-primary-500 transition-colors">
            <div className="flex-1">
              <h4 className="font-medium text-garage-text">{t('reports.annualCostTitle')}</h4>
              <p className="text-sm text-garage-text-muted mt-1">
                {t('reports.annualCostDesc')}
              </p>
              <div className="mt-2">
                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(Number(e.target.value))}
                  aria-label={t('reports.selectYear')}
                  className="px-3 py-1 bg-garage-surface border border-garage-border rounded text-garage-text text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  {years.map(year => (
                    <option key={year} value={year}>{year}</option>
                  ))}
                </select>
              </div>
            </div>
            <button
              onClick={() => handleDownloadPDF('cost-summary')}
              disabled={isGenerating}
              aria-label={t('reports.downloadPdf')}
              className="ml-4 flex items-center gap-2 px-4 py-2 btn btn-primary rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">{t('reports.downloadPdf')}</span>
            </button>
          </div>

          {/* Tax Deduction Report */}
          <div className="flex items-center justify-between p-4 bg-garage-bg border border-garage-border rounded-lg hover:border-primary-500 transition-colors">
            <div className="flex-1">
              <h4 className="font-medium text-garage-text">{t('reports.taxDeductionTitle')}</h4>
              <p className="text-sm text-garage-text-muted mt-1">
                {t('reports.taxDeductionDesc')}
              </p>
              <div className="mt-2">
                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(Number(e.target.value))}
                  aria-label={t('reports.selectYear')}
                  className="px-3 py-1 bg-garage-surface border border-garage-border rounded text-garage-text text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  {years.map(year => (
                    <option key={year} value={year}>{year}</option>
                  ))}
                </select>
              </div>
            </div>
            <button
              onClick={() => handleDownloadPDF('tax-deduction')}
              disabled={isGenerating}
              aria-label={t('reports.downloadPdf')}
              className="ml-4 flex items-center gap-2 px-4 py-2 btn btn-primary rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">{t('reports.downloadPdf')}</span>
            </button>
          </div>
        </div>
      </div>

      {/* CSV Exports */}
      <div className="bg-garage-surface border border-garage-border rounded-lg p-6">
        <h3 className="text-lg font-semibold text-garage-text mb-4 flex items-center gap-2">
          <FileSpreadsheet className="w-5 h-5 text-success-500" />
          {t('reports.csvExports')}
        </h3>
        <div className="space-y-4">
          {/* Service History CSV */}
          <div className="flex items-center justify-between p-4 bg-garage-bg border border-garage-border rounded-lg hover:border-primary-500 transition-colors">
            <div className="flex-1">
              <h4 className="font-medium text-garage-text">{t('reports.serviceHistoryCsvTitle')}</h4>
              <p className="text-sm text-garage-text-muted mt-1">
                {t('reports.serviceHistoryCsvDesc')}{' '}
                {startDate || endDate ? t('reports.rangeCustom') : t('reports.rangeAll')}
              </p>
            </div>
            <button
              onClick={() => handleDownloadCSV('service-history')}
              disabled={isGenerating}
              aria-label={t('reports.exportCsv')}
              className="ml-4 flex items-center gap-2 px-4 py-2 btn btn-primary rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">{t('reports.exportCsv')}</span>
            </button>
          </div>

          {/* All Records CSV */}
          <div className="flex items-center justify-between p-4 bg-garage-bg border border-garage-border rounded-lg hover:border-primary-500 transition-colors">
            <div className="flex-1">
              <h4 className="font-medium text-garage-text">{t('reports.allRecordsCsvTitle')}</h4>
              <p className="text-sm text-garage-text-muted mt-1">
                {t('reports.allRecordsCsvDesc')}
              </p>
              <div className="mt-2">
                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(Number(e.target.value))}
                  aria-label={t('reports.selectYear')}
                  className="px-3 py-1 bg-garage-surface border border-garage-border rounded text-garage-text text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  <option value="">{t('reports.allYears')}</option>
                  {years.map(year => (
                    <option key={year} value={year}>{year}</option>
                  ))}
                </select>
              </div>
            </div>
            <button
              onClick={() => handleDownloadCSV('all-records')}
              disabled={isGenerating}
              aria-label={t('reports.exportCsv')}
              className="ml-4 flex items-center gap-2 px-4 py-2 btn btn-primary rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">{t('reports.exportCsv')}</span>
            </button>
          </div>
        </div>
      </div>

      {isGenerating && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-garage-surface rounded-lg p-6 max-w-sm">
            <div className="flex items-center gap-3">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500"></div>
              <p className="text-garage-text">{t('reports.generating')}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

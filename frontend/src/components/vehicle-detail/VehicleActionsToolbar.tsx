import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import {
  Upload, Download, BarChart3, Share2, Edit, ArrowRightLeft, Trash2, MoreVertical,
} from 'lucide-react'

interface VehicleActionsToolbarProps {
  vin: string
  isAdmin: boolean
  importing: boolean
  exporting: boolean
  isOnline: boolean
  onImportClick: () => void
  onExport: () => void
  onOpenModal: (modal: 'remove' | 'transfer' | 'sharing') => void
  onOpenMobileMenu: () => void
}

/**
 * Vehicle Detail actions. Mechanically extracted from VehicleDetail.tsx (P5
 * Task 1, verbatim — no restyle). The primary/secondary toolbar split +
 * Equipment control is Task 4.
 */
export default function VehicleActionsToolbar({
  vin, isAdmin, importing, exporting, isOnline,
  onImportClick, onExport, onOpenModal, onOpenMobileMenu,
}: VehicleActionsToolbarProps) {
  const { t } = useTranslation('vehicles')
  const navigate = useNavigate()
  return (
    <>
      {/* Desktop buttons - hidden on mobile */}
      <div className="hidden md:flex items-center space-x-2">
        <button
          onClick={onImportClick}
          disabled={importing || !isOnline}
          className="flex items-center space-x-2 px-5 py-3 btn btn-primary rounded-lg disabled:opacity-50"
          title={t('detail.misc.importTooltip')}
        >
          <Upload className="w-4 h-4" />
          <span>{importing ? t('detail.importing') : t('detail.import')}</span>
        </button>
        <button
          onClick={onExport}
          disabled={exporting || !isOnline}
          className="flex items-center space-x-2 px-5 py-3 btn btn-primary rounded-lg disabled:opacity-50"
          title={t('detail.exportTooltip')}
        >
          <Download className="w-4 h-4" />
          <span>{exporting ? t('detail.exporting') : t('detail.export')}</span>
        </button>
        <button
          onClick={() => navigate(`/vehicles/${vin}/analytics`)}
          className="flex items-center space-x-2 px-5 py-3 btn btn-primary rounded-lg"
          title={t('detail.analyticsTooltip')}
        >
          <BarChart3 className="w-4 h-4" />
          <span>{t('detail.analytics')}</span>
        </button>
        <button
          onClick={() => onOpenModal('sharing')}
          className="flex items-center space-x-2 px-5 py-3 btn btn-primary rounded-lg"
          title={t('detail.shareTooltip')}
        >
          <Share2 className="w-4 h-4" />
          <span>{t('detail.share')}</span>
        </button>
        <button
          onClick={() => navigate(`/vehicles/${vin}/edit`)}
          className="flex items-center space-x-2 px-5 py-3 btn btn-primary rounded-lg"
        >
          <Edit className="w-4 h-4" />
          <span>{t('common:edit')}</span>
        </button>
        {isAdmin && (
          <button
            onClick={() => onOpenModal('transfer')}
            className="flex items-center space-x-2 px-5 py-3 bg-amber-900/30 border border-amber-700 text-amber-400 rounded-lg hover:bg-amber-800/50 transition-colors"
            title={t('detail.misc.transferTooltip')}
          >
            <ArrowRightLeft className="w-4 h-4" />
            <span>{t('detail.transfer')}</span>
          </button>
        )}
        <button
          onClick={() => onOpenModal('remove')}
          className="flex items-center space-x-2 px-5 py-3 bg-red-900/30 border border-red-700 text-red-400 rounded-lg hover:bg-red-800/50 transition-colors"
        >
          <Trash2 className="w-4 h-4" />
          <span>{t('detail.remove')}</span>
        </button>
      </div>

      {/* Mobile overflow menu button — absolute so it stays top-right without affecting layout */}
      <button
        onClick={onOpenMobileMenu}
        className="md:hidden absolute top-0 right-0 p-2 text-garage-text-muted hover:text-garage-text rounded-lg transition-colors"
        title={t('detail.misc.moreActions')}
      >
        <MoreVertical className="w-5 h-5" />
      </button>
    </>
  )
}

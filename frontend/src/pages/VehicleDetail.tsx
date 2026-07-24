/**
 * Vehicle Detail Page - Tabbed interface for vehicle information
 * Tabs: Overview, Photos, Service, Fuel, Notes
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams, useNavigate, Link, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import {
  ArrowLeft,
  Image,
  Wrench,
  Fuel,
  Bell,
  FileText,
  DollarSign,
  Info,
  Gauge,
  BarChart3,
  Shield,
  AlertTriangle,
  CreditCard,
  MapPin,
  Radio,
  Activity,
  Clock,
  Droplets,
  Package,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import vehicleService from '../services/vehicleService'
import api from '../services/api'
import { withBase } from '../utils/basePath'
import type { Vehicle } from '../types/vehicle'
import type { LastLocation } from '../types/trips'
import { isDieselFuelType } from '../constants/fuel'
import ServiceTab from '../components/tabs/ServiceTab'
import FuelTab from '../components/tabs/FuelTab'
import OdometerTab from '../components/tabs/OdometerTab'
import PhotosTab from '../components/tabs/PhotosTab'
import DocumentsTab from '../components/tabs/DocumentsTab'
import NotesTab from '../components/tabs/NotesTab'
import WarrantiesTab from '../components/tabs/WarrantiesTab'
import InsuranceTab from '../components/tabs/InsuranceTab'
import ReportsTab from '../components/tabs/ReportsTab'
import TollsTab from '../components/tabs/TollsTab'
import SuppliesUsedTab from '../components/SuppliesUsedTab'
import SafetyTab from '../components/tabs/SafetyTab'
import TaxRecordList from '../components/TaxRecordList'
import SpotRentalsTab from '../components/tabs/SpotRentalsTab'
import PropaneTab from '../components/tabs/PropaneTab'
import DEFTab from '../components/tabs/DEFTab'
import LiveLinkLiveTab from '../components/tabs/LiveLinkLiveTab'
import LiveLinkDTCsTab from '../components/tabs/LiveLinkDTCsTab'
import LiveLinkSessionsTab from '../components/tabs/LiveLinkSessionsTab'
import LiveLinkChartsTab from '../components/tabs/LiveLinkChartsTab'
import LiveLinkTripsTab from '../components/tabs/LiveLinkTripsTab'
import ReminderList from '../components/ReminderList'
import SubTabNav from '../components/SubTabNav'
import VehicleHero from '../components/vehicle-detail/VehicleHero'
import VehicleActionsToolbar from '../components/vehicle-detail/VehicleActionsToolbar'
import VehiclePrimaryTabs from '../components/vehicle-detail/VehiclePrimaryTabs'
import VehicleOverviewTab from '../components/vehicle-detail/VehicleOverviewTab'
import VehicleMobileActionsSheet from '../components/vehicle-detail/VehicleMobileActionsSheet'
import { livelinkService } from '../services/livelinkService'
import WindowStickerUpload from '../components/WindowStickerUpload'
import VehicleRemoveModal from '../components/modals/VehicleRemoveModal'
import VehicleTransferWizard from '../components/modals/VehicleTransferWizard'
import VehicleSharingModal from '../components/modals/VehicleSharingModal'
import TorqueSourceModal from '../components/modals/TorqueSourceModal'
import { useOnlineStatus } from '../hooks/useOnlineStatus'
import { useAuth } from '../contexts/AuthContext'

type ApiError = {
  response?: {
    data?: {
      detail?: string
    }
  }
  message?: string
}

const getApiErrorMessage = (error: unknown, fallback: string) => {
  if (error && typeof error === 'object') {
    const apiError = error as ApiError
    if (apiError.response?.data?.detail) {
      return apiError.response.data.detail
    }
    if (apiError.message) {
      return apiError.message
    }
  }

  if (error instanceof Error) {
    return error.message
  }

  return fallback
}

/** Per-record-type tallies returned by the JSON import endpoint. */
type ImportSectionResult = {
  success_count: number
  skipped_count: number
  error_count: number
}

export type ModalType = 'remove' | 'transfer' | 'sharing' | 'windowSticker' | 'torqueSource' | null
export type PrimaryTabType = 'overview' | 'media' | 'maintenance' | 'fuel' | 'tracking' | 'financial' | 'livelink'
export type SubTabType = 'photos' | 'documents' | 'service' | 'fuel' | 'def' | 'propane' | 'odometer' | 'notes' | 'warranties' | 'insurance' | 'tax' | 'tolls' | 'spotrentals' | 'suppliesused' | 'recalls' | 'reports' | 'reminders' | 'live' | 'dtcs' | 'sessions' | 'charts' | 'trips'

export default function VehicleDetail() {
  const { t } = useTranslation('vehicles')
  const { vin } = useParams<{ vin: string }>()
  const navigate = useNavigate()
  const { isAdmin } = useAuth()
  const [searchParams] = useSearchParams()
  const [vehicle, setVehicle] = useState<Vehicle | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activePrimaryTab, setActivePrimaryTab] = useState<PrimaryTabType>('overview')
  const [activeSubTab, setActiveSubTab] = useState<SubTabType | null>(null)
  const [openModal, setOpenModal] = useState<ModalType>(null)
  const [exporting, setExporting] = useState(false)
  const [importing, setImporting] = useState(false)
  const [fromCache, setFromCache] = useState(false)
  const [showMobileMenu, setShowMobileMenu] = useState(false)
  const [hasLiveLinkDevice, setHasLiveLinkDevice] = useState(false)
  const [lastLocation, setLastLocation] = useState<LastLocation | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const isOnline = useOnlineStatus()
  const loadVehicle = useCallback(async () => {
    if (!vin) return
    const cacheKey = `vehicle-cache-${vin}`
    setLoading(true)
    setError(null)
    setFromCache(false)

    try {
      const data = await vehicleService.get(vin)
      setVehicle(data)
      localStorage.setItem(cacheKey, JSON.stringify({ timestamp: Date.now(), data }))
    } catch (error) {
      if (!navigator.onLine) {
        const cached = localStorage.getItem(cacheKey)
        if (cached) {
          try {
            const parsed = JSON.parse(cached)
            setVehicle(parsed.data)
            setFromCache(true)
            return
          } catch {
            localStorage.removeItem(cacheKey)
          }
        }
      }
      setError(getApiErrorMessage(error, t('detail.misc.loadError')))
    } finally {
      setLoading(false)
    }
  }, [vin, t])

  useEffect(() => {
    loadVehicle()
  }, [loadVehicle])

  // Check if vehicle has a linked LiveLink device
  useEffect(() => {
    const checkLiveLinkDevice = async () => {
      if (!vin) return
      try {
        const hasDevice = await livelinkService.hasLinkedDevice(vin)
        setHasLiveLinkDevice(hasDevice)
      } catch {
        // Silently fail - LiveLink tab just won't show
        setHasLiveLinkDevice(false)
      }
    }
    checkLiveLinkDevice()
  }, [vin])

  // Fetch the vehicle's most-recent GPS location for the Overview "Last seen
  // here" card (Task 16). Independent of hasLiveLinkDevice: Torque Pro
  // sources can post location data before any LiveLink device exists, and
  // the Overview tab (unlike the LiveLink primary tab) is always present.
  useEffect(() => {
    const fetchLastLocation = async () => {
      if (!vin) return
      try {
        const location = await livelinkService.getLastLocation(vin)
        setLastLocation(location)
      } catch {
        // Silently fail - card just won't show
        setLastLocation(null)
      }
    }
    fetchLastLocation()
  }, [vin])

  // Handle URL tab parameter from calendar navigation
  useEffect(() => {
    const tabParam = searchParams.get('tab')
    if (!tabParam) return

    // Map calendar tab parameter to primary + sub tab
    const tabMapping: Record<string, { primary: PrimaryTabType; sub: SubTabType }> = {
      'insurance': { primary: 'financial', sub: 'insurance' },
      'propane': { primary: 'fuel', sub: 'propane' },
      'def': { primary: 'fuel', sub: 'def' },
      'warranties': { primary: 'financial', sub: 'warranties' },
      'service': { primary: 'maintenance', sub: 'service' },
      'notes': { primary: 'tracking', sub: 'notes' },
      'fuel': { primary: 'fuel', sub: 'fuel' },
      'odometer': { primary: 'maintenance', sub: 'odometer' },
      'photos': { primary: 'media', sub: 'photos' },
      'documents': { primary: 'media', sub: 'documents' },
      'tax': { primary: 'financial', sub: 'tax' },
      'tolls': { primary: 'financial', sub: 'tolls' },
      'spotrentals': { primary: 'financial', sub: 'spotrentals' },
      'recalls': { primary: 'maintenance', sub: 'recalls' },
      'reports': { primary: 'tracking', sub: 'reports' },
      'reminders': { primary: 'tracking', sub: 'reminders' },
      'live': { primary: 'livelink', sub: 'live' },
      'dtcs': { primary: 'livelink', sub: 'dtcs' },
      'sessions': { primary: 'livelink', sub: 'sessions' },
      'charts': { primary: 'livelink', sub: 'charts' },
    }

    const mapping = tabMapping[tabParam]
    if (mapping) {
      setActivePrimaryTab(mapping.primary)
      setActiveSubTab(mapping.sub)
    }
  }, [searchParams])

  const handleVehicleRemoved = () => {
    // Navigate home after vehicle is removed (archived or deleted)
    navigate('/')
  }

  const handleExportJSON = async () => {
    if (!vin) return
    if (!isOnline) {
      toast.error(t('detail.connectToExport'))
      return
    }

    setExporting(true)
    try {
      const response = await api.get(`/export/vehicles/${vin}/json`, {
        responseType: 'blob'
      })

      // Get the filename from Content-Disposition header
      const contentDisposition = response.headers['content-disposition']
      const filenameMatch = contentDisposition?.match(/filename="(.+)"/)
      const filename = filenameMatch ? filenameMatch[1] : 'vehicle_data.json'

      // Download the file
      const blob = response.data
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
      toast.success(t('detail.exportSuccess'))
    } catch (err) {
      toast.error(t('detail.exportError'), {
        description: err instanceof Error ? err.message : undefined
      })
    } finally {
      setExporting(false)
    }
  }

  const handleImportClick = () => {
    fileInputRef.current?.click()
  }

  const handleImportJSON = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file || !vin) return
    if (!isOnline) {
      toast.error(t('detail.connectToImport'))
      return
    }

    setImporting(true)
    try {
      const formData = new FormData()
      formData.append('file', file)

      const response = await api.post(`/import/vehicles/${vin}/json`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      })
      const result = response.data

      // Show results
      const sections: Array<[string, ImportSectionResult | undefined]> = [
        [t('detail.misc.importServiceRecords'), result.service_records],
        [t('detail.misc.importFuelRecords'), result.fuel_records],
        [t('detail.misc.importOdometerRecords'), result.odometer_records],
        [t('detail.misc.importMaintenanceRecords'), result.reminders],
        [t('noteList.title'), result.notes],
      ]

      let message = `${t('detail.misc.importSummaryHeading')}\n`
      for (const [label, section] of sections) {
        if (!section) continue
        message += `\n${label}: ✓ ${t('detail.misc.importedCount', { count: section.success_count })}`
        if (section.skipped_count > 0) {
          message += `, ○ ${t('detail.misc.skippedCount', { count: section.skipped_count })}`
        }
        if (section.error_count > 0) {
          message += `, ✗ ${t('detail.misc.errorCount', { count: section.error_count })}`
        }
      }

      toast.success(t('detail.importSuccess'), {
        description: message
      })

      // Reload the vehicle data
      await loadVehicle()
    } catch (err) {
      toast.error(t('detail.importError'), {
        description: err instanceof Error ? err.message : undefined
      })
    } finally {
      setImporting(false)
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  // Handle primary tab click
  const handlePrimaryTabClick = (tabId: PrimaryTabType) => {
    setActivePrimaryTab(tabId)

    // Set default sub-tab when switching primary tabs
    switch (tabId) {
      case 'media':
        setActiveSubTab('photos')
        break
      case 'maintenance':
        setActiveSubTab('service')
        break
      case 'fuel':
        // Fuel group is fuel/def/propane; pick the first sub-tab visible for this
        // vehicle (propane-only trailers aren't motorized, so 'fuel' would be hidden)
        setActiveSubTab(isMotorized ? 'fuel' : hasPropane ? 'propane' : hasDEF ? 'def' : 'fuel')
        break
      case 'tracking':
        setActiveSubTab('notes')
        break
      case 'financial':
        setActiveSubTab('warranties')
        break
      case 'overview':
        setActiveSubTab(null)
        break
      case 'livelink':
        setActiveSubTab('live')
        break
    }
  }

  // Handle sub-tab click
  const handleSubTabClick = (subTabId: string) => {
    setActiveSubTab(subTabId as SubTabType)
  }

  // Download window sticker with authentication
  const handleDownloadWindowSticker = async () => {
    if (!vin) return
    try {
      const response = await api.get(`/vehicles/${vin}/window-sticker/file`, {
        responseType: 'blob',
      })
      const contentTypeHeader = response.headers['content-type']
      const contentType = typeof contentTypeHeader === 'string' ? contentTypeHeader : undefined
      const blob = new Blob([response.data], { type: contentType })
      const url = window.URL.createObjectURL(blob)
      window.open(url, '_blank')
      // Clean up after a delay
      setTimeout(() => window.URL.revokeObjectURL(url), 10000)
    } catch {
      toast.error(t('detail.windowStickerDownloadError'))
    }
  }

  // Check if vehicle is motorized (excludes non-motorized trailers, fifth wheels, and travel trailers)
  // RVs ARE motorized and keep fuel/odometer tabs
  const isMotorized = vehicle?.vehicle_type &&
    !['Trailer', 'FifthWheel', 'TravelTrailer'].includes(vehicle.vehicle_type)

  // Check if vehicle is a fifth wheel, travel trailer, or RV (for propane tracking)
  const hasPropane = vehicle?.vehicle_type &&
    ['RV', 'FifthWheel', 'TravelTrailer'].includes(vehicle.vehicle_type)

  const isDiesel = isDieselFuelType(vehicle?.fuel_type)

  // Check if vehicle has DEF tracking (diesel vehicles or manually enabled).
  // Kept as an OR so legacy non-diesel DEF history remains visible — the DEF
  // tab itself renders read-only when the vehicle isn't diesel.
  const hasDEF = isDiesel ||
    (vehicle?.def_tank_capacity_liters != null && Number(vehicle.def_tank_capacity_liters) > 0)

  // Check if vehicle is RV, Fifth Wheel, or Travel Trailer (for spot rentals)
  const isRVOrFifthWheel = vehicle?.vehicle_type &&
    ['RV', 'FifthWheel', 'TravelTrailer'].includes(vehicle.vehicle_type)

  // Primary tabs configuration
  const primaryTabs = [
    {
      id: 'overview' as const,
      label: t('detail.tabs.overview'),
      icon: Info,
      hasSubTabs: false
    },
    {
      id: 'media' as const,
      label: t('detail.tabs.media'),
      icon: Image,
      hasSubTabs: true
    },
    {
      id: 'maintenance' as const,
      label: t('detail.tabs.maintenance'),
      icon: Wrench,
      hasSubTabs: true
    },
    // Fuel tab — groups fuel/DEF/propane fill-ups; shown when any is relevant
    ...((isMotorized || hasDEF || hasPropane) ? [{
      id: 'fuel' as const,
      label: t('detail.tabs.fuel'),
      icon: Fuel,
      hasSubTabs: true
    }] : []),
    {
      id: 'tracking' as const,
      label: t('detail.tabs.tracking'),
      icon: Bell,
      hasSubTabs: true
    },
    {
      id: 'financial' as const,
      label: t('detail.tabs.financial'),
      icon: DollarSign,
      hasSubTabs: true
    },
    // LiveLink tab - only visible when vehicle has linked device
    ...(hasLiveLinkDevice ? [{
      id: 'livelink' as const,
      label: 'LiveLink',
      icon: Radio,
      hasSubTabs: true
    }] : []),
  ]

  // Sub-tabs for each primary tab
  const subTabsConfig: Record<string, Array<{ id: SubTabType; label: string; icon: LucideIcon; visible?: boolean }>> = {
    media: [
      { id: 'photos' as const, label: t('detail.misc.photos'), icon: Image },
      { id: 'documents' as const, label: t('documentList.title'), icon: FileText },
    ],
    maintenance: [
      { id: 'service' as const, label: t('vehicleStats.service'), icon: Wrench },
      { id: 'odometer' as const, label: t('detail.misc.odometer'), icon: Gauge, visible: isMotorized },
      { id: 'recalls' as const, label: t('detail.misc.recalls'), icon: AlertTriangle },
    ],
    fuel: [
      { id: 'fuel' as const, label: t('detail.tabs.fuel'), icon: Fuel, visible: isMotorized },
      // i18n-exempt — DEF is an untranslated acronym (Diesel Exhaust Fluid)
      { id: 'def' as const, label: 'DEF', icon: Droplets, visible: hasDEF },
      { id: 'propane' as const, label: t('detail.misc.propane'), icon: Fuel, visible: hasPropane },
    ],
    tracking: [
      { id: 'notes' as const, label: t('noteList.title'), icon: FileText },
      { id: 'reminders' as const, label: t('reminderList.title'), icon: Bell },
      { id: 'reports' as const, label: t('detail.misc.reports'), icon: BarChart3 },
    ],
    financial: [
      { id: 'warranties' as const, label: t('warrantyList.title'), icon: Shield },
      { id: 'insurance' as const, label: t('detail.misc.insurance'), icon: Shield },
      { id: 'tax' as const, label: t('detail.misc.taxRegistration'), icon: DollarSign },
      { id: 'tolls' as const, label: t('detail.misc.tolls'), icon: CreditCard },
      { id: 'spotrentals' as const, label: t('spotRentalList.title'), icon: MapPin, visible: isRVOrFifthWheel },
      { id: 'suppliesused' as const, label: t('detail.misc.supplies'), icon: Package },
    ],
    livelink: [
      { id: 'live' as const, label: t('detail.misc.live'), icon: Activity },
      // i18n-exempt — DTCs is an untranslated acronym (Diagnostic Trouble Codes)
      { id: 'dtcs' as const, label: 'DTCs', icon: AlertTriangle },
      { id: 'sessions' as const, label: t('detail.misc.sessions'), icon: Clock },
      { id: 'charts' as const, label: t('detail.misc.charts'), icon: BarChart3 },
      { id: 'trips' as const, label: t('detail.misc.trips'), icon: MapPin },
    ],
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen" role="status" aria-label={t('detail.loading')}>
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        <span className="sr-only">{t('detail.loading')}</span>
      </div>
    )
  }

  if (error || !vehicle) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="bg-danger/10 border border-danger rounded-lg p-6 text-center">
          <p className="text-danger mb-4">{error || t('detail.vehicleNotFound')}</p>
          <Link
            to="/"
            className="inline-flex items-center space-x-2 px-4 py-2 bg-garage-surface border border-garage-border rounded-lg hover:bg-garage-bg transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>{t('detail.backToDashboard')}</span>
          </Link>
        </div>
      </div>
    )
  }

  const photoUrl = vehicle.main_photo
    ? withBase(`/api/vehicles/${vehicle.vin}/photos/${vehicle.main_photo.split('/').pop()}`)
    : null

  return (
    <div className="min-h-screen bg-garage-bg pb-8">
      {/* Header */}
      <div className="bg-garage-surface border-b border-garage-border">
        <div className="container mx-auto px-4 py-6">
          {/* Header: relative container so mobile MoreVertical can be absolute-positioned */}
          <div className="relative md:flex md:items-start md:justify-between">
            <VehicleHero vehicle={vehicle} photoUrl={photoUrl} fromCache={fromCache} />

            {/* Hidden file input for import */}
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={handleImportJSON}
              className="hidden"
            />

            <VehicleActionsToolbar
              vin={vin!}
              isAdmin={isAdmin}
              importing={importing}
              exporting={exporting}
              isOnline={isOnline}
              onImportClick={handleImportClick}
              onExport={handleExportJSON}
              onOpenModal={setOpenModal}
              onOpenMobileMenu={() => setShowMobileMenu(true)}
            />
          </div>

          <VehiclePrimaryTabs
            tabs={primaryTabs}
            activeTab={activePrimaryTab}
            onTabClick={handlePrimaryTabClick}
          />
        </div>
      </div>

      {/* Sub-tabs (if applicable) */}
      {activePrimaryTab !== 'overview' && subTabsConfig[activePrimaryTab] && (
        <SubTabNav
          tabs={subTabsConfig[activePrimaryTab]}
          activeTab={activeSubTab || ''}
          onTabChange={handleSubTabClick}
          label={t('detail.misc.subSections')}
        />
      )}

      {/* Tab Content */}
      <div
        role="tabpanel"
        id={`panel-${activePrimaryTab}`}
        aria-labelledby={`tab-mobile-${activePrimaryTab} tab-desktop-${activePrimaryTab}`}
        className="container mx-auto px-4 py-8"
      >
        {activePrimaryTab === 'overview' && (
          <VehicleOverviewTab
            vin={vin!}
            vehicle={vehicle}
            lastLocation={lastLocation}
            onOpenModal={setOpenModal}
            onDownloadWindowSticker={handleDownloadWindowSticker}
          />
        )}

        {/* Media Sub-tabs */}
        {activePrimaryTab === 'media' && activeSubTab === 'photos' && vin && <PhotosTab vin={vin} />}
        {activePrimaryTab === 'media' && activeSubTab === 'documents' && vin && <DocumentsTab vin={vin} />}

        {/* Maintenance & Fuel Sub-tabs */}
        {activePrimaryTab === 'maintenance' && activeSubTab === 'service' && vin && <ServiceTab vin={vin} />}
        {activePrimaryTab === 'fuel' && activeSubTab === 'fuel' && vin && <FuelTab vin={vin} />}
        {activePrimaryTab === 'fuel' && activeSubTab === 'def' && vin && <DEFTab vin={vin} isDiesel={isDiesel} />}
        {activePrimaryTab === 'fuel' && activeSubTab === 'propane' && vin && <PropaneTab vin={vin} />}
        {activePrimaryTab === 'maintenance' && activeSubTab === 'odometer' && vin && <OdometerTab vin={vin} />}
        {activePrimaryTab === 'maintenance' && activeSubTab === 'recalls' && vin && <SafetyTab vin={vin} />}

        {/* Tracking Sub-tabs */}
        {activePrimaryTab === 'tracking' && activeSubTab === 'notes' && vin && <NotesTab vin={vin} />}
        {activePrimaryTab === 'tracking' && activeSubTab === 'reminders' && vin && <ReminderList vin={vin} />}
        {activePrimaryTab === 'tracking' && activeSubTab === 'reports' && vin && <ReportsTab vin={vin} />}

        {/* Financial Sub-tabs */}
        {activePrimaryTab === 'financial' && activeSubTab === 'warranties' && vin && <WarrantiesTab vin={vin} />}
        {activePrimaryTab === 'financial' && activeSubTab === 'insurance' && vin && <InsuranceTab vin={vin} />}
        {activePrimaryTab === 'financial' && activeSubTab === 'tax' && vin && <TaxRecordList vin={vin} />}
        {activePrimaryTab === 'financial' && activeSubTab === 'tolls' && vin && <TollsTab vin={vin} />}
        {activePrimaryTab === 'financial' && activeSubTab === 'spotrentals' && vin && <SpotRentalsTab vin={vin} />}
        {activePrimaryTab === 'financial' && activeSubTab === 'suppliesused' && vin && <SuppliesUsedTab vin={vin} />}

        {/* LiveLink Sub-tabs */}
        {activePrimaryTab === 'livelink' && activeSubTab === 'live' && vin && <LiveLinkLiveTab vin={vin} />}
        {activePrimaryTab === 'livelink' && activeSubTab === 'dtcs' && vin && <LiveLinkDTCsTab vin={vin} />}
        {activePrimaryTab === 'livelink' && activeSubTab === 'sessions' && vin && <LiveLinkSessionsTab vin={vin} />}
        {activePrimaryTab === 'livelink' && activeSubTab === 'charts' && vin && <LiveLinkChartsTab vin={vin} />}
        {activePrimaryTab === 'livelink' && activeSubTab === 'trips' && vin && <LiveLinkTripsTab vin={vin} />}
      </div>

      {/* Vehicle Remove Modal */}
      <VehicleRemoveModal
        isOpen={openModal === 'remove'}
        onClose={() => setOpenModal(null)}
        vehicle={vehicle}
        onConfirm={handleVehicleRemoved}
      />

      {/* Vehicle Transfer Wizard */}
      {vin && vehicle && (
        <VehicleTransferWizard
          isOpen={openModal === 'transfer'}
          onClose={() => setOpenModal(null)}
          vin={vin}
          vehicleNickname={vehicle.nickname}
          onTransferComplete={() => {
            // Reload vehicle to get updated owner
            loadVehicle()
          }}
        />
      )}

      {/* Vehicle Sharing Modal */}
      {vin && vehicle && (
        <VehicleSharingModal
          isOpen={openModal === 'sharing'}
          onClose={() => setOpenModal(null)}
          vin={vin}
          vehicleNickname={vehicle.nickname}
        />
      )}

      {/* Torque Source Modal (Task 13, owner-reachable) */}
      {vin && (
        <TorqueSourceModal
          isOpen={openModal === 'torqueSource'}
          onClose={() => setOpenModal(null)}
          vin={vin}
        />
      )}

      {/* Mobile Actions Menu */}
      {showMobileMenu && (
        <VehicleMobileActionsSheet
          vin={vin!}
          isAdmin={isAdmin}
          importing={importing}
          exporting={exporting}
          isOnline={isOnline}
          onImportClick={handleImportClick}
          onExport={handleExportJSON}
          onOpenModal={setOpenModal}
          onClose={() => setShowMobileMenu(false)}
        />
      )}

      {/* Window Sticker Upload Modal */}
      {openModal === 'windowSticker' && vin && (
        <WindowStickerUpload
          vin={vin}
          onSuccess={() => {
            setOpenModal(null)
            loadVehicle()
            toast.success(t('detail.windowStickerUploaded'))
          }}
          onClose={() => setOpenModal(null)}
        />
      )}
    </div>
  )
}

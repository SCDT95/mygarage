import { useState, useEffect, useMemo, useCallback } from 'react'
import { useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Plus, Car as CarIcon, RefreshCw, ChevronDown } from 'lucide-react'
import VehicleStatisticsCard from '../components/VehicleStatisticsCard'
import VehicleWizard from '../components/VehicleWizard'
import { PageHeader, Dropdown, Button } from '../components/ui'
import type { DropdownItem } from '../components/ui'
import type { DashboardResponse } from '../types/dashboard'
import api from '../services/api'

type SortOption = 'name' | 'year-new' | 'year-old' | 'maintenance'
type FilterOption = 'all' | 'owned' | 'shared'

export default function Dashboard() {
  const { t } = useTranslation('vehicles')
  const location = useLocation()
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showWizard, setShowWizard] = useState(false)
  const [sortBy, setSortBy] = useState<SortOption>('name')
  const [filterBy, setFilterBy] = useState<FilterOption>('all')

  const loadDashboard = useCallback(async () => {
    setError(null)
    try {
      const response = await api.get('/dashboard')
      setDashboard(response.data)
    } catch {
      setError(t('dashboard.loadError'))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    // Load dashboard data when component mounts or navigation occurs
    loadDashboard()
  }, [location.key, loadDashboard])

  const handleVehicleCreated = () => {
    loadDashboard()
  }

  // Check if there are any shared vehicles
  const hasSharedVehicles = useMemo(() => {
    return dashboard?.vehicles?.some((v) => v.is_shared_with_me) ?? false
  }, [dashboard?.vehicles])

  // Filter and sort vehicles
  const sortedVehicles = useMemo(() => {
    if (!dashboard?.vehicles) return []

    // Apply filter first
    let filtered = dashboard.vehicles
    if (filterBy === 'owned') {
      filtered = dashboard.vehicles.filter((v) => !v.is_shared_with_me)
    } else if (filterBy === 'shared') {
      filtered = dashboard.vehicles.filter((v) => v.is_shared_with_me)
    }

    // Apply sorting
    const sorted = [...filtered].sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return `${a.year} ${a.make} ${a.model}`.localeCompare(
            `${b.year} ${b.make} ${b.model}`
          )
        case 'year-new':
          return (b.year ?? 0) - (a.year ?? 0)
        case 'year-old':
          return (a.year ?? 0) - (b.year ?? 0)
        case 'maintenance':
          // Sort by overdue count (desc), then upcoming count (desc)
          if (b.overdue_maintenance_count !== a.overdue_maintenance_count) {
            return b.overdue_maintenance_count - a.overdue_maintenance_count
          }
          return b.upcoming_maintenance_count - a.upcoming_maintenance_count
        default:
          return 0
      }
    })

    return sorted
  }, [dashboard?.vehicles, sortBy, filterBy])

  const sortItems: DropdownItem[] = [
    { id: 'name', label: t('dashboard.sortByName'), checked: sortBy === 'name', onSelect: () => setSortBy('name') },
    { id: 'year-new', label: t('dashboard.newestFirst'), checked: sortBy === 'year-new', onSelect: () => setSortBy('year-new') },
    { id: 'year-old', label: t('dashboard.oldestFirst'), checked: sortBy === 'year-old', onSelect: () => setSortBy('year-old') },
    { id: 'maintenance', label: t('dashboard.byMaintenance'), checked: sortBy === 'maintenance', onSelect: () => setSortBy('maintenance') },
  ]
  const sortLabel = sortItems.find((i) => i.checked)?.label ?? ''

  const filterItems: DropdownItem[] = [
    { id: 'all', label: t('dashboard.allVehicles'), checked: filterBy === 'all', onSelect: () => setFilterBy('all') },
    { id: 'owned', label: t('dashboard.myVehicles'), checked: filterBy === 'owned', onSelect: () => setFilterBy('owned') },
    { id: 'shared', label: t('dashboard.sharedWithMe'), checked: filterBy === 'shared', onSelect: () => setFilterBy('shared') },
  ]
  const filterLabel = filterItems.find((i) => i.checked)?.label ?? ''

  const vehicleCount = dashboard?.total_vehicles || 0

  return (
    <>
      <div className="container mx-auto px-4 py-8">
        <PageHeader
          title={t('dashboard.title')}
          actions={
            <>
              {vehicleCount > 0 && hasSharedVehicles && (
                <Dropdown
                  label={t('dashboard.filterVehicles')}
                  align="right"
                  items={filterItems}
                  trigger={
                    <>
                      {t('dashboard.filterTrigger', { label: filterLabel })}
                      <ChevronDown aria-hidden="true" className="h-4 w-4" />
                    </>
                  }
                />
              )}
              {vehicleCount > 0 && (
                <Dropdown
                  label={t('dashboard.sortVehicles')}
                  align="right"
                  items={sortItems}
                  trigger={
                    <>
                      {t('dashboard.sortTrigger', { label: sortLabel })}
                      <ChevronDown aria-hidden="true" className="h-4 w-4" />
                    </>
                  }
                />
              )}
              <Button variant="primary" icon={Plus} onClick={() => setShowWizard(true)}>
                {t('dashboard.addVehicle')}
              </Button>
            </>
          }
        />

        {/* Vehicles Grid */}
        {loading ? (
          <div className="flex items-center justify-center py-16" role="status" aria-label={t('dashboard.loading')}>
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            <span className="sr-only">{t('dashboard.loading')}</span>
          </div>
        ) : error ? (
          <div className="bg-garage-surface rounded-lg border border-garage-border text-center py-16">
            <p className="text-red-500 mb-4">{error}</p>
            <button
              onClick={loadDashboard}
              className="inline-flex items-center gap-2 btn btn-primary rounded-lg"
            >
              <RefreshCw className="w-4 h-4" />
              <span>{t('common:retry')}</span>
            </button>
          </div>
        ) : dashboard && vehicleCount > 0 ? (
          <div>

            {/* Vehicles Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {sortedVehicles.map((vehicleStats) => (
                <VehicleStatisticsCard key={vehicleStats.vin} stats={vehicleStats} />
              ))}
            </div>
          </div>
        ) : (
          <div className="bg-garage-surface rounded-lg border border-garage-border text-center py-16">
            <CarIcon className="w-16 h-16 text-garage-text-muted mx-auto mb-4 opacity-50" />
            <h3 className="text-xl font-semibold mb-2 text-garage-text">{t('dashboard.noVehiclesYet')}</h3>
            <p className="text-garage-text-muted mb-6">
              {t('dashboard.getStarted')}
            </p>
            <button
              onClick={() => setShowWizard(true)}
              className="inline-flex items-center gap-2 btn btn-primary rounded-lg"
            >
              <Plus className="w-5 h-5" />
              <span>{t('dashboard.addFirstVehicle')}</span>
            </button>
          </div>
        )}
      </div>

      {/* Vehicle Wizard Modal */}
      {showWizard && (
        <VehicleWizard
          onClose={() => setShowWizard(false)}
          onSuccess={handleVehicleCreated}
        />
      )}
    </>
  )
}

import { useTranslation } from 'react-i18next'
import type { LucideIcon } from 'lucide-react'
import type { PrimaryTabType } from '../../pages/VehicleDetail'

interface PrimaryTab {
  id: PrimaryTabType
  label: string
  icon: LucideIcon
  hasSubTabs: boolean
}

interface VehiclePrimaryTabsProps {
  tabs: PrimaryTab[]
  activeTab: PrimaryTabType
  onTabClick: (tabId: PrimaryTabType) => void
}

/**
 * Vehicle Detail primary tab bar. Mechanically extracted from VehicleDetail.tsx
 * (P5 Task 1, verbatim — no restyle). Keeps the dual mobile-grid / desktop-bar
 * structure (exactly one visible at a time) and the frozen "Vehicle sections"
 * tablist name (SDQ-5 / §5.2). Retokenize-only in Task 6.
 */
export default function VehiclePrimaryTabs({ tabs, activeTab, onTabClick }: VehiclePrimaryTabsProps) {
  const { t } = useTranslation('vehicles')
  return (
    <>
      {/* Primary Tabs — Mobile: 3-column icon grid */}
      <div
        role="tablist"
        aria-label={t('detail.misc.vehicleSections')}
        className="md:hidden grid grid-cols-3 gap-2 mt-4"
      >
        {tabs.map((tab) => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={isActive}
              aria-controls={isActive ? `panel-${tab.id}` : undefined}
              id={`tab-mobile-${tab.id}`}
              onClick={() => onTabClick(tab.id)}
              className={`flex flex-col items-center justify-center gap-1 min-h-[60px] py-3 px-2 rounded-lg border text-center leading-tight transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-garage-bg ${
                isActive
                  ? 'bg-primary/10 border-primary text-primary'
                  : 'bg-garage-surface border-garage-border text-garage-text-muted hover:text-garage-text hover:bg-garage-surface-light'
              }`}
            >
              <Icon className="w-5 h-5 flex-shrink-0" />
              <span className="text-xs font-medium leading-tight">{tab.label}</span>
            </button>
          )
        })}
      </div>

      {/* Primary Tabs — Desktop: horizontal scroll bar */}
      <div
        role="tablist"
        aria-label={t('detail.misc.vehicleSections')}
        className="hidden md:flex items-center space-x-1 mt-6 border-b border-garage-border -mb-px overflow-x-auto scrollbar-hide"
      >
        {tabs.map((tab) => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={isActive}
              aria-controls={isActive ? `panel-${tab.id}` : undefined}
              id={`tab-desktop-${tab.id}`}
              onClick={() => onTabClick(tab.id)}
              className={`flex items-center space-x-2 px-4 py-3 border-b-2 transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:ring-offset-garage-surface ${
                isActive
                  ? 'border-primary text-primary'
                  : 'border-transparent text-garage-text-muted hover:text-garage-text hover:border-garage-border'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          )
        })}
      </div>
    </>
  )
}

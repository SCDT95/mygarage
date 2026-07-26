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
              className={`flex flex-col items-center justify-center gap-1 min-h-[60px] py-3 px-2 rounded-control border text-center leading-tight ui-motion ui-focus-ring ${
                isActive
                  ? 'bg-(--accent-soft) border-(--accent-line) text-(--accent-fg)'
                  : 'bg-surface border-border text-text-mute hover:text-text hover:bg-surface-2'
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
        className="hidden md:flex items-center gap-1 mt-6 border-b border-hair -mb-px overflow-x-auto scrollbar-hide"
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
              className={`flex items-center gap-2 px-4 py-3 border-b-2 whitespace-nowrap ui-motion ui-focus-ring text-sm font-semibold ${
                isActive
                  ? 'border-(--accent) text-(--accent-fg)'
                  : 'border-transparent text-text-mute hover:text-text hover:border-border'
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

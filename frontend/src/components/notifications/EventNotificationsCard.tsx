import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next'
import { ChevronDown, ChevronRight, Bell, Settings2 } from 'lucide-react';

interface EventNotificationsCardProps {
  settings: Record<string, unknown>;
  onSettingChange: (key: string, value: boolean) => void;
  onTextChange: (key: string, value: string) => void;
  saving: boolean;
  hasEnabledService: boolean;
}

// A boolean event toggle can pair with zero or more numeric companion
// settings (e.g. "Service Due" pairs with both a days-before and a
// miles-before field). Data-driven so a new unit (days/miles/percent/...)
// is a config addition, not a new copy-pasted JSX block.
interface NumberFieldConfig {
  key: string;
  default: string;
  min: number;
  max: number;
  step?: number;
  suffix: string;
}

interface EventItem {
  key: string;
  label: string;
  description: string;
  numberFields?: NumberFieldConfig[];
}

interface EventGroup {
  id: string;
  label: string;
  icon: React.ElementType;
  events: EventItem[];
}

// Static groups whose label/description are plain (untranslated, matching
// this file's pre-existing convention) — defined once at module scope since
// they don't depend on `t`.
const STATIC_EVENT_GROUPS: EventGroup[] = [
  {
    id: 'safety',
    label: 'Safety Alerts',
    icon: Bell,
    events: [
      {
        key: 'notify_recalls',
        label: 'New Recalls Detected',
        description: 'Notify when NHTSA recalls are found for your vehicles',
      },
    ],
  },
  {
    id: 'maintenance',
    label: 'Maintenance',
    icon: Settings2,
    events: [
      {
        key: 'notify_service_due',
        label: 'Service Due',
        description: 'Notify when scheduled service is coming due',
        numberFields: [
          { key: 'notify_service_days', default: '30', min: 1, max: 90, suffix: 'days before' },
          { key: 'notify_service_miles', default: '500', min: 100, max: 5000, step: 100, suffix: 'miles before' },
        ],
      },
      {
        key: 'notify_service_overdue',
        label: 'Service Overdue',
        description: 'Notify when service is past due',
      },
    ],
  },
  {
    id: 'coverage',
    label: 'Insurance & Warranty',
    icon: Bell,
    events: [
      {
        key: 'notify_insurance_expiring',
        label: 'Insurance Expiring',
        description: 'Notify before insurance policy expires',
        numberFields: [
          { key: 'notify_insurance_days', default: '30', min: 1, max: 90, suffix: 'days before' },
        ],
      },
      {
        key: 'notify_warranty_expiring',
        label: 'Warranty Expiring',
        description: 'Notify before warranty expires',
        numberFields: [
          { key: 'notify_warranty_days', default: '30', min: 1, max: 90, suffix: 'days before' },
        ],
      },
    ],
  },
  {
    id: 'milestones',
    label: 'Milestones',
    icon: Bell,
    events: [
      {
        key: 'notify_milestones',
        label: 'Odometer Milestones',
        description: 'Notify when reaching significant mileage milestones (e.g., 100k miles)',
      },
    ],
  },
];

export function EventNotificationsCard({
  settings,
  onSettingChange,
  onTextChange,
  saving,
  hasEnabledService,
}: EventNotificationsCardProps) {
  const { t } = useTranslation('settings')
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(['safety', 'maintenance']));
  const [showAdvanced, setShowAdvanced] = useState(false);

  const eventGroups: EventGroup[] = useMemo(
    () => [
      ...STATIC_EVENT_GROUPS,
      {
        id: 'def',
        label: t('events.defLow.group'),
        icon: Bell,
        events: [
          {
            key: 'notify_def_low',
            label: t('events.defLow.label'),
            description: t('events.defLow.description'),
            numberFields: [
              { key: 'notify_def_low_threshold_percent', default: '25', min: 1, max: 99, suffix: '%' },
            ],
          },
        ],
      },
    ],
    [t],
  );

  const toggleGroup = (groupId: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  };

  const getEnabledCount = (events: EventItem[]): number => {
    return events.filter((e) => settings[e.key] === 'true').length;
  };

  if (!hasEnabledService) {
    return (
      <div className="bg-garage-surface rounded-lg border border-garage-border p-6">
        <div className="flex items-center gap-3 mb-4">
          <Bell className="w-6 h-6 text-garage-text-muted" />
          <h2 className="text-lg font-semibold text-garage-text">{t('events.title')}</h2>
        </div>
        <p className="text-sm text-garage-text-muted">
          {t('events.enableServiceFirst')} to configure event notifications.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-garage-surface rounded-lg border border-garage-border p-6">
      <div className="flex items-center gap-3 mb-4">
        <Bell className="w-6 h-6 text-primary" />
        <div>
          <h2 className="text-lg font-semibold text-garage-text">Event Notifications</h2>
          <p className="text-sm text-garage-text-muted">Choose which events trigger notifications</p>
        </div>
      </div>

      <div className="space-y-2">
        {eventGroups.map((group) => {
          const isExpanded = expandedGroups.has(group.id);
          const enabledCount = getEnabledCount(group.events);

          return (
            <div key={group.id} className="border border-garage-border rounded-lg overflow-hidden">
              <button
                onClick={() => toggleGroup(group.id)}
                className="flex items-center gap-3 w-full p-3 bg-garage-bg/50 hover:bg-garage-bg text-left transition-colors"
              >
                {isExpanded ? (
                  <ChevronDown className="w-4 h-4 text-garage-text-muted" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-garage-text-muted" />
                )}
                <div className="flex-1">
                  <span className="text-sm font-medium text-garage-text">{group.label}</span>
                  {!isExpanded && (
                    <span className="ml-2 text-xs text-garage-text-muted">
                      ({enabledCount}/{group.events.length} enabled)
                    </span>
                  )}
                </div>
              </button>

              {isExpanded && (
                <div className="p-3 space-y-3 bg-garage-surface">
                  {group.events.map((event) => (
                    <div key={event.key} className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <label className="flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={settings[event.key] === 'true'}
                            onChange={(e) => onSettingChange(event.key, e.target.checked)}
                            disabled={saving}
                            className="w-4 h-4 text-primary bg-garage-bg border-garage-border rounded focus:ring-primary focus:ring-2 disabled:opacity-50"
                          />
                          <span className="ml-2 text-sm text-garage-text font-medium">{event.label}</span>
                        </label>
                        <p className="mt-1 ml-6 text-xs text-garage-text-muted">{event.description}</p>
                      </div>
                      {event.numberFields && event.numberFields.length > 0 && (
                        <div className="flex flex-col gap-1">
                          {event.numberFields.map((field) => (
                            <div key={field.key} className="flex items-center gap-2">
                              <input
                                type="number"
                                value={String(settings[field.key] ?? field.default)}
                                onChange={(e) => onTextChange(field.key, e.target.value)}
                                disabled={saving || settings[event.key] !== 'true'}
                                min={field.min}
                                max={field.max}
                                step={field.step}
                                className="w-16 px-2 py-1 text-sm bg-garage-bg border border-garage-border rounded text-garage-text disabled:opacity-50"
                              />
                              <span className="text-xs text-garage-text-muted whitespace-nowrap">{field.suffix}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {/* Advanced Settings */}
        <div className="mt-4 border border-garage-border rounded-lg overflow-hidden">
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-3 w-full p-3 bg-garage-bg/50 hover:bg-garage-bg text-left transition-colors"
          >
            {showAdvanced ? (
              <ChevronDown className="w-4 h-4 text-garage-text-muted" />
            ) : (
              <ChevronRight className="w-4 h-4 text-garage-text-muted" />
            )}
            <Settings2 className="w-4 h-4 text-garage-text-muted" />
            <div className="flex-1">
              <span className="text-sm font-medium text-garage-text">Advanced</span>
              <p className="text-xs text-garage-text-muted">Retry settings for high-priority notifications</p>
            </div>
          </button>

          {showAdvanced && (
            <div className="p-3 space-y-3 bg-garage-surface">
              <div className="flex items-center justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <label className="text-sm text-garage-text">Retry Attempts</label>
                  <p className="text-xs text-garage-text-muted">Max retries for urgent/high priority events</p>
                </div>
                <input
                  type="number"
                  min="1"
                  max="10"
                  value={String(settings.notification_retry_attempts ?? '3')}
                  onChange={(e) => onTextChange('notification_retry_attempts', e.target.value)}
                  disabled={saving}
                  className="w-20 px-2 py-1 text-sm bg-garage-bg border border-garage-border rounded text-garage-text disabled:opacity-50"
                />
              </div>
              <div className="flex items-center justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <label className="text-sm text-garage-text">Retry Delay (seconds)</label>
                  <p className="text-xs text-garage-text-muted">Base delay between retry attempts</p>
                </div>
                <input
                  type="number"
                  min="0.5"
                  max="30"
                  step="0.5"
                  value={String(settings.notification_retry_delay ?? '2.0')}
                  onChange={(e) => onTextChange('notification_retry_delay', e.target.value)}
                  disabled={saving}
                  className="w-20 px-2 py-1 text-sm bg-garage-bg border border-garage-border rounded text-garage-text disabled:opacity-50"
                />
              </div>
              <p className="text-xs text-garage-text-muted italic">
                Retries only apply to urgent/high priority events (recalls, overdue service, expiring insurance)
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

import { useState } from 'react'
import HoursRecordList from '../HoursRecordList'
import HoursRecordForm from '../HoursRecordForm'
import type { HoursRecord } from '../../types/hours'

interface HoursTabProps {
  vin: string
}

/** Engine-hours analog of tabs/OdometerTab.tsx (s/Odometer/Hours/). */
export default function HoursTab({ vin }: HoursTabProps) {
  const [showForm, setShowForm] = useState(false)
  const [editRecord, setEditRecord] = useState<HoursRecord | undefined>()
  const [refreshKey, setRefreshKey] = useState(0)

  const handleAddClick = () => {
    setEditRecord(undefined)
    setShowForm(true)
  }

  const handleEditClick = (record: HoursRecord) => {
    setEditRecord(record)
    setShowForm(true)
  }

  const handleCloseForm = () => {
    setShowForm(false)
    setEditRecord(undefined)
  }

  const handleSuccess = () => {
    setRefreshKey(k => k + 1)
    handleCloseForm()
  }

  return (
    <>
      <HoursRecordList
        vin={vin}
        onAddClick={handleAddClick}
        onEditClick={handleEditClick}
        key={refreshKey}
      />

      {showForm && (
        <HoursRecordForm
          vin={vin}
          record={editRecord}
          onClose={handleCloseForm}
          onSuccess={handleSuccess}
        />
      )}
    </>
  )
}

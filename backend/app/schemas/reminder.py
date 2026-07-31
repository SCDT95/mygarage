"""Pydantic schemas for Vehicle Reminder operations.

Canonical units (since v2.26.2): kilometers (Decimal NUMERIC(10,2)).
Engine-hours (since the hours-usage-model feature): dimensionless Decimal
NUMERIC(10,1) — no unit conversion, mirrors the mileage fields.
"""

from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class ReminderCreate(BaseModel):
    """Schema for creating a vehicle reminder."""

    title: str = Field(..., min_length=1, max_length=200)
    reminder_type: Literal["date", "mileage", "both", "smart", "hours"]
    due_date: date | None = None
    due_mileage_km: Decimal | None = Field(None, gt=0, le=99999999.99)
    due_hours: Decimal | None = Field(None, gt=0, le=999999999.9)
    notes: str | None = None
    line_item_id: int | None = None

    @model_validator(mode="after")
    def validate_fields_for_type(self) -> ReminderCreate:
        """Ensure required fields are present based on reminder type.

        ``smart`` requires ``due_date`` and exactly one of
        ``{due_mileage_km, due_hours}`` — accepts both today's existing
        date+mileage smart reminders (hours null) and the new date+hours
        variant (mileage null), but rejects specifying both or neither.
        """
        if self.reminder_type in ("date", "both", "smart") and not self.due_date:
            raise ValueError("due_date required for this reminder type")
        if self.reminder_type in ("mileage", "both") and not self.due_mileage_km:
            raise ValueError("due_mileage_km required for this reminder type")
        if self.reminder_type == "hours" and not self.due_hours:
            raise ValueError("due_hours required for this reminder type")
        if self.reminder_type == "smart":
            has_mileage = self.due_mileage_km is not None
            has_hours = self.due_hours is not None
            if has_mileage == has_hours:
                raise ValueError(
                    "smart reminders require exactly one of due_mileage_km or due_hours"
                )
        return self


class ReminderUpdate(BaseModel):
    """Schema for updating a vehicle reminder.

    Status is NOT here — use /done or /dismiss endpoints.
    Validation is lenient (fields may be absent). The route handler merges
    this patch onto the existing reminder and validates the final state.
    """

    title: str | None = Field(None, min_length=1, max_length=200)
    reminder_type: Literal["date", "mileage", "both", "smart", "hours"] | None = None
    due_date: date | None = None
    due_mileage_km: Decimal | None = Field(None, gt=0, le=99999999.99)
    due_hours: Decimal | None = Field(None, gt=0, le=999999999.9)
    notes: str | None = None


class ReminderResponse(BaseModel):
    """Schema for reminder response."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    vin: str
    line_item_id: int | None
    title: str
    reminder_type: str
    due_date: date | None
    due_mileage_km: Decimal | None
    due_hours: Decimal | None
    status: str
    notes: str | None
    estimated_due_date: date | None = None
    last_notified_at: datetime | None
    created_at: datetime
    updated_at: datetime

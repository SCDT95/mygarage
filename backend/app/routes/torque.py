"""Torque Pro ingest — GET/POST with a path token. Returns text/plain 'OK!'.

Device auth is the path token (Torque cannot send headers or a stable query
param). No user session; token is scoped to exactly one vehicle. No `vin` path
param and no optional_auth, so the AST authz tripwire does not apply.

Also provides `redact_torque_path` + `TorqueTokenRedactionFilter` (R1-H3):
Torque forces the reusable device token into the request PATH (there is no
header or stable query param it can carry), so it would otherwise land
verbatim in the access log on every upload. The filter rewrites that path in
emitted log records before they're formatted. The token stays single-vehicle-
scoped and revocable (Task 13 DELETE) as defence in depth.
"""

import logging
import re
from collections.abc import Mapping
from datetime import UTC, datetime
from decimal import Decimal

from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.vehicle import Vehicle
from app.services.location_service import LocationService
from app.services.session_service import SessionService
from app.services.telemetry_service import TelemetryService
from app.services.torque_pid_map import parse_torque_query
from app.services.torque_service import TorqueService

router = APIRouter(prefix="/api/v1/torque", tags=["torque"])
_OK = Response(content="OK!", media_type="text/plain")

# Matches the ingest path with any token segment, for log redaction.
_TORQUE_PATH_RE = re.compile(r"/api/v1/torque/[^/]+/upload")


def redact_torque_path(text: str) -> str:
    """Rewrite any `/api/v1/torque/<token>/upload` occurrence to a redacted form.

    Pure function shared by `TorqueTokenRedactionFilter` and its unit test.
    """
    return _TORQUE_PATH_RE.sub("/api/v1/torque/<redacted>/upload", text)


class TorqueTokenRedactionFilter(logging.Filter):
    """Redact the Torque device path-token from access/request log records.

    Installed on the granian access logger (mirrors `HealthCheckLogFilter` in
    `main.py`). Rewrites the record's rendered message in place and clears
    `args` so the redacted text isn't re-interpolated; never drops a record.
    """

    def filter(self, record: logging.LogRecord) -> bool:
        """Redact the token in `record`'s rendered message; always let it through."""
        message = record.getMessage()
        redacted = redact_torque_path(message)
        if redacted != message:
            record.msg = redacted
            record.args = ()
        return True


def _to_decimal(value: float | None) -> Decimal | None:
    """Convert an optional float PID value to Decimal for a Numeric column."""
    return Decimal(str(value)) if value is not None else None


async def _ingest(token: str, params: Mapping[str, str], db: AsyncSession) -> Response:
    """Resolve the Torque path token and store OBD telemetry / GPS breadcrumbs.

    Owns the transaction: calls the non-committing service methods, then
    commits once. Always returns 200 `OK!` on success (including an unlinked
    device, so Torque stops retrying) and 403 plain-text on an invalid token.
    """
    device = await TorqueService(db).resolve_by_token(token)
    if device is None:
        return Response(content="Invalid token", media_type="text/plain", status_code=403)
    if not device.vin:
        return _OK  # unlinked source — accept so Torque stops retrying, but no-op

    reading = parse_torque_query(params)
    now = datetime.now(UTC).replace(tzinfo=None)
    ts = now
    if reading.time_ms:
        candidate = datetime.fromtimestamp(reading.time_ms / 1000, tz=UTC).replace(tzinfo=None)
        # Trust the device clock for PAST timestamps (legit replay/backfill), but never
        # allow a FUTURE started_at/data ts — clamp to now. A future started_at would
        # finalize (at server-now) to a NEGATIVE duration and poison ordering/dedup (R2-H2).
        ts = min(candidate, now)

    # resolve_torque_session sets device.last_seen = server utc_now() internally (never `ts`).
    session = await SessionService(db).resolve_torque_session(device, reading.session, ts)

    if reading.obd or reading.gps:
        # An actively-uploading device is online. resolve_torque_session's newer-drive
        # branch may have just called end_session (which sets ecu_status='offline') to
        # finalize a stale prior trip — re-assert online whenever real data arrives so
        # the status endpoint doesn't show an actively-uploading device as offline.
        device.ecu_status = "online"

    if reading.obd:
        await TelemetryService(db).store_torque_telemetry(
            device.vin, device.device_id, ts, reading.obd
        )

    if reading.gps.get("latitude") is not None and reading.gps.get("longitude") is not None:
        vehicle = (
            await db.execute(select(Vehicle).where(Vehicle.vin == device.vin))
        ).scalar_one_or_none()
        if vehicle and vehicle.location_tracking_enabled:
            await LocationService(db).record_point(
                vin=device.vin,
                device_id=device.device_id,
                drive_session_id=session.id if session else None,
                timestamp=ts,
                latitude=Decimal(str(reading.gps["latitude"])),
                longitude=Decimal(str(reading.gps["longitude"])),
                speed=_to_decimal(reading.gps.get("speed")),
                heading=_to_decimal(reading.gps.get("heading")),
                altitude=_to_decimal(reading.gps.get("altitude")),
            )

    await db.commit()
    return _OK


@router.get("/{token}/upload")
async def torque_ingest_get(
    token: str, request: Request, db: AsyncSession = Depends(get_db)
) -> Response:
    """Torque Pro's primary ingest path: GET with all data in the query string."""
    return await _ingest(token, request.query_params, db)


@router.post("/{token}/upload")
async def torque_ingest_post(
    token: str, request: Request, db: AsyncSession = Depends(get_db)
) -> Response:
    """Accept POST (query string and/or form body) for robustness; Torque itself uses GET."""
    params: dict[str, str] = dict(request.query_params)
    try:
        form = await request.form()
        for key, value in form.items():
            params.setdefault(key, str(value))
    except Exception:
        pass
    return await _ingest(token, params, db)

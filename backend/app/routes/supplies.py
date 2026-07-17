"""Global parts & supplies catalog routes.

Authorization model: supplies are a shared household catalog, exactly like
``address_book``. Every route is authenticated (``require_auth``). There is no
per-vehicle authorization here because a supply is NOT a vehicle-owned child
record — it is a household-level item with an optional, non-authoritative ``vin``
pin (see ``Supply.created_by_user_id`` "provenance only, not an access wall").
Routes therefore key on the supply ``id``; the ``vin`` query param is a display
filter, never an access boundary.

Vehicle-scoped access control lives where it belongs: the per-vehicle
supply-usages read route is vin-scoped and gates with ``get_vehicle_or_403``,
and job consumption is written through the already write-gated service-visit
flow. This module deliberately has no vehicle gate because it guards no
vehicle-owned data.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User
from app.schemas.supply import (
    SupplyAdjustmentCreate,
    SupplyCreate,
    SupplyHistoryResponse,
    SupplyListResponse,
    SupplyPurchaseCreate,
    SupplyPurchaseResponse,
    SupplyResponse,
    SupplyUpdate,
    SupplyUsageResponse,
)
from app.services.auth import require_auth
from app.services.supply_service import SupplyService

router = APIRouter(prefix="/api/supplies", tags=["supplies"])


@router.get("", response_model=SupplyListResponse)
async def list_supplies(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User | None, Depends(require_auth)],
    include_archived: bool = Query(False),
    vin: str | None = Query(None),
) -> SupplyListResponse:
    """List catalog supplies with ledger-derived balances."""
    supplies, total = await SupplyService(db).list_supplies(
        current_user, include_archived=include_archived, vin=vin
    )
    return SupplyListResponse(supplies=supplies, total=total)


@router.post("", response_model=SupplyResponse, status_code=status.HTTP_201_CREATED)
async def create_supply(
    data: SupplyCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User | None, Depends(require_auth)],
) -> SupplyResponse:
    """Create a catalog supply."""
    return await SupplyService(db).create_supply(data, current_user)


@router.get("/{supply_id}", response_model=SupplyResponse)
async def get_supply(
    supply_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User | None, Depends(require_auth)],
) -> SupplyResponse:
    """Get a single catalog supply with its current balance."""
    svc = SupplyService(db)
    supply = await svc.get_supply(supply_id)
    on_hand, avg = (await svc._compute_balances([supply_id]))[supply_id]
    return svc._to_supply_response(supply, on_hand, avg)


@router.patch("/{supply_id}", response_model=SupplyResponse)
async def update_supply(
    supply_id: int,
    data: SupplyUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User | None, Depends(require_auth)],
) -> SupplyResponse:
    """Patch a catalog supply. unit_type is intentionally immutable."""
    return await SupplyService(db).update_supply(supply_id, data, current_user)


@router.delete("/{supply_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_supply(
    supply_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User | None, Depends(require_auth)],
) -> Response:
    """Delete a catalog supply — hard-delete if unused, soft-archive if it has ledger history."""
    await SupplyService(db).delete_supply(supply_id, current_user)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/{supply_id}/purchases",
    response_model=SupplyPurchaseResponse,
    status_code=status.HTTP_201_CREATED,
)
async def add_purchase(
    supply_id: int,
    data: SupplyPurchaseCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User | None, Depends(require_auth)],
) -> SupplyPurchaseResponse:
    """Record a stock-in purchase for a supply."""
    purchase = await SupplyService(db).add_purchase(supply_id, data, current_user)
    return SupplyPurchaseResponse.model_validate(purchase)


@router.delete("/{supply_id}/purchases/{purchase_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_purchase(
    supply_id: int,
    purchase_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User | None, Depends(require_auth)],
) -> Response:
    """Delete a purchase (and its receipt, if any) from the ledger."""
    await SupplyService(db).delete_purchase(supply_id, purchase_id, current_user)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/{supply_id}/adjustments",
    response_model=SupplyUsageResponse,
    status_code=status.HTTP_201_CREATED,
)
async def add_adjustment(
    supply_id: int,
    data: SupplyAdjustmentCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User | None, Depends(require_auth)],
) -> SupplyUsageResponse:
    """Record a standalone stock-out (not tied to a service line item)."""
    svc = SupplyService(db)
    usage = await svc.add_adjustment(supply_id, data, current_user)
    await db.refresh(usage, attribute_names=["supply"])
    return svc.to_usage_response(usage)


@router.delete("/{supply_id}/adjustments/{usage_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_adjustment(
    supply_id: int,
    usage_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User | None, Depends(require_auth)],
) -> Response:
    """Delete a standalone adjustment. Job-linked usages must be edited via the visit."""
    await SupplyService(db).delete_adjustment(supply_id, usage_id, current_user)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/{supply_id}/history", response_model=SupplyHistoryResponse)
async def supply_history(
    supply_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User | None, Depends(require_auth)],
) -> SupplyHistoryResponse:
    """Full chronological purchase/usage ledger for a supply, with running balance."""
    return await SupplyService(db).get_supply_history(supply_id, current_user)

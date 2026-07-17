"""Global parts & supplies catalog routes.

Authenticated-only (no vehicle gate) — a shared household catalog, mirroring
address_book. Queries are by id, never by vin, so these routes are invisible to
the AST authz tripwire. A per-vehicle usages read route (Task 8) is vin-scoped
and carries a read gate; it lives in a separate module.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User
from app.schemas.supply import (
    SupplyCreate,
    SupplyListResponse,
    SupplyResponse,
    SupplyUpdate,
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

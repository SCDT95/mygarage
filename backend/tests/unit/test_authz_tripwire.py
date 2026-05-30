"""Unit tests for the AST authorization tripwire (tools/authz_tripwire.py).

The tripwire is the structural backstop that would have caught the v2.27.2
authorization cluster. These tests lock its behaviour against a synthetic corpus
of known-bad and known-good handlers/service methods -- one per rule -- so a
future refactor of the checker can't silently stop flagging the class.

Per the plan (§12, §15): assert it flags the known-bad set and stays green on
already-correct sites.
"""

from pathlib import Path

import pytest

from tools.authz_tripwire import check_paths


def _write(tmp_path: Path, name: str, source: str) -> Path:
    # Mirror the real layout so the routes/services split is exercised.
    sub = tmp_path / "backend" / "app" / ("services" if "service" in name else "routes")
    sub.mkdir(parents=True, exist_ok=True)
    f = sub / name
    f.write_text(source, encoding="utf-8")
    return f


def _rules(tmp_path: Path) -> set[str]:
    findings = check_paths([tmp_path])
    return {f.rule for f in findings}


def _findings_for(tmp_path: Path, rule: str):
    return [f for f in check_paths([tmp_path]) if f.rule == rule]


# --- Rule 1: require-write-on-mutations --------------------------------------


class TestRequireWriteRule:
    def test_flags_mutating_handler_with_read_gate(self, tmp_path):
        _write(
            tmp_path,
            "routes.py",
            """
@router.post("/{vin}/fuel")
async def create_fuel(vin, current_user=Depends(require_auth), db=Depends(get_db)):
    await get_vehicle_or_403(vin, current_user, db)
    db.add(thing)
""",
        )
        assert "require-write-on-mutations" in _rules(tmp_path)

    def test_passes_mutating_handler_with_require_write(self, tmp_path):
        _write(
            tmp_path,
            "routes.py",
            """
@router.post("/{vin}/fuel")
async def create_fuel(vin, current_user=Depends(require_auth), db=Depends(get_db)):
    await get_vehicle_or_403(vin, current_user, db, require_write=True)
    db.add(thing)
""",
        )
        assert "require-write-on-mutations" not in _rules(tmp_path)

    def test_passes_read_only_get_handler(self, tmp_path):
        _write(
            tmp_path,
            "routes.py",
            """
@router.get("/{vin}/fuel")
async def list_fuel(vin, current_user=Depends(require_auth), db=Depends(get_db)):
    await get_vehicle_or_403(vin, current_user, db)
""",
        )
        assert "require-write-on-mutations" not in _rules(tmp_path)

    def test_pragma_exempts_read_only_post(self, tmp_path):
        _write(
            tmp_path,
            "routes.py",
            """
@router.post("/{vin}/parse")
async def parse(vin, current_user=Depends(require_auth), db=Depends(get_db)):
    await get_vehicle_or_403(vin, current_user, db)  # tripwire: read-only
    return ocr_only(vin)
""",
        )
        assert "require-write-on-mutations" not in _rules(tmp_path)

    def test_call_graph_reaches_service_gate(self, tmp_path):
        # Handler delegates the read gate to a service method -> still flagged.
        _write(
            tmp_path,
            "routes.py",
            """
@router.put("/{vin}")
async def update_vehicle(vin, current_user=Depends(require_auth), db=Depends(get_db)):
    service = VehicleService(db)
    await service.update_vehicle(vin, data, current_user)
""",
        )
        _write(
            tmp_path,
            "vehicle_service.py",
            """
class VehicleService:
    async def update_vehicle(self, vin, data, current_user):
        vehicle = await get_vehicle_or_403(vin, current_user, self.db)
        return vehicle
""",
        )
        assert "require-write-on-mutations" in _rules(tmp_path)

    def test_forwarded_require_write_wrapper_passes(self, tmp_path):
        # A handler that forwards require_write=True to a wrapper is authorised
        # even though the wrapper itself passes the kwarg as a parameter.
        _write(
            tmp_path,
            "routes.py",
            """
@router.put("/dtcs/{dtc_id}")
async def update_dtc(vin, current_user=Depends(require_auth), db=Depends(get_db)):
    await verify_vehicle_access(db, vin, current_user, require_write=True)
    db.add(x)

async def verify_vehicle_access(db, vin, current_user, require_write=False):
    return await get_vehicle_or_403(vin, current_user, db, require_write=require_write)
""",
        )
        assert "require-write-on-mutations" not in _rules(tmp_path)


# --- Rule 2: delete-must-be-owner-only ---------------------------------------


class TestDeleteOwnerRule:
    def test_flags_vehicle_delete_with_read_gate(self, tmp_path):
        _write(
            tmp_path,
            "vehicle_service.py",
            """
class VehicleService:
    async def delete_vehicle(self, vin, current_user):
        await get_vehicle_or_403(vin, current_user, self.db)
        await self.db.execute(delete(Vehicle).where(Vehicle.vin == vin))
""",
        )
        assert "delete-must-be-owner-only" in _rules(tmp_path)

    def test_passes_vehicle_delete_with_ownership(self, tmp_path):
        _write(
            tmp_path,
            "vehicle_service.py",
            """
class VehicleService:
    async def delete_vehicle(self, vin, current_user):
        vehicle = await get_vehicle_for_owner_or_403(vin, current_user, self.db)
        check_vehicle_ownership(vehicle, current_user)
        await self.db.execute(delete(Vehicle).where(Vehicle.vin == vin))
""",
        )
        assert "delete-must-be-owner-only" not in _rules(tmp_path)

    def test_child_delete_with_write_gate_not_flagged(self, tmp_path):
        # delete(ChildModel) is a write-share op, not owner-only.
        _write(
            tmp_path,
            "routes.py",
            """
@router.delete("/{vin}/photos/{name}")
async def delete_photo(vin, current_user=Depends(require_auth), db=Depends(get_db)):
    await get_vehicle_or_403(vin, current_user, db, require_write=True)
    await db.execute(delete(Photo).where(Photo.vin == vin))
""",
        )
        rules = _rules(tmp_path)
        assert "delete-must-be-owner-only" not in rules
        assert "require-write-on-mutations" not in rules


# --- Rule 3: vin-query-needs-access-gate -------------------------------------


class TestVinGateRule:
    def test_flags_ungated_vin_query_handler(self, tmp_path):
        _write(
            tmp_path,
            "routes.py",
            """
@router.get("/{vin}/billings")
async def list_billings(vin, current_user=Depends(require_auth), db=Depends(get_db)):
    result = await db.execute(select(Billing).where(Billing.vin == vin))
    return result.scalars().all()
""",
        )
        assert "vin-query-needs-access-gate" in _rules(tmp_path)

    def test_passes_gated_vin_query(self, tmp_path):
        _write(
            tmp_path,
            "routes.py",
            """
@router.get("/{vin}/billings")
async def list_billings(vin, current_user=Depends(require_auth), db=Depends(get_db)):
    await get_vehicle_or_403(vin, current_user, db)
    result = await db.execute(select(Billing).where(Billing.vin == vin))
    return result.scalars().all()
""",
        )
        assert "vin-query-needs-access-gate" not in _rules(tmp_path)

    def test_flags_delegated_service_idor(self, tmp_path):
        # Handler delegates to a service that queries by vin with no gate.
        _write(
            tmp_path,
            "routes.py",
            """
@router.get("/{vin}/transfer-history")
async def get_transfer_history(vin, current_user=Depends(require_auth), db=Depends(get_db)):
    service = TransferService(db)
    return await service.get_transfer_history(vin)
""",
        )
        _write(
            tmp_path,
            "transfer_service.py",
            """
class TransferService:
    async def get_transfer_history(self, vin):
        result = await self.db.execute(
            select(VehicleTransfer).where(VehicleTransfer.vehicle_vin == vin)
        )
        return result.scalars().all()
""",
        )
        assert "vin-query-needs-access-gate" in _rules(tmp_path)

    def test_user_scoped_query_passes(self, tmp_path):
        # A list endpoint filtering by current_user.id is not an IDOR even if it
        # also references vin elsewhere.
        _write(
            tmp_path,
            "routes.py",
            """
@router.get("/{vin}/notes")
async def list_notes(vin, current_user=Depends(require_auth), db=Depends(get_db)):
    result = await db.execute(
        select(Note).where(Note.vin == vin, Note.user_id == current_user.id)
    )
    return result.scalars().all()
""",
        )
        assert "vin-query-needs-access-gate" not in _rules(tmp_path)


# --- Rule 4: no-new-read-wrappers --------------------------------------------


class TestNewWrapperRule:
    def test_flags_unknown_vehicle_helper(self, tmp_path):
        _write(
            tmp_path,
            "service.py",
            """
async def get_vehicle_sneaky(vin, db):
    result = await db.execute(select(Vehicle).where(Vehicle.vin == vin))
    return result.scalar_one_or_none()
""",
        )
        assert "no-new-read-wrappers" in _rules(tmp_path)

    def test_allowlisted_helper_passes(self, tmp_path):
        _write(
            tmp_path,
            "service.py",
            """
async def get_vehicle_or_403(vin, current_user, db, require_write=False):
    return vehicle
""",
        )
        assert "no-new-read-wrappers" not in _rules(tmp_path)


# --- Rule 5: optional-auth-fail-open -----------------------------------------


class TestOptionalAuthRule:
    def test_flags_state_changing_optional_auth(self, tmp_path):
        _write(
            tmp_path,
            "routes.py",
            """
@router.post("/{vin}/archive")
async def archive(vin, current_user=Depends(optional_auth), db=Depends(get_db)):
    ...
""",
        )
        assert "optional-auth-fail-open" in _rules(tmp_path)

    def test_flags_optional_auth_vehicle_read(self, tmp_path):
        _write(
            tmp_path,
            "routes.py",
            """
@router.get("/dashboard")
async def dashboard(current_user=Depends(optional_auth), db=Depends(get_db)):
    result = await db.execute(select(Vehicle))
    return result.scalars().all()
""",
        )
        assert "optional-auth-fail-open" in _rules(tmp_path)

    def test_require_auth_handler_passes(self, tmp_path):
        _write(
            tmp_path,
            "routes.py",
            """
@router.post("/{vin}/archive")
async def archive(vin, current_user=Depends(require_auth), db=Depends(get_db)):
    vehicle = await get_vehicle_for_owner_or_403(vin, current_user, db)
    check_vehicle_ownership(vehicle, current_user)
""",
        )
        assert "optional-auth-fail-open" not in _rules(tmp_path)

    def test_pragma_exempts_status_endpoint(self, tmp_path):
        _write(
            tmp_path,
            "routes.py",
            """
@router.get("/csrf-token")  # tripwire: optional-auth-ok
async def csrf(current_user=Depends(optional_auth), db=Depends(get_db)):
    return {"token": make_token()}
""",
        )
        assert "optional-auth-fail-open" not in _rules(tmp_path)


# --- Whole-corpus sanity ------------------------------------------------------


class TestCleanCorpus:
    def test_fully_gated_corpus_is_clean(self, tmp_path):
        _write(
            tmp_path,
            "routes.py",
            """
@router.get("/{vin}")
async def get_vehicle(vin, current_user=Depends(require_auth), db=Depends(get_db)):
    return await get_vehicle_or_403(vin, current_user, db)

@router.post("/{vin}/fuel")
async def create_fuel(vin, current_user=Depends(require_auth), db=Depends(get_db)):
    await get_vehicle_or_403(vin, current_user, db, require_write=True)
    db.add(x)

@router.delete("/{vin}")
async def delete_vehicle(vin, current_user=Depends(require_auth), db=Depends(get_db)):
    vehicle = await get_vehicle_for_owner_or_403(vin, current_user, db)
    check_vehicle_ownership(vehicle, current_user)
    await db.execute(delete(Vehicle).where(Vehicle.vin == vin))
""",
        )
        assert check_paths([tmp_path]) == []


if __name__ == "__main__":  # pragma: no cover
    pytest.main([__file__, "-v"])

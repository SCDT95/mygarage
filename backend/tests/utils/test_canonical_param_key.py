from app.utils.autopid_normalizer import canonical_param_key


def test_canonical_param_key_uppercases_and_underscores():
    assert canonical_param_key("0C-EngineRPM") == "0C-ENGINERPM"
    assert canonical_param_key("51-FuelType") == "51-FUELTYPE"
    assert canonical_param_key("Ambient Air Temp") == "AMBIENT_AIR_TEMP"


def test_canonical_param_key_idempotent():
    once = canonical_param_key("0C-EngineRPM")
    assert canonical_param_key(once) == once  # already-uppercase is a no-op

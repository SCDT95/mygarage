# LiveLink (WiCAN) Setup

MyGarage ingests real-time vehicle telemetry from [WiCAN](https://github.com/meatpiHQ/wican-fw)
devices. WiCAN PRO with firmware **v4.40 or newer** is required.

## Webhook (HTTPS) ingestion

Point your WiCAN device's webhook at MyGarage's ingest endpoint:

- **Webhook URL:** `https://<your-mygarage-host>/api/v1/livelink/ingest`
- **Method:** `POST`
- **Auth:** include the per-device token issued in MyGarage
  (Settings → Integrations → LiveLink → Configure → device token).

The endpoint returns `202 Accepted` immediately and queues the payload for
async processing.

## Primary + failover webhook (firmware v4.49 / v4.50p)

Recent PRO firmware supports a **primary** and a **failover** webhook URL.
Both may target MyGarage for delivery resilience — if the primary path fails,
the device retries the failover. Configure either or both fields in the
device's web UI to the ingest URL above; MyGarage deduplicates replays, so a
payload delivered via both paths is stored once.

## MQTT ingestion (alternative)

If you run an MQTT broker, MyGarage can subscribe instead of receiving
webhooks. See Settings → Integrations → LiveLink → MQTT.

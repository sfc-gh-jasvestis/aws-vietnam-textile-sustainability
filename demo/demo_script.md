# Sustainability Compliance

**Vietnam - Textile & Garment**
Use case: Sustainability Compliance

> Sustainability Compliance for Vietnam - ML.FORECAST and Dynamic Tables power real-time sustainability compliance intelligence for textile & garment in Hai Duong & Nam Dinh.

## Why Snowflake

Snowflake delivers sustainability compliance intelligence for Vietnamese textile & garment - Dynamic Tables maintain real-time dashboards, ML.FORECAST projects key metrics, and Cortex AI generates recommendations

- **ML.FORECAST for sustainability compliance** - Only demo for Vietnamese textile & garment
- **ML.ANOMALY_DETECTION early warning** - Detects deviations before impact
- **AI recommendations** - Cortex AI actionable guidance
- **Vietnamese context** - Local names, VND economics

## What is deployed

| | |
|---|---|
| Database | `VIETNAM_TEXTILE_SUSTAINABILITY` |
| Service | `VIETNAM_TEXTILE_SUSTAINABILITY_APP` |
| Compute pool | `SEA_DEMOS_VIETNAM_POOL` |
| Dimension table | `RAW.FACILITIES` (20 rows) |
| Fact table | `RAW.COMPLIANCE_READINGS` (250,000 rows, 90 days) |
| Curated layer | `CURATED.PERFORMANCE_SUMMARY`, `CURATED.TREND_ANALYSIS`, `CURATED.KPI_SUMMARY` |
| Currency | VND (₫) |

Regions in play: Ho Chi Minh City, Hanoi, Binh Duong, Dong Nai, Can Tho
Segments: Water Recycling, Chemical Compliance, Energy Intensity, Waste Diversion

Dynamic tables are created suspended and refreshed on demand:

```bash
./refresh_demo_data.sh VIETNAM_TEXTILE_SUSTAINABILITY
```

## KPI cards

Every card below is served live from `CURATED.KPI_SUMMARY`. The app keeps the
original literal as a fallback, so it still renders if Snowflake is unreachable.

| Card | Value | Backed by |
|---|---|---|
| Recycled Content | `34%` | average per event |
| Water Usage (MTD) | `842K m³` | total across Facilities |
| Carbon Footprint | `-12% YoY` | average per event |
| Certifications | `8` | average per event |
| Zero Discharge | `87%` | average per event |
| Solar Coverage | `42%` | average per event |
| Waste Diverted | `94%` | average per event |


## Demo flow

1. Overview
2. Analytics
3. AI Intelligence
4. Ask AI
5. Architecture

## Talking points

- **100K operations** - tracked in Hai Duong & Nam Dinh
- **500K metrics** - time-series data points
- **5K assets** - monitored
- **100 docs** - searchable

## Business impact

- Vietnam textile & garment sector growing rapidly (GSO Vietnam)
- AI improves outcomes 15-30% (McKinsey)
- Vietnam FDI strong in this sector (MPI)
- Real-time analytics reduces response 60-80% (Gartner)

---
Generated from `generator/demo_specs/aws-vietnam-textile-sustainability.json`. Do not hand-edit: run
`python3 generator/gen_repo_docs.py aws-vietnam-textile-sustainability` instead.

# Vietnam Textile Sustainability Monitoring

**Vietnam - Textile Dyeing and Finishing Mills**
Use case: mill effluent quality, emissions intensity and 7-day effluent exceedance risk

> Sustainability monitoring for a fictional textile dyeing and finishing group with 30 synthetic wet-processing mills in 4 Vietnamese cities: dynamic tables, a holdout-evaluated exceedance-risk classifier, a CO2e emissions forecast, effluent COD anomaly detection and grounded AI answers. Thresholds are internal demo thresholds, not regulatory limits.

## Why Snowflake

- **Dynamic tables** reconcile effluent within threshold, exceedances, emissions intensity and effluent treatment plant (ETP) uptime from RAW mill data, with checks in `run_core.py`
- **Exceedance-risk classification** gives a holdout-evaluated next-7-day effluent exceedance probability per mill
- **Emissions forecast** projects 14 days of group-wide t CO2e with prediction intervals
- **Grounded AI**: the Cortex Agent (Analyst over a semantic view, plus Search over SOPs) shows its SQL and SOP citations
- **Live telemetry**: a native simulator (Snowflake only) or AWS IoT Core, S3 and Snowpipe (AWS build) for ETP effluent COD sensors, then an alert and email

## What is built

| | |
|---|---|
| Dimension table | `RAW.MILLS` (30 rows) |
| Fact table | `RAW.MILL_DAILY` (2,700 mill-days, 90 days) |
| Snapshot table | `RAW.STEAM_TRAP_SURVEY` (30 rows) |
| Curated layer | `CURATED.KPI_SUMMARY`, `PERFORMANCE_SUMMARY`, `EXCEEDANCE_CAUSES`, `TREND_ANALYSIS` |
| ML | `ML.EXCEEDANCE_RISK_SCORES`, `ML.EXCEEDANCE_RISK_HOLDOUT_METRICS`, `ML.EMISSIONS_FORECAST`, `ML.COD_ANOMALIES` |

Regions (city labels only): Nam Dinh, Ho Chi Minh City, Da Nang, Hai Phong.
Mill types: Knit Dyeing Mill, Woven Dyeing Mill, Denim Wash Plant, Textile Printing Mill, Yarn Dyeing Mill.

## KPI cards (live from `CURATED.KPI_SUMMARY`; no fallback values)

| Card | Value from the seeded data |
|---|---|
| Effluent Within Threshold | 88.1% |
| Environmental Exceedances | 330 |
| Emissions Intensity | 4,809.9 kg CO2e/t |
| Total Emissions (t CO2e) | 285,297 |
| Effluent Treatment Uptime | 98.2% |
| Mills Monitored | 30 |
| Steam Trap Leaks Closed | 74.4% |
| Community Grievances | 80 |

Values are synthetic. A rebuild reproduces them because the data is HASH-seeded; dates are relative to the build day.

## Demo flow

1. Executive Cockpit: KPIs, daily effluent within threshold, samples over threshold by exceedance cause, mill table
2. Predictive: holdout metrics, risk bands, 14-day emissions forecast, effluent COD anomalies
3. Mill Health: ETP uptime, steam trap leaks closed, inspection completion against effluent within threshold, then generate the action memo
4. Live IoT: run `CALL APP.SIMULATE_TELEMETRY(20)` (Snowflake only) or `python aws/publish_telemetry.py --count 20` (AWS build). Then run `EXECUTE ALERT APP.LIVE_ALARM_ALERT` and show the alert log and email.
5. Ask AI: the Cortex Agent answers metric questions through the semantic view and cites SOPs from Cortex Search. The SQL is shown.
6. QuickSight (AWS build): the same Snowflake tables through DIRECT_QUERY
7. Architecture: both builds side by side

## Talking points

- Per-mill effluent within threshold ranges from 83.1% to 91.1%. Da Nang is the lowest region, at 87.5%.
- Indigo colour carryover puts the most samples over the threshold of the 13 exceedance causes.
- Denim wash plants carry the highest emissions intensity (6,414.3 kg CO2e/t in the synthetic factors); textile printing mills are lowest at 3,564.1 kg CO2e/t.
- The risk model is evaluated on a time-based holdout: precision 0.48 and recall 0.545 at 0.5, against a 0.42 base rate. Present it as triage, not a guarantee.
- The Ho Chi Minh City monsoon stormwater surge and the Da Nang typhoon flood inflow are excluded from exceedance labels, because they are regional events, not mill-driven.
- No figure is a compliance finding against any regulation or standard; all thresholds are internal to the demo.

## Business impact

Use only the sourced references in `README.md` (Business Impact).

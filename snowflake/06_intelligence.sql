-- ============================================================================
-- 06_INTELLIGENCE.SQL - search, anomaly detection, semantic view, agent,
-- live-telemetry alert and on-demand refresh DAG.
-- Run with snowflake/run_intelligence.py (substitutes checked __DEMO_DB__ /
-- __DEMO_WH__ / __ALERT_EMAIL__). Requires 00-05, plus 08 (Snowflake only) or
-- aws/setup_aws.py (AWS build) for RAW.LIVE_TELEMETRY.
-- Alerts and tasks are created SUSPENDED; run them with EXECUTE ALERT / EXECUTE TASK.
-- ============================================================================
USE DATABASE __DEMO_DB__;
CREATE SCHEMA IF NOT EXISTS SEARCH;
CREATE SCHEMA IF NOT EXISTS APP;

-- ---------- Synthetic environmental-response knowledge base (clearly synthetic SOPs) ----------
CREATE OR REPLACE TABLE SEARCH.ESG_SOP_DOCS AS
WITH causes AS (
  SELECT DISTINCT r.ROOT_CAUSE, s.CATEGORY
  FROM RAW.MILL_DAILY r JOIN RAW.MILLS s ON s.ID = r.ENTITY_ID
  WHERE r.ROOT_CAUSE IS NOT NULL AND r.EXCEEDANCE_COUNT > 0
)
SELECT
  'SOP-' || LPAD(ROW_NUMBER() OVER (ORDER BY CATEGORY, ROOT_CAUSE)::VARCHAR, 3, '0') AS DOC_ID,
  'SOP' AS DOC_TYPE,
  CATEGORY,
  ROOT_CAUSE,
  CATEGORY || ' - ' || ROOT_CAUSE || ' exceedance response' AS TITLE,
  'Synthetic demo SOP. Mill type: ' || CATEGORY || '. Exceedance cause: ' || ROOT_CAUSE || '. '
  || 'Step 1: notify the mill environmental officer, log the event in the environmental register and take a confirmation sample. '
  || 'Step 2: ' || CASE
       WHEN ROOT_CAUSE ILIKE '%dye bath%' OR ROOT_CAUSE ILIKE '%desizing%' THEN 'stagger further bath drops, route concentrated liquor to the equalisation tank in small batches and re-sample COD at the outfall before restoring normal flow.'
       WHEN ROOT_CAUSE ILIKE '%equalisation%' OR ROOT_CAUSE ILIKE '%clarifier%' THEN 'hold wet-processing drops, divert the overflow to the emergency holding pond and check level switches and sludge withdrawal.'
       WHEN ROOT_CAUSE ILIKE '%aeration%' THEN 'restart or switch to the standby blower, check dissolved oxygen in the biological reactor and reduce inflow until it recovers.'
       WHEN ROOT_CAUSE ILIKE '%ph %' OR ROOT_CAUSE ILIKE '%dosing%' THEN 'switch to the standby dosing pump, calibrate the pH probe and recirculate effluent until pH is back within the internal range.'
       WHEN ROOT_CAUSE ILIKE '%indigo%' OR ROOT_CAUSE ILIKE '%print paste%' THEN 'increase coagulant dosing, check colour removal at the clarifier and recirculate effluent until colour and COD are back within the internal threshold.'
       WHEN ROOT_CAUSE ILIKE '%pumice%' THEN 'clean the screens and grit trap, increase sludge withdrawal and inspect washing-machine drain filters.'
       WHEN ROOT_CAUSE ILIKE '%temperature%' THEN 'route hot effluent through the cooling tower or heat exchanger until the outfall temperature is back within the internal threshold.'
       WHEN ROOT_CAUSE ILIKE '%stormwater%' OR ROOT_CAUSE ILIKE '%typhoon%' THEN 'switch stormwater to the retention pond, cover chemical stores and inform nearby communities through the community liaison team.'
       ELSE 'record the issue, contain the source and escalate to the regional sustainability lead.'
     END
  || ' Step 3: if COD stays above 80 mg/L or ETP hydraulic load above 90% after containment, keep the mill on the watch list and inform the community liaison team. '
  || 'Step 4: confirm that samples are back within the internal threshold and record the root cause in the environmental register.' AS CONTENT
FROM causes;

CREATE OR REPLACE CORTEX SEARCH SERVICE SEARCH.ESG_SOP_SEARCH
  ON CONTENT
  ATTRIBUTES CATEGORY, ROOT_CAUSE
  WAREHOUSE = __DEMO_WH__
  TARGET_LAG = '7 days'
AS (SELECT DOC_ID, TITLE, CATEGORY, ROOT_CAUSE, CONTENT FROM SEARCH.ESG_SOP_DOCS);

-- ---------- Effluent COD anomaly detection (train first 75 days, detect last 15) ----------
CREATE OR REPLACE VIEW ML.COD_SERIES AS
SELECT ENTITY_ID, EVENT_DATE::TIMESTAMP_NTZ AS TS, COD_MGL::FLOAT AS COD
FROM RAW.MILL_DAILY;
CREATE OR REPLACE VIEW ML.COD_TRAIN AS
SELECT * FROM ML.COD_SERIES WHERE TS < (SELECT DATEADD(day, -15, MAX(TS)) FROM ML.COD_SERIES);
CREATE OR REPLACE VIEW ML.COD_DETECT AS
SELECT * FROM ML.COD_SERIES WHERE TS >= (SELECT DATEADD(day, -15, MAX(TS)) FROM ML.COD_SERIES);

CREATE OR REPLACE SNOWFLAKE.ML.ANOMALY_DETECTION ML.COD_ANOMALY_MODEL(
  INPUT_DATA => SYSTEM$REFERENCE('VIEW', 'ML.COD_TRAIN'),
  SERIES_COLNAME => 'ENTITY_ID', TIMESTAMP_COLNAME => 'TS', TARGET_COLNAME => 'COD',
  LABEL_COLNAME => '');

CREATE OR REPLACE TABLE ML.COD_ANOMALIES AS
SELECT SERIES::VARCHAR AS ENTITY_ID, TS::DATE AS EVENT_DATE, Y AS COD, FORECAST AS EXPECTED,
       LOWER_BOUND, UPPER_BOUND, IS_ANOMALY, PERCENTILE
FROM TABLE(ML.COD_ANOMALY_MODEL!DETECT_ANOMALIES(
  INPUT_DATA => SYSTEM$REFERENCE('VIEW', 'ML.COD_DETECT'),
  SERIES_COLNAME => 'ENTITY_ID', TIMESTAMP_COLNAME => 'TS', TARGET_COLNAME => 'COD'));

-- ---------- Semantic view ----------
CREATE OR REPLACE SEMANTIC VIEW APP.ESG_ANALYTICS
  TABLES (
    sites AS CURATED.PERFORMANCE_SUMMARY PRIMARY KEY (ENTITY_ID)
      WITH SYNONYMS = ('entities', 'mills', 'plants', 'dyehouses')
      COMMENT = 'One row per textile wet-processing mill (entity), 90-day totals',
    risk AS ML.EXCEEDANCE_RISK_SCORES PRIMARY KEY (ENTITY_ID)
      COMMENT = 'Latest next-7-day environmental exceedance probability per mill',
    causes AS CURATED.EXCEEDANCE_CAUSES PRIMARY KEY (ROOT_CAUSE)
      COMMENT = 'Environmental exceedances by root cause, 90 days',
    daily AS CURATED.TREND_ANALYSIS PRIMARY KEY (METRIC_DATE)
      COMMENT = 'Group-wide totals per day'
  )
  RELATIONSHIPS (risk_site AS risk (ENTITY_ID) REFERENCES sites)
  FACTS (
    sites.samples_in_limit_f AS SAMPLES_IN_LIMIT,
    sites.water_samples_f AS WATER_SAMPLES,
    sites.throughput_tonnes_f AS THROUGHPUT_TONNES,
    sites.co2e_tonnes_f AS CO2E_TONNES,
    sites.grievances_f AS GRIEVANCES,
    sites.exceedances_f AS EXCEEDANCE_COUNT,
    sites.downtime_hours_f AS DOWNTIME_HOURS,
    sites.operating_hours_f AS OPERATING_HOURS,
    sites.planned_hours_f AS PLANNED_HOURS,
    risk.exceedance_prob_f AS EXCEEDANCE_PROB_7D,
    causes.cause_exceedances_f AS EXCEEDANCE_COUNT,
    causes.cause_over_limit_f AS SAMPLES_OVER_LIMIT,
    causes.cause_hours_f AS DOWNTIME_HOURS,
    daily.day_in_limit_f AS SAMPLES_IN_LIMIT,
    daily.day_samples_f AS WATER_SAMPLES,
    daily.day_co2e_f AS CO2E_TONNES,
    daily.day_exceedances_f AS EXCEEDANCE_COUNT
  )
  DIMENSIONS (
    sites.site_id AS ENTITY_ID WITH SYNONYMS = ('mill', 'entity', 'entity id', 'mill id'),
    sites.site_name AS ENTITY_NAME,
    sites.region_name AS REGION WITH SYNONYMS = ('city', 'region', 'location') COMMENT = 'Vietnamese city used as a region label',
    sites.site_type AS CATEGORY WITH SYNONYMS = ('mill type', 'process type', 'category'),
    risk.risk_band AS RISK_BAND COMMENT = 'High >= 0.5, Medium >= 0.25, else Low',
    risk.scored_as_of AS SCORED_AS_OF,
    causes.root_cause AS ROOT_CAUSE,
    daily.metric_date AS METRIC_DATE
  )
  METRICS (
    sites.site_count AS COUNT(sites.site_id) WITH SYNONYMS = ('number of entities', 'entity count', 'number of mills'),
    sites.discharge_in_threshold_pct AS 100 * SUM(sites.samples_in_limit_f) / NULLIF(SUM(sites.water_samples_f), 0)
      WITH SYNONYMS = ('effluent quality', 'samples within threshold', 'wastewater compliance share') COMMENT = 'Effluent samples within the internal demo threshold / effluent samples',
    sites.total_exceedances AS SUM(sites.exceedances_f) WITH SYNONYMS = ('exceedances', 'environmental exceedances'),
    sites.emissions_intensity_kg_per_t AS 1000 * SUM(sites.co2e_tonnes_f) / NULLIF(SUM(sites.throughput_tonnes_f), 0)
      WITH SYNONYMS = ('emissions intensity', 'carbon intensity') COMMENT = 'kg CO2e per tonne of fabric processed',
    sites.total_co2e_tonnes AS SUM(sites.co2e_tonnes_f) WITH SYNONYMS = ('emissions', 'total emissions'),
    sites.total_throughput_tonnes AS SUM(sites.throughput_tonnes_f) WITH SYNONYMS = ('throughput', 'fabric tonnes', 'tonnes of fabric processed'),
    sites.total_grievances AS SUM(sites.grievances_f) WITH SYNONYMS = ('grievances', 'community grievances'),
    sites.etp_uptime_pct AS 100 * SUM(sites.operating_hours_f) / NULLIF(SUM(sites.planned_hours_f), 0),
    sites.total_downtime_hours AS SUM(sites.downtime_hours_f),
    risk.avg_exceedance_prob AS AVG(risk.exceedance_prob_f),
    causes.cause_exceedances AS SUM(causes.cause_exceedances_f),
    causes.cause_samples_over_limit AS SUM(causes.cause_over_limit_f),
    causes.cause_downtime_hours AS SUM(causes.cause_hours_f),
    daily.daily_in_threshold_pct AS 100 * SUM(daily.day_in_limit_f) / NULLIF(SUM(daily.day_samples_f), 0),
    daily.daily_co2e_tonnes AS SUM(daily.day_co2e_f),
    daily.daily_exceedances AS SUM(daily.day_exceedances_f)
  )
  COMMENT = 'Synthetic Vietnam textile sustainability analytics (demo)';

-- ---------- Cortex Agent ----------
CREATE OR REPLACE AGENT APP.ESG_AGENT
  COMMENT = 'Sustainability assistant over a synthetic Vietnamese textile dyeing and finishing group'
  FROM SPECIFICATION
$$
models:
  orchestration: claude-sonnet-4-5
instructions:
  response: "Answer only from tool results. State that data is synthetic and that thresholds are internal demo thresholds, not regulatory limits. Give mill IDs and numbers with units."
  orchestration: "Use esg_analyst for effluent samples within threshold, exceedances, emissions and emissions intensity, grievances, effluent treatment plant (ETP) uptime, mills, mill types, regions, risk and root causes. Use sop_search for exceedance response procedures."
tools:
  - tool_spec:
      type: cortex_analyst_text_to_sql
      name: esg_analyst
      description: "Effluent samples within the internal threshold, environmental exceedances, CO2e emissions and intensity, community grievances, effluent treatment uptime, root causes and exceedance-risk scores per mill"
  - tool_spec:
      type: cortex_search
      name: sop_search
      description: "Synthetic exceedance-response SOPs by mill type and cause"
tool_resources:
  esg_analyst:
    semantic_view: __DEMO_DB__.APP.ESG_ANALYTICS
    execution_environment:
      type: warehouse
      warehouse: __DEMO_WH__
  sop_search:
    name: __DEMO_DB__.SEARCH.ESG_SOP_SEARCH
    max_results: 3
    id_column: DOC_ID
    title_column: TITLE
$$;

-- ---------- Live-telemetry alert ----------
CREATE TABLE IF NOT EXISTS APP.ALERT_LOG (
  ALERTED_AT TIMESTAMP_LTZ DEFAULT CURRENT_TIMESTAMP(), SITE_ID VARCHAR,
  EVENT_TS TIMESTAMP_NTZ, COD_MGL FLOAT, ETP_LOAD_PCT FLOAT, SOP_HINT VARCHAR);

CREATE OR REPLACE NOTIFICATION INTEGRATION VN_TEXTILE_SUSTAINABILITY_EMAIL_INT
  TYPE = EMAIL ENABLED = TRUE ALLOWED_RECIPIENTS = ('__ALERT_EMAIL__');

CREATE OR REPLACE PROCEDURE APP.LOG_LIVE_ALARMS()
RETURNS NUMBER
LANGUAGE SQL
EXECUTE AS OWNER
AS
$$
DECLARE
  n NUMBER;
BEGIN
  INSERT INTO APP.ALERT_LOG (SITE_ID, EVENT_TS, COD_MGL, ETP_LOAD_PCT, SOP_HINT)
    SELECT t.SITE_ID, t.EVENT_TS, t.COD_MGL, t.ETP_LOAD_PCT,
           'Check ' || s.CATEGORY || ' SOPs; current risk band ' || COALESCE(r.RISK_BAND, 'n/a')
    FROM RAW.LIVE_TELEMETRY t
    JOIN RAW.MILLS s ON s.ID = t.SITE_ID
    LEFT JOIN ML.EXCEEDANCE_RISK_SCORES r ON r.ENTITY_ID = t.SITE_ID
    WHERE t.STATUS = 'ALARM'
      AND NOT EXISTS (SELECT 1 FROM APP.ALERT_LOG l WHERE l.SITE_ID = t.SITE_ID AND l.EVENT_TS = t.EVENT_TS);
  n := SQLROWCOUNT;
  IF (n > 0) THEN
    CALL SYSTEM$SEND_EMAIL('VN_TEXTILE_SUSTAINABILITY_EMAIL_INT', '__ALERT_EMAIL__',
      '[Demo] Vietnam textile mill effluent COD alarm',
      'New live-telemetry alarms logged in APP.ALERT_LOG: ' || :n || '. Data is synthetic.');
  END IF;
  RETURN n;
END;
$$;

CREATE OR REPLACE ALERT APP.LIVE_ALARM_ALERT
  WAREHOUSE = __DEMO_WH__
  SCHEDULE = '5 MINUTE'
  IF (EXISTS (
    SELECT 1 FROM RAW.LIVE_TELEMETRY t
    WHERE t.STATUS = 'ALARM'
      AND NOT EXISTS (SELECT 1 FROM APP.ALERT_LOG l WHERE l.SITE_ID = t.SITE_ID AND l.EVENT_TS = t.EVENT_TS)))
  THEN CALL APP.LOG_LIVE_ALARMS();

-- ---------- On-demand refresh DAG (suspended; run with EXECUTE TASK APP.TASK_REFRESH_CURATED) ----------
CREATE OR REPLACE PROCEDURE APP.REFRESH_CURATED()
RETURNS VARCHAR
LANGUAGE SQL
EXECUTE AS OWNER
AS
$$
BEGIN
  ALTER DYNAMIC TABLE CURATED.PERFORMANCE_SUMMARY REFRESH;
  ALTER DYNAMIC TABLE CURATED.TREND_ANALYSIS REFRESH;
  ALTER DYNAMIC TABLE CURATED.EXCEEDANCE_CAUSES REFRESH;
  ALTER DYNAMIC TABLE CURATED.KPI_SUMMARY REFRESH;
  RETURN 'refreshed';
END;
$$;

CREATE OR REPLACE TASK APP.TASK_REFRESH_CURATED
  WAREHOUSE = __DEMO_WH__
AS
  CALL APP.REFRESH_CURATED();

CREATE OR REPLACE TASK APP.TASK_RESCORE_RISK
  WAREHOUSE = __DEMO_WH__
  AFTER APP.TASK_REFRESH_CURATED
AS
  CREATE OR REPLACE TABLE ML.EXCEEDANCE_RISK_SCORES COPY GRANTS AS
  WITH latest AS (
    SELECT * FROM ML.EXCEEDANCE_FEATURES QUALIFY ROW_NUMBER() OVER (PARTITION BY ENTITY_ID ORDER BY EVENT_DATE DESC) = 1
  ), p AS (
    SELECT ENTITY_ID, EVENT_DATE,
           ML.EXCEEDANCE_RISK_MODEL!PREDICT(INPUT_DATA => OBJECT_CONSTRUCT(
             'CATEGORY', CATEGORY, 'AGE_YEARS', AGE_YEARS, 'COD_MGL', COD_MGL,
             'ETP_LOAD_PCT', ETP_LOAD_PCT, 'COD_7D', COD_7D, 'EXCEEDANCES_30D', EXCEEDANCES_30D)) AS PRED
    FROM latest
  )
  SELECT ENTITY_ID, EVENT_DATE AS SCORED_AS_OF, ROUND(PRED:probability:EXCEEDANCE::FLOAT, 4) AS EXCEEDANCE_PROB_7D,
         CASE WHEN PRED:probability:EXCEEDANCE::FLOAT >= 0.5 THEN 'High'
              WHEN PRED:probability:EXCEEDANCE::FLOAT >= 0.25 THEN 'Medium' ELSE 'Low' END AS RISK_BAND,
         CURRENT_TIMESTAMP() AS SCORED_AT
  FROM p;

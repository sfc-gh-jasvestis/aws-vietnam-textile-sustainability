-- Synthetic mill-day ESG observations for a fictional textile dyeing and finishing group
-- in Vietnam. Nothing is seeded as a prediction. Randomness is HASH-seeded, so
-- every rebuild is reproducible: per-mill throughput, asset age and
-- exceedance propensity, weekly throughput seasonality and a throughput peak,
-- wear between environmental-control inspections, category-weighted exceedance
-- causes, and two regional storm events.
-- Thresholds are internal demo thresholds, not regulatory limits.
USE DATABASE IDENTIFIER($DEMO_DB);
USE SCHEMA RAW;
USE WAREHOUSE IDENTIFIER($DEMO_WH);

CREATE TABLE RAW.MILLS AS
WITH sites AS (
  SELECT ROW_NUMBER() OVER (ORDER BY SEQ4()) - 1 AS SITE_INDEX
  FROM TABLE(GENERATOR(ROWCOUNT => 30))
), draws AS (
  SELECT SITE_INDEX,
         MOD(ABS(HASH(SITE_INDEX, 'vntxs-age')), 1000000) / 1e6 AS U_AGE,
         MOD(ABS(HASH(SITE_INDEX, 'vntxs-rate')), 1000000) / 1e6 AS U_RATE,
         MOD(ABS(HASH(SITE_INDEX, 'vntxs-insp')), 1000000) / 1e6 AS U_INSP,
         MOD(ABS(HASH(SITE_INDEX, 'vntxs-discipline')), 1000000) / 1e6 AS U_DISCIPLINE,
         MOD(ABS(HASH(SITE_INDEX, 'vntxs-capacity')), 1000000) / 1e6 AS U_CAPACITY
  FROM sites
)
SELECT 'TX-' || LPAD(SITE_INDEX::VARCHAR, 4, '0') AS ID,
       'Synthetic mill ' || LPAD(SITE_INDEX::VARCHAR, 4, '0') AS NAME,
       -- Deterministic spread (7 and 5 are coprime): every region and mill
       -- type is present, with Nam Dinh and Ho Chi Minh City largest. Cities are labels only.
       CASE MOD(SITE_INDEX, 7) WHEN 0 THEN 'Nam Dinh' WHEN 1 THEN 'Nam Dinh'
            WHEN 2 THEN 'Ho Chi Minh City' WHEN 3 THEN 'Ho Chi Minh City'
            WHEN 4 THEN 'Da Nang' ELSE 'Hai Phong' END AS REGION,
       CASE MOD(SITE_INDEX, 5) WHEN 0 THEN 'Knit Dyeing Mill' WHEN 1 THEN 'Woven Dyeing Mill'
            WHEN 2 THEN 'Denim Wash Plant' WHEN 3 THEN 'Textile Printing Mill'
            ELSE 'Yarn Dyeing Mill' END AS CATEGORY,
       SITE_INDEX,
       ROUND(1 + U_AGE * 24, 1) AS AGE_YEARS,
       -- Base daily exceedance probability 0.5%-3.5%; ~15% of mills are chronic (x3).
       (0.005 + U_RATE * 0.03) * IFF(U_RATE > 0.85, 3, 1) AS BASE_EXCEEDANCE_RATE,
       7 * (1 + FLOOR(U_INSP * 3)) AS INSPECTION_INTERVAL_DAYS,
       0.55 + U_DISCIPLINE * 0.45 AS INSPECTION_COMPLETION_PROB,
       -- Fabric processed per day (tonnes).
       ROUND(CASE MOD(SITE_INDEX, 5) WHEN 0 THEN 40 WHEN 1 THEN 35 WHEN 2 THEN 25
                  WHEN 3 THEN 20 ELSE 15 END * (0.8 + U_CAPACITY * 0.4)) AS DAILY_CAPACITY,
       -- Emissions factor (t CO2e per tonne processed), synthetic and by mill type.
       CASE MOD(SITE_INDEX, 5) WHEN 0 THEN 4.0 WHEN 1 THEN 5.0 WHEN 2 THEN 6.0
            WHEN 3 THEN 3.5 ELSE 4.5 END * (0.9 + U_AGE * 0.2) AS EMISSION_FACTOR,
       'Active' AS STATUS
FROM draws;

CREATE TABLE RAW.MILL_DAILY AS
WITH days AS (
  SELECT ROW_NUMBER() OVER (ORDER BY SEQ4()) - 1 AS DAY_INDEX
  FROM TABLE(GENERATOR(ROWCOUNT => 90))
), regional_events AS (
  -- Two region-wide storm events in the window (synthetic).
  SELECT * FROM VALUES (27, 'Ho Chi Minh City', 'Monsoon stormwater surge', 7.0),
                       (64, 'Da Nang', 'Typhoon flood inflow', 10.0)
    AS o(DAY_INDEX, REGION, EVENT_CAUSE, HOURS)
), base AS (
  SELECT s.ID AS ENTITY_ID, s.SITE_INDEX, s.CATEGORY, s.REGION, s.AGE_YEARS,
         s.BASE_EXCEEDANCE_RATE, s.INSPECTION_INTERVAL_DAYS, s.INSPECTION_COMPLETION_PROB,
         s.DAILY_CAPACITY, s.EMISSION_FACTOR, d.DAY_INDEX,
         DATEADD('day', d.DAY_INDEX - 89, CURRENT_DATE()) AS EVENT_DATE,
         24.0 AS PLANNED_HOURS,
         MOD(d.DAY_INDEX + s.SITE_INDEX * 5, s.INSPECTION_INTERVAL_DAYS) AS DAYS_SINCE_INSPECTION,
         MOD(ABS(HASH(s.ID, d.DAY_INDEX, 'vntxs-exc')), 1000000) / 1e6 AS U_EXC,
         MOD(ABS(HASH(s.ID, d.DAY_INDEX, 'vntxs-down')), 1000000) / 1e6 + 1e-6 AS U_DOWN,
         MOD(ABS(HASH(s.ID, d.DAY_INDEX, 'vntxs-cause')), 1000000) / 1e6 AS U_CAUSE,
         MOD(ABS(HASH(s.ID, d.DAY_INDEX, 'vntxs-inspdone')), 1000000) / 1e6 AS U_INSPDONE,
         MOD(ABS(HASH(s.ID, d.DAY_INDEX, 'vntxs-volume')), 1000000) / 1e6 AS U_VOLUME,
         MOD(ABS(HASH(s.ID, d.DAY_INDEX, 'vntxs-noise')), 1000000) / 1e6 AS U_NOISE,
         MOD(ABS(HASH(s.ID, d.DAY_INDEX, 'vntxs-hit')), 1000000) / 1e6 AS U_HIT,
         MOD(ABS(HASH(s.ID, d.DAY_INDEX, 'vntxs-grv')), 1000000) / 1e6 AS U_GRV,
         e.EVENT_CAUSE, e.HOURS AS EVENT_HOURS
  FROM RAW.MILLS s CROSS JOIN days d
  LEFT JOIN regional_events e ON e.DAY_INDEX = d.DAY_INDEX AND e.REGION = s.REGION
), loaded AS (
  SELECT *,
         IFF(DAYS_SINCE_INSPECTION = 0, 1, 0) AS INSPECTION_DUE,
         IFF(DAYS_SINCE_INSPECTION = 0 AND U_INSPDONE < INSPECTION_COMPLETION_PROB, 1, 0) AS INSPECTION_DONE,
         -- Control wear rises between inspections; weak inspection discipline carries wear over.
         DAYS_SINCE_INSPECTION / INSPECTION_INTERVAL_DAYS + (1 - INSPECTION_COMPLETION_PROB) AS WEAR,
         -- Monsoon stress episode: 9 of every 28 days per mill (staggered).
         IFF(MOD(DAY_INDEX + SITE_INDEX * 11, 28) < 9, 1, 0) AS STRESS,
         -- Throughput: weekly low day and a throughput peak on day 45 (+60%) easing over 3 days.
         ROUND(DAILY_CAPACITY * (0.70 + 0.25 * U_VOLUME)
               * IFF(MOD(DAY_INDEX, 7) = 6, 0.75, 1.0)
               * CASE DAY_INDEX - 45 WHEN 0 THEN 1.6 WHEN 1 THEN 1.4 WHEN 2 THEN 1.2 ELSE 1.0 END) AS THROUGHPUT_TONNES
  FROM base
), exceedances AS (
  SELECT *, THROUGHPUT_TONNES / DAILY_CAPACITY AS LOAD_RATIO,
         LEAST(0.5, BASE_EXCEEDANCE_RATE * (0.4 + 1.6 * WEAR) * (0.3 + THROUGHPUT_TONNES / DAILY_CAPACITY)
                    * (1 + AGE_YEARS / 40) * (1 + 2.5 * STRESS)) AS P_EXC
  FROM loaded
), counted AS (
  SELECT *,
         CASE WHEN EVENT_HOURS IS NOT NULL THEN 1
              WHEN U_EXC < P_EXC / 4 THEN 2
              WHEN U_EXC < P_EXC THEN 1
              ELSE 0 END AS EXCEEDANCE_COUNT
  FROM exceedances
)
, timed AS (
  SELECT *,
         -- Effluent treatment offline hours: exponential, mean depends on mill type.
         CASE WHEN EXCEEDANCE_COUNT = 0 THEN 0.0
              WHEN EVENT_HOURS IS NOT NULL THEN EVENT_HOURS
              ELSE LEAST(20.0, ROUND(EXCEEDANCE_COUNT * (0.5 - LN(U_DOWN) *
                   CASE CATEGORY WHEN 'Knit Dyeing Mill' THEN 3.0 WHEN 'Woven Dyeing Mill' THEN 2.0
                                 WHEN 'Denim Wash Plant' THEN 4.0 WHEN 'Textile Printing Mill' THEN 2.5 ELSE 3.5 END), 1))
         END AS DOWNTIME_HOURS,
         -- Share of effluent samples within the internal demo threshold.
         LEAST(0.995, GREATEST(0.50,
           CASE CATEGORY WHEN 'Knit Dyeing Mill' THEN 0.940 WHEN 'Woven Dyeing Mill' THEN 0.960
                         WHEN 'Denim Wash Plant' THEN 0.935 WHEN 'Textile Printing Mill' THEN 0.955 ELSE 0.950 END
             - 0.025 * WEAR - 0.04 * GREATEST(0, LOAD_RATIO - 0.9) - 0.006 * U_NOISE
             - EXCEEDANCE_COUNT * (0.08 + 0.12 * U_HIT))) AS IN_LIMIT_RATE,
         12 + FLOOR(U_VOLUME * 13) AS WATER_SAMPLES
  FROM counted
)
SELECT ENTITY_ID || '-' || TO_CHAR(EVENT_DATE, 'YYYYMMDD') AS EVENT_ID,
       ENTITY_ID, EVENT_DATE, PLANNED_HOURS, DOWNTIME_HOURS,
       PLANNED_HOURS - DOWNTIME_HOURS AS OPERATING_HOURS,
       EXCEEDANCE_COUNT,
       CASE WHEN EXCEEDANCE_COUNT = 0 THEN 'None'
            WHEN EVENT_CAUSE IS NOT NULL THEN EVENT_CAUSE
            WHEN CATEGORY = 'Knit Dyeing Mill' THEN IFF(U_CAUSE < 0.5, 'Reactive dye bath dump', IFF(U_CAUSE < 0.8, 'Equalisation tank overflow', 'Aeration blower trip'))
            WHEN CATEGORY = 'Woven Dyeing Mill' THEN IFF(U_CAUSE < 0.55, 'Desizing effluent surge', 'pH neutralisation fault')
            WHEN CATEGORY = 'Denim Wash Plant' THEN IFF(U_CAUSE < 0.6, 'Indigo colour carryover', 'Pumice sludge carryover')
            WHEN CATEGORY = 'Textile Printing Mill' THEN IFF(U_CAUSE < 0.6, 'Print paste washout', 'Effluent temperature excursion')
            ELSE IFF(U_CAUSE < 0.6, 'Clarifier sludge overflow', 'Chemical dosing pump fault') END AS ROOT_CAUSE,
       INSPECTION_DUE, INSPECTION_DONE,
       WATER_SAMPLES,
       FLOOR(WATER_SAMPLES * IN_LIMIT_RATE) AS SAMPLES_IN_LIMIT,
       THROUGHPUT_TONNES,
       ROUND(THROUGHPUT_TONNES * EMISSION_FACTOR * (1 + 0.05 * U_NOISE + 0.03 * WEAR), 1) AS CO2E_TONNES,
       IFF(U_GRV < 0.02 + 0.04 * EXCEEDANCE_COUNT + 0.01 * STRESS, 1, 0) AS GRIEVANCES,
       -- COD in treated effluent (mg/L) and ETP hydraulic load (% of design).
       ROUND(12 + 18 * WEAR + 25 * GREATEST(0, LOAD_RATIO - 0.8) + 10 * STRESS + 30 * EXCEEDANCE_COUNT + U_NOISE * 5, 1) AS COD_MGL,
       ROUND(LEAST(100, 100 * LOAD_RATIO * (0.75 + 0.1 * U_NOISE) + 7 * STRESS + 4 * EXCEEDANCE_COUNT), 1) AS ETP_LOAD_PCT,
       CURRENT_TIMESTAMP() AS LOADED_AT
FROM timed;

-- Steam trap leak survey progress per mill (snapshot):
-- leaks found in the latest survey versus leaks closed.
CREATE TABLE RAW.STEAM_TRAP_SURVEY AS
SELECT ID AS ENTITY_ID,
       CASE CATEGORY WHEN 'Knit Dyeing Mill' THEN 'Jet dyeing machines' WHEN 'Woven Dyeing Mill' THEN 'Jigger and pad-batch lines'
                     WHEN 'Denim Wash Plant' THEN 'Denim washing machines' WHEN 'Textile Printing Mill' THEN 'Steamers and stenters'
                     ELSE 'Package dyeing machines' END AS SURVEY_SCOPE,
       20 + MOD(ABS(HASH(ID, 'vntxs-req')), 61) AS LEAKS_DETECTED,
       FLOOR((20 + MOD(ABS(HASH(ID, 'vntxs-req')), 61)) * (0.55 + MOD(ABS(HASH(ID, 'vntxs-avail')), 1000) / 1000 * 0.40)) AS LEAKS_CLOSED,
       MOD(ABS(HASH(ID, 'vntxs-order')), 8) AS LEAKS_SCHEDULED,
       CURRENT_DATE() AS SNAPSHOT_DATE
FROM RAW.MILLS;

-- ============================================================================
-- 04_DYNAMIC_TABLES.SQL — Curated layer for Sustainability Compliance
-- ============================================================================
USE DATABASE TEXTILE_SUSTAINABILITY;
USE SCHEMA CURATED;

-- PERFORMANCE_DASHBOARD: Real-time sustainability compliance KPIs
-- Source: OPERATIONS, METRICS
CREATE OR REPLACE DYNAMIC TABLE CURATED.PERFORMANCE_DASHBOARD
  TARGET_LAG = '5 minutes'
  WAREHOUSE = TEXTILE_WH
AS
SELECT * FROM RAW.OPERATIONS;
-- TODO: Replace with actual join/aggregation logic per demo

-- TREND_ANALYTICS: Trend analysis and deviation detection
-- Source: METRICS, ASSETS
CREATE OR REPLACE DYNAMIC TABLE CURATED.TREND_ANALYTICS
  TARGET_LAG = '5 minutes'
  WAREHOUSE = TEXTILE_WH
AS
SELECT * FROM RAW.METRICS;
-- TODO: Replace with actual join/aggregation logic per demo

-- FORECAST_INPUT: Time-series for ML.FORECAST
-- Source: METRICS
CREATE OR REPLACE DYNAMIC TABLE CURATED.FORECAST_INPUT
  TARGET_LAG = '5 minutes'
  WAREHOUSE = TEXTILE_WH
AS
SELECT * FROM RAW.METRICS;
-- TODO: Replace with actual join/aggregation logic per demo

-- OPERATIONAL_RISK: Risk scoring and early warning
-- Source: EVENTS, METRICS
CREATE OR REPLACE DYNAMIC TABLE CURATED.OPERATIONAL_RISK
  TARGET_LAG = '5 minutes'
  WAREHOUSE = TEXTILE_WH
AS
SELECT * FROM RAW.EVENTS;
-- TODO: Replace with actual join/aggregation logic per demo


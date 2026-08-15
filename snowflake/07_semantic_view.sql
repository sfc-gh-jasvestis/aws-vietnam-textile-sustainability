-- ============================================================================
-- 07_SEMANTIC_VIEW.SQL — Semantic View for Sustainability Compliance
-- ============================================================================
USE DATABASE TEXTILE_SUSTAINABILITY;
USE SCHEMA APP;

CREATE OR REPLACE SEMANTIC VIEW APP.TEXTILE_SUSTAINABILITY_ANALYTICS
  COMMENT = 'Textile & Garment sustainability compliance analytics'
AS
  TABLES (
    CURATED.PERFORMANCE_DASHBOARD AS performance_dashboard,CURATED.TREND_ANALYTICS AS trend_analytics,CURATED.FORECAST_INPUT AS forecast_input,CURATED.OPERATIONAL_RISK AS operational_risk
  );

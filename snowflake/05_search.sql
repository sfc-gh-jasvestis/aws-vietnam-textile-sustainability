-- ============================================================================
-- 05_SEARCH.SQL — Cortex Search for Sustainability Compliance
-- ============================================================================
USE DATABASE TEXTILE_SUSTAINABILITY;
USE SCHEMA SEARCH;

CREATE OR REPLACE CORTEX SEARCH SERVICE SEARCH.TEXTILE_SUSTAINABILITY_SEARCH
  ON CONTENT
  ATTRIBUTES DOC_TYPE, CATEGORY
  WAREHOUSE = TEXTILE_WH
  TARGET_LAG = '1 hour'
AS (
  SELECT * FROM RAW.DOCUMENTS
);

-- ============================================================================
-- 03_STAGING.SQL — Generate synthetic data for Sustainability Compliance
-- Country: VIETNAM | Currency: VND
-- ============================================================================
USE DATABASE TEXTILE_SUSTAINABILITY;
USE SCHEMA RAW;

-- Data generation scripts are demo-specific.
-- See the handcrafted SQL in the aws-malaysia-semiconductor-yield demo for
-- the full pattern: GENERATOR + UNIFORM + LATERAL for distribution,
-- Cortex Complete for text generation, engineered key demo numbers.

-- Target row counts:
-- OPERATIONS: 100,000 rows — Core operational records for sustainability compliance
-- METRICS: 500,000 rows — Time-series performance metrics
-- ASSETS: 5,000 rows — Asset and entity master data
-- EVENTS: 200,000 rows — Operational events and incidents
-- DOCUMENTS: 100 rows — SOPs, reports, and compliance docs

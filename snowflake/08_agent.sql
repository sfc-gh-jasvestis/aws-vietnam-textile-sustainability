-- ============================================================================
-- 08_AGENT.SQL — Cortex Agent for Sustainability Compliance
-- ============================================================================
USE DATABASE TEXTILE_SUSTAINABILITY;
USE SCHEMA APP;

CREATE OR REPLACE CORTEX AGENT APP.TEXTILE_SUSTAINABILITY_AGENT
  COMMENT = 'Sustainability Compliance AI Assistant'
  MODEL = 'claude-opus-4-8'
  TOOLS = (
    SEMANTIC_VIEW_TOOL(SEMANTIC_VIEW => 'TEXTILE_SUSTAINABILITY.APP.TEXTILE_SUSTAINABILITY_ANALYTICS'),    CORTEX_SEARCH_TOOL(CORTEX_SEARCH_SERVICE => 'TEXTILE_SUSTAINABILITY.SEARCH.TEXTILE_SUSTAINABILITY_SEARCH', TOOL_DESCRIPTION => 'Search documents for Textile & Garment information')
  )
  SYSTEM_PROMPT = 'You are the Sustainability Compliance Agent for Vietnamese textile & garment operations in Hai Duong & Nam Dinh.';

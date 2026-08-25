# Sustainability Compliance

Sustainability Compliance for Vietnam - ML.FORECAST and Dynamic Tables power real-time sustainability compliance intelligence for textile & garment in Hai Duong & Nam Dinh.

## Architecture

Vietnam textile & garment faces increasing complexity in sustainability compliance. Decision-makers in Hai Duong & Nam Dinh need real-time intelligence and ML-powered recommendations.

```mermaid
flowchart LR
    S3[S3 Data Landing] --> SP[Snowpipe]
    SPS --> RAW
    RAW --> DT[Dynamic Tables]
    DT --> ML[ML Functions]
    DT --> SEARCH[Cortex Search]
    DT --> SV[Semantic View]
    SV --> AGENT[Cortex Agent]
    SEARCH --> AGENT
    DT --> APP[React App SPCS]
    SM[SageMaker] --> DT
    BR[Bedrock] --> APP
    DT --> QS[QuickSight + Q]
```

## Snowflake Capabilities

| Capability | Implementation |
|-----------|---------------|
| Dynamic Tables | PERFORMANCE_DASHBOARD / TREND_ANALYTICS / FORECAST_INPUT / OPERATIONAL_RISK |
| ML Functions | ML.FORECAST + ML.ANOMALY_DETECTION |
| Cortex AI | COMPLETE, SUMMARIZE, AI_CLASSIFY |
| Cortex Search | 100 documents indexed |
| Cortex Agent | TEXTILE_SUSTAINABILITY_AGENT |
| Semantic View | TEXTILE_SUSTAINABILITY_ANALYTICS |
| React App (SPCS) | 5 tabs + DemoGuide |


## AWS Services

| Service | Role in Demo |
|---------|-------------|
| AWS IoT Core | Ingest real-time data from textile & garment systems |
| Amazon SageMaker | Sustainability Compliance ML models |
| AWS Glue | ETL and data transformation |
| Apache Iceberg (S3) | Open table format for data sharing |
| Amazon Bedrock (Claude) | Generate sustainability compliance recommendations |
| Amazon QuickSight + Q | Sustainability Compliance dashboard with NL queries |


## Personas

| Persona | Role | Key Questions |
|---------|------|---------------|
| **Nguyen Thi Linh** | VP Sustainability | "What are the key sustainability compliance metrics?" "Which areas need attention?" |
| **Pham Van Hieu** | Environmental Engineer | "Show me the trend analysis." "Which operations are underperforming?" |


## Data

| Table | Rows | Description |
|-------|------|-------------|
| OPERATIONS | 100,000 | Core operational records for sustainability compliance |
| METRICS | 500,000 | Time-series performance metrics |
| ASSETS | 5,000 | Asset and entity master data |
| EVENTS | 200,000 | Operational events and incidents |
| DOCUMENTS | 100 | SOPs, reports, and compliance docs |


## Build Instructions

### Prerequisites
- Snowflake account with ACCOUNTADMIN access
- Cortex AI enabled (ML Functions, Search, Agent)
- Warehouse: TEXTILE_WH (Medium)
- AWS CLI with access (us-west-2)

### Deployment

```bash
snowsql -f snowflake/00_setup.sql
snowsql -f snowflake/01_marketplace_install.sql
snowsql -f snowflake/02_raw_tables.sql
snowsql -f snowflake/03_staging.sql
snowsql -f snowflake/04_dynamic_tables.sql
snowsql -f snowflake/05_search.sql
snowsql -f snowflake/06_ml_models.sql
snowsql -f snowflake/07_semantic_view.sql
snowsql -f snowflake/08_agent.sql
```

### React App (SPCS)
```bash
cd app && npm ci && npm run build
docker build -t aws-vietnam-textile-sustainability-app .
docker push bdiqc8sm-default.registry.snowflakecomputing.com/textile_sustainability/app/aws_vietnam_textile_sustainability/app:latest
```

### Demo Mode
Open the app URL with `?demo=true` for presenter view.

## Build Modes

### Snowflake Only
Run scripts 00-08 (skip AWS-specific integration). Uses:
- **Snowpipe Streaming SDK** instead of AWS IoT Core
- **ML.FORECAST + ML.ANOMALY_DETECTION** instead of Amazon SageMaker
- **Dynamic Tables** instead of AWS Glue
- **Snowflake-managed Iceberg Tables** instead of Apache Iceberg (S3)
- **Cortex Complete** instead of Amazon Bedrock (Claude)
- **Snowflake Intelligence (Cortex Analyst)** instead of Amazon QuickSight + Q

### Full AWS + Snowflake
Run all scripts including AWS integration. Deploy QuickSight dashboard from `quicksight/`.

## Business Impact

Industry research and Snowflake customer outcomes:
- **Fashion industry accounts for 10% of global carbon emissions — Vietnam's textile sector emits 5M tonnes CO2 annually** — [UNEP](https://www.unep.org/topics/chemicals-and-pollution-action/pollution-and-health/textiles)
- **EU Strategy for Sustainable Textiles requires digital product passports by 2027 for all garments sold in EU** — [European Commission](https://environment.ec.europa.eu/strategy/textiles-strategy_en)
- **Brands paying 5-15% premiums for certified sustainable production — Higg Index adoption growing 40% YoY** — [Cascale (formerly SAC)](https://cascale.org/the-higg-index/)
- **H&M Group tracks sustainability KPIs across 1,500+ suppliers using real-time data platforms** — [H&M Sustainability Report 2024](https://hmgroup.com/sustainability/sustainability-reporting/)

## Key Demo Numbers

- **100K operations** tracked in Hai Duong & Nam Dinh
- **500K metrics** time-series data points
- **5K assets** monitored
- **100 docs** searchable


## License

Apache 2.0 — See [LICENSE](LICENSE) for details.

This is a personal demo project and is not an official Snowflake offering. It comes with no support or warranty.
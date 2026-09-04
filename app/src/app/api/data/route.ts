import { NextResponse } from 'next/server';
import { executeQuery } from '@/lib/snowflake';

// Always hit Snowflake - never serve a cached build-time response.
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const SCHEMA = 'CURATED';

/**
 * Every demo database shares the same CURATED table names and common columns,
 * but the primary metric column is domain specific (AVG_GENERATION_MWH,
 * AVG_FRAUD_RATE, AVG_LINE_YIELD, ...). Discover it at runtime so one route
 * works across all demos.
 */
async function discoverMetricColumns() {
  const rows = await executeQuery<{ TABLE_NAME: string; COLUMN_NAME: string }>(`
    SELECT TABLE_NAME, COLUMN_NAME
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = '${SCHEMA}'
      AND TABLE_NAME IN ('TREND_ANALYSIS', 'PERFORMANCE_SUMMARY')
      AND COLUMN_NAME LIKE 'AVG%'
    QUALIFY ROW_NUMBER() OVER (PARTITION BY TABLE_NAME ORDER BY ORDINAL_POSITION) = 1
  `);

  const found: Record<string, string> = {};
  for (const row of rows) found[row.TABLE_NAME] = row.COLUMN_NAME;

  return {
    trend: found.TREND_ANALYSIS || 'DAILY_EVENTS',
    perf: found.PERFORMANCE_SUMMARY || 'EVENT_COUNT',
  };
}

function prettyMetricName(column: string): string {
  return column.replace(/^AVG_/, '').replace(/_/g, ' ');
}

/**
 * Every AVG_* column on PERFORMANCE_SUMMARY, in declaration order. The map's
 * drill-down panel shows these per region, so it needs the whole set rather
 * than just the leading metric discoverMetricColumns() returns.
 *
 * Capped so a demo with a dozen metrics cannot overflow the panel.
 */
const MAX_DRILLDOWN_METRICS = 6;

async function discoverPerfMetrics(): Promise<string[]> {
  const rows = await executeQuery<{ COLUMN_NAME: string }>(`
    SELECT COLUMN_NAME
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = '${SCHEMA}'
      AND TABLE_NAME = 'PERFORMANCE_SUMMARY'
      AND COLUMN_NAME LIKE 'AVG%'
    ORDER BY ORDINAL_POSITION
    LIMIT ${MAX_DRILLDOWN_METRICS}
  `).catch(() => []);

  return rows.map((r) => r.COLUMN_NAME);
}

export async function GET() {
  try {
    const [metric, perfMetrics] = await Promise.all([
      discoverMetricColumns(),
      discoverPerfMetrics(),
    ]);

    // Per-region rollup for the map. Selecting the metric columns dynamically is
    // what lets one route serve every demo, so the map shows the same regions the
    // charts do instead of a hardcoded city list.
    const regionMetricSelect = perfMetrics
      .map((c) => `ROUND(AVG(${c}), 1) AS ${c}`)
      .join(',\n               ');

    // KPI_SUMMARY is one row per KPI card, pre-formatted for display. It only
    // exists on demos whose seed data has been regenerated, so a failure here
    // must not take down the charts - fall back to an empty list.
    const kpiCards = await executeQuery<{ TITLE: string; DISPLAY: string; STATUS: string }>(`
      SELECT TITLE, DISPLAY, STATUS
      FROM ${SCHEMA}.KPI_SUMMARY
      ORDER BY SORT_ORDER
    `).catch(() => []);

    const [kpiRows, trendRows, regionRows, catMetricRows, detailRows, categoryRows, regionAlertRows, entityRows, geoRows] = await Promise.all([
      executeQuery<Record<string, number>>(`
        SELECT COUNT(DISTINCT ENTITY_ID) AS TOTAL_ENTITIES,
               SUM(EVENT_COUNT)          AS TOTAL_EVENTS,
               ROUND(AVG(${metric.perf}), 1) AS AVG_METRIC,
               SUM(ALERT_COUNT)          AS TOTAL_ALERTS
        FROM ${SCHEMA}.PERFORMANCE_SUMMARY
      `),

      executeQuery<{ PERIOD: string; VALUE: number }>(`
        SELECT TO_CHAR(METRIC_DATE, 'Mon DD') AS PERIOD,
               ROUND(AVG(${metric.trend}), 1) AS VALUE
        FROM ${SCHEMA}.TREND_ANALYSIS
        GROUP BY METRIC_DATE
        ORDER BY METRIC_DATE
      `),

      executeQuery<{ CATEGORY: string; COUNT: number }>(`
        SELECT REGION AS CATEGORY, ROUND(AVG(${metric.perf}), 1) AS COUNT
        FROM ${SCHEMA}.PERFORMANCE_SUMMARY
        GROUP BY REGION
        ORDER BY COUNT DESC
      `),

      // The same leading metric broken out by CATEGORY rather than REGION. Charts
      // titled "... by Product Type" need a category x-axis; binding them to the
      // region series above showed places under a product heading.
      // Deliberately the same {category, count} shape as the region series so a
      // page can switch between them without touching xKey or yKeys.
      executeQuery<{ CATEGORY: string; COUNT: number }>(`
        SELECT CATEGORY, ROUND(AVG(${metric.perf}), 1) AS COUNT
        FROM ${SCHEMA}.PERFORMANCE_SUMMARY
        GROUP BY CATEGORY
        ORDER BY COUNT DESC
      `),

      executeQuery<{ X: string; Y: number }>(`
        SELECT TO_CHAR(METRIC_DATE, 'Dy DD') AS X,
               ROUND(AVG(${metric.trend}), 1) AS Y
        FROM ${SCHEMA}.TREND_ANALYSIS
        WHERE METRIC_DATE >= DATEADD('day', -7, (SELECT MAX(METRIC_DATE) FROM ${SCHEMA}.TREND_ANALYSIS))
        GROUP BY METRIC_DATE
        ORDER BY METRIC_DATE
      `),

      executeQuery<{ LABEL: string; VALUE: number }>(`
        SELECT CATEGORY AS LABEL, SUM(ALERT_COUNT) AS VALUE
        FROM ${SCHEMA}.PERFORMANCE_SUMMARY
        GROUP BY CATEGORY
        ORDER BY VALUE DESC
      `),

      // Region counterpart of breakdown, same {label, value} shape, for charts
      // whose title names a place ("... by Province", "... by Grid Zone").
      executeQuery<{ LABEL: string; VALUE: number }>(`
        SELECT REGION AS LABEL, SUM(ALERT_COUNT) AS VALUE
        FROM ${SCHEMA}.PERFORMANCE_SUMMARY
        GROUP BY REGION
        ORDER BY VALUE DESC
      `),

      executeQuery<{ ID: string; NAME: string; REGION: string; VALUE: number; ALERTS: number }>(`
        SELECT ENTITY_ID AS ID, ENTITY_NAME AS NAME, REGION,
               ROUND(AVG(${metric.perf}), 1) AS VALUE,
               SUM(ALERT_COUNT) AS ALERTS
        FROM ${SCHEMA}.PERFORMANCE_SUMMARY
        GROUP BY ENTITY_ID, ENTITY_NAME, REGION
        ORDER BY VALUE DESC
        LIMIT 20
      `),

      executeQuery<Record<string, string | number>>(`
        SELECT REGION,
               COUNT(DISTINCT ENTITY_ID) AS ENTITIES,
               SUM(EVENT_COUNT)          AS EVENTS,
               SUM(ALERT_COUNT)          AS ALERTS${regionMetricSelect ? ',' : ''}
               ${regionMetricSelect}
        FROM ${SCHEMA}.PERFORMANCE_SUMMARY
        GROUP BY REGION
        ORDER BY EVENTS DESC
      `),
    ]);

    // Derive a status band from alert volume relative to the busiest entity.
    const maxAlerts = Math.max(1, ...entityRows.map((r) => Number(r.ALERTS) || 0));

    // Map markers, derived from the same PERFORMANCE_SUMMARY rows the charts read.
    // Colour bands by alert rate so the map carries a health signal rather than
    // being decorative. Size ranks by the leading metric - the same column the
    // region bar chart plots - so marker size and bar height tell one story.
    //
    // Event counts are deliberately NOT used for size: the generated fact table
    // spreads rows evenly across regions, so every marker would come out identical.
    const leadOf = (r: Record<string, string | number>) =>
      perfMetrics.length ? Number(r[perfMetrics[0]]) || 0 : Number(r.EVENTS) || 0;

    const leadValues = geoRows.map(leadOf);
    const leadMin = Math.min(...leadValues, Infinity);
    const leadMax = Math.max(...leadValues, -Infinity);
    const leadRange = leadMax - leadMin;

    const maxRegionAlerts = Math.max(1, ...geoRows.map((r) => Number(r.ALERTS) || 0));

    const regions = geoRows.map((r) => {
      const alerts = Number(r.ALERTS) || 0;
      const alertRatio = alerts / maxRegionAlerts;

      // Normalise between the smallest and largest region rather than against the
      // max alone: these metrics cluster tightly, so a plain ratio would put every
      // region in the same band.
      const rank = leadRange > 0 ? (leadOf(r) - leadMin) / leadRange : 0.5;

      return {
        region: String(r.REGION),
        entities: Number(r.ENTITIES) || 0,
        events: Number(r.EVENTS) || 0,
        alerts,
        value: leadOf(r),
        status: alertRatio > 0.85 ? 'Critical' : alertRatio > 0.6 ? 'Watch' : 'Normal',
        color: alertRatio > 0.85 ? 'red' : alertRatio > 0.6 ? 'amber' : 'green',
        size: rank > 0.66 ? 'lg' : rank > 0.33 ? 'md' : 'sm',
        metrics: perfMetrics.map((c) => ({
          label: prettyMetricName(c),
          value: Number(r[c]) || 0,
        })),
      };
    });

    return NextResponse.json({
      kpis: kpiRows[0] || {},
      kpiCards: kpiCards.map((r) => ({
        title: r.TITLE,
        value: r.DISPLAY,
        status: r.STATUS,
      })),
      metricName: prettyMetricName(metric.perf),
      timeseries: trendRows.map((r) => ({ period: r.PERIOD, value: Number(r.VALUE) })),
      categories: regionRows.map((r) => ({ category: r.CATEGORY, count: Number(r.COUNT) })),
      categoryMetric: catMetricRows.map((r) => ({ category: r.CATEGORY, count: Number(r.COUNT) })),
      detail: detailRows.map((r) => ({ x: r.X, y: Number(r.Y) })),
      breakdown: categoryRows.map((r) => ({ label: r.LABEL, value: Number(r.VALUE) })),
      regionAlerts: regionAlertRows.map((r) => ({ label: r.LABEL, value: Number(r.VALUE) })),
      regions,
      entities: entityRows.map((r) => {
        const alerts = Number(r.ALERTS) || 0;
        const ratio = alerts / maxAlerts;
        return {
          id: r.ID,
          name: r.NAME,
          region: r.REGION,
          status: ratio > 0.9 ? 'Critical' : ratio > 0.7 ? 'Watch' : 'Healthy',
          value: Number(r.VALUE),
          alerts,
        };
      }),
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Data fetch error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch data', details: String(error) },
      { status: 500 }
    );
  }
}

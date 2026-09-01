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

export async function GET() {
  try {
    const metric = await discoverMetricColumns();

    // KPI_SUMMARY is one row per KPI card, pre-formatted for display. It only
    // exists on demos whose seed data has been regenerated, so a failure here
    // must not take down the charts - fall back to an empty list.
    const kpiCards = await executeQuery<{ TITLE: string; DISPLAY: string; STATUS: string }>(`
      SELECT TITLE, DISPLAY, STATUS
      FROM ${SCHEMA}.KPI_SUMMARY
      ORDER BY SORT_ORDER
    `).catch(() => []);

    const [kpiRows, trendRows, regionRows, detailRows, categoryRows, entityRows] = await Promise.all([
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

      executeQuery<{ ID: string; NAME: string; REGION: string; VALUE: number; ALERTS: number }>(`
        SELECT ENTITY_ID AS ID, ENTITY_NAME AS NAME, REGION,
               ROUND(AVG(${metric.perf}), 1) AS VALUE,
               SUM(ALERT_COUNT) AS ALERTS
        FROM ${SCHEMA}.PERFORMANCE_SUMMARY
        GROUP BY ENTITY_ID, ENTITY_NAME, REGION
        ORDER BY VALUE DESC
        LIMIT 20
      `),
    ]);

    // Derive a status band from alert volume relative to the busiest entity.
    const maxAlerts = Math.max(1, ...entityRows.map((r) => Number(r.ALERTS) || 0));

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
      detail: detailRows.map((r) => ({ x: r.X, y: Number(r.Y) })),
      breakdown: categoryRows.map((r) => ({ label: r.LABEL, value: Number(r.VALUE) })),
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

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
  // A failure here used to return [] silently, which emptied the map's metric
  // list and made marker sizing fall back to a uniform column. Log it, and let
  // the caller substitute the leading metric so the panel is never blank.
  const rows = await executeQuery<{ COLUMN_NAME: string }>(`
    SELECT COLUMN_NAME
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = '${SCHEMA}'
      AND TABLE_NAME = 'PERFORMANCE_SUMMARY'
      AND COLUMN_NAME LIKE 'AVG%'
    ORDER BY ORDINAL_POSITION
    LIMIT ${MAX_DRILLDOWN_METRICS}
  `).catch((e) => {
    console.error('PERFORMANCE_SUMMARY metric discovery failed:', e);
    return [] as { COLUMN_NAME: string }[];
  });

  return rows.map((r) => r.COLUMN_NAME);
}

export async function GET() {
  try {
    const [metric, discovered] = await Promise.all([
      discoverMetricColumns(),
      discoverPerfMetrics(),
    ]);

    // If discovery failed, fall back to the leading metric so the drill-down
    // still shows something rather than an empty list.
    const perfMetrics = discovered.length
      ? discovered
      : metric.perf.startsWith('AVG') ? [metric.perf] : [];

    // Per-region rollup for the map. Selecting the metric columns dynamically is
    // what lets one route serve every demo, so the map shows the same regions the
    // charts do instead of a hardcoded city list.
    const regionMetricSelect = perfMetrics
      .map((c) => `ROUND(AVG(${c}), 1) AS ${c}`)
      .join(',\n               ');

    // The scorecard shows several metrics per entity, not just the leading one.
    const entityMetricSelect = regionMetricSelect;

    // KPI_SUMMARY is one row per KPI card, pre-formatted for display. It only
    // exists on demos whose seed data has been regenerated, so a failure here
    // must not take down the charts - fall back to an empty list.
    const kpiCards = await executeQuery<{ TITLE: string; DISPLAY: string; STATUS: string }>(`
      SELECT TITLE, DISPLAY, STATUS
      FROM ${SCHEMA}.KPI_SUMMARY
      ORDER BY SORT_ORDER
    `).catch(() => []);

    const [kpiRows, trendRows, regionRows, catMetricRows, detailRows, categoryRows, regionAlertRows, entityRows, regionCatRows, geoRows] = await Promise.all([
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

      executeQuery<Record<string, string | number>>(`
        SELECT ENTITY_ID AS ID, ENTITY_NAME AS NAME, REGION, CATEGORY,
               SUM(EVENT_COUNT) AS EVENTS,
               SUM(ALERT_COUNT) AS ALERTS${entityMetricSelect ? ',' : ''}
               ${entityMetricSelect}
        FROM ${SCHEMA}.PERFORMANCE_SUMMARY
        GROUP BY ENTITY_ID, ENTITY_NAME, REGION, CATEGORY
        ORDER BY ALERTS DESC
        LIMIT 200
      `),

      // Region x category mix. This is what turns the drill-down from three
      // numbers into a finding: one commodity usually owns most of a region's
      // alerts, which is the point a demo wants to land.
      executeQuery<Record<string, string | number>>(`
        SELECT REGION, CATEGORY,
               SUM(EVENT_COUNT) AS EVENTS,
               SUM(ALERT_COUNT) AS ALERTS
        FROM ${SCHEMA}.PERFORMANCE_SUMMARY
        GROUP BY REGION, CATEGORY
        ORDER BY ALERTS DESC
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

    // Estate-wide alert rate, so a region can be expressed as a MULTIPLE of the
    // national average ("2.1x") rather than a bare count nobody can calibrate.
    const estateEvents = geoRows.reduce((a, r) => a + (Number(r.EVENTS) || 0), 0);
    const estateAlerts = geoRows.reduce((a, r) => a + (Number(r.ALERTS) || 0), 0);
    const estateRate = estateEvents > 0 ? estateAlerts / estateEvents : 0;

    const regions = geoRows.map((r) => {
      const alerts = Number(r.ALERTS) || 0;
      const events = Number(r.EVENTS) || 0;
      const alertRatio = alerts / maxRegionAlerts;

      // Normalise between the smallest and largest region rather than against the
      // max alone: these metrics cluster tightly, so a plain ratio would put every
      // region in the same band.
      const rank = leadRange > 0 ? (leadOf(r) - leadMin) / leadRange : 0.5;

      const rate = events > 0 ? alerts / events : 0;

      // What is actually happening here, worst first, with each category's share
      // of this region's alerts.
      const mix = regionCatRows
        .filter((c) => c.REGION === r.REGION)
        .map((c) => ({
          category: String(c.CATEGORY),
          events: Number(c.EVENTS) || 0,
          alerts: Number(c.ALERTS) || 0,
          share: alerts > 0 ? Math.round(((Number(c.ALERTS) || 0) / alerts) * 100) : 0,
        }))
        .sort((a, b) => b.alerts - a.alerts);

      // The sites driving it. Worst first - that is the one to click into next.
      const sites = entityRows
        .filter((e) => e.REGION === r.REGION)
        .map((e) => ({
          name: String(e.NAME),
          alerts: Number(e.ALERTS) || 0,
          value: perfMetrics.length ? Number(e[perfMetrics[0]]) || 0 : 0,
        }))
        .sort((a, b) => b.alerts - a.alerts)
        .slice(0, 3);

      return {
        region: String(r.REGION),
        entities: Number(r.ENTITIES) || 0,
        events,
        alerts,
        value: leadOf(r),
        alertRate: Math.round(rate * 1000) / 10,
        rateVsEstate: estateRate > 0 ? Math.round((rate / estateRate) * 10) / 10 : 1,
        status: alertRatio > 0.85 ? 'Critical' : alertRatio > 0.6 ? 'Watch' : 'Normal',
        color: alertRatio > 0.85 ? 'red' : alertRatio > 0.6 ? 'amber' : 'green',
        size: rank > 0.66 ? 'lg' : rank > 0.33 ? 'md' : 'sm',
        metrics: perfMetrics.map((c) => ({
          label: prettyMetricName(c),
          value: Number(r[c]) || 0,
        })),
        mix,
        sites,
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
        const row: Record<string, string | number> = {
          id: String(r.ID),
          name: String(r.NAME),
          region: String(r.REGION),
          category: String(r.CATEGORY ?? ''),
          status: ratio > 0.9 ? 'Critical' : ratio > 0.7 ? 'Watch' : 'Healthy',
          value: perfMetrics.length ? Number(r[perfMetrics[0]]) || 0 : 0,
          events: Number(r.EVENTS) || 0,
          alerts,
        };
        // Flatten every metric under a stable key so a generated DataTable can
        // address them (m1 is the leading metric, same as `value`). metricLabels
        // below supplies the matching headers.
        perfMetrics.forEach((c, i) => {
          row[`m${i + 1}`] = Number(r[c]) || 0;
        });
        return row;
      }),
      metricLabels: perfMetrics.map(prettyMetricName),
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

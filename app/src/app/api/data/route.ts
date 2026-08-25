import { NextResponse } from 'next/server';
import { executeQuery } from '@/lib/snowflake';

export async function GET() {
  try {
    const kpis = await executeQuery<Record<string, number>>(`
      SELECT COUNT(*) AS TOTAL_ENTITIES, SUM(TOTAL_EVENTS) AS TOTAL_EVENTS, ROUND(AVG(SUCCESS_RATE), 1) AS AVG_SUCCESS_RATE, ROUND(SUM(TOTAL_VALUE)/1000000, 1) AS TOTAL_VALUE_M FROM CURATED.FACTORIE_SUMMARY
    `);

    const trend = await executeQuery<{ PERIOD: string; CATEGORY: string; VALUE: number }>(`
      SELECT WEEK_START AS PERIOD, CATEGORY, AMOUNT_MILLIONS AS VALUE FROM CURATED.WEEKLY_TRENDS WHERE WEEK_START >= DATEADD('week', -12, CURRENT_DATE()) ORDER BY WEEK_START
    `);

    const trendMap = new Map<string, Record<string, number>>();
    for (const row of (trend as any[])) {
      const period = row.PERIOD?.split('T')[0] || row.PERIOD;
      if (!trendMap.has(period)) trendMap.set(period, {});
      trendMap.get(period)![row.CATEGORY] = row.VALUE;
    }
    const timeseries = Array.from(trendMap.entries()).map(([period, vals]) => ({
      period,
      ...vals
    }));

    return NextResponse.json({
      kpis: (kpis as any[])[0] || {},
      timeseries,
      updatedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('Data fetch error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch data', details: String(error) },
      { status: 500 }
    );
  }
}

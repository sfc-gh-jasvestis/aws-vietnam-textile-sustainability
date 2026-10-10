import { NextResponse } from 'next/server';
import { executeQuery } from '@/lib/snowflake';
import { demoPlatform } from '@/lib/platform';

export const dynamic = 'force-dynamic';

// Only these fixed, read-only queries can run. The model never writes SQL; it
// only summarises rows returned here, so every answer is traceable to data.
const INTENTS: Record<string, { match: RegExp; sql: string }> = {
  exceedances: {
    match: /exceedance|effluent|discharge|threshold|worst|lowest|mill|dyehouse/i,
    sql: `SELECT ENTITY_ID, ENTITY_NAME, REGION, CATEGORY, EXCEEDANCE_COUNT, ROUND(IN_LIMIT_PCT, 2) AS IN_LIMIT_PCT
FROM CURATED.PERFORMANCE_SUMMARY
QUALIFY DENSE_RANK() OVER (ORDER BY EXCEEDANCE_COUNT DESC) <= 2
ORDER BY EXCEEDANCE_COUNT DESC, IN_LIMIT_PCT`,
  },
  causes: {
    match: /cause|root|why/i,
    sql: `SELECT ROOT_CAUSE, EXCEEDANCE_COUNT, SAMPLES_OVER_LIMIT, DOWNTIME_HOURS
FROM CURATED.EXCEEDANCE_CAUSES ORDER BY SAMPLES_OVER_LIMIT DESC LIMIT 5`,
  },
  kpis: {
    match: /.*/,
    sql: `SELECT TITLE, DISPLAY, SOURCE_WATERMARK FROM CURATED.KPI_SUMMARY ORDER BY SORT_ORDER`,
  },
};

const DEFINITIONS =
  'Effluent within threshold = sum(samples within the internal demo threshold) / sum(effluent samples); it is not a regulatory limit. Emissions intensity = 1000 * sum(t CO2e) / sum(tonnes of fabric processed), in kg CO2e per tonne of fabric. ' +
  'An environmental exceedance is a mill-day event (for example a reactive dye bath dump or indigo colour carryover) that pushed effluent samples over the threshold. ' +
  'All data is synthetic demo data.';

// provider 'cortex' = Snowflake AI_COMPLETE; 'bedrock' = Amazon Bedrock Claude
// via the external-access UDF APP.BEDROCK_GENERATE (aws/setup_aws.py).
async function summarise(question: string, rows: unknown[], provider: 'cortex' | 'bedrock' = 'cortex'): Promise<string> {
  const prompt =
    'You are a textile sustainability and wastewater operations analyst. Answer ONLY from the JSON rows and definitions below. ' +
    'If the rows do not answer the question, say so. Do not invent numbers. Keep it under 120 words.\n' +
    `Definitions: ${DEFINITIONS}\nRows: ${JSON.stringify(rows)}\nQuestion: ${question}`;
  const out = await executeQuery<{ R: string }>(
    provider === 'bedrock' ? 'SELECT APP.BEDROCK_GENERATE(?) AS R' : `SELECT AI_COMPLETE('claude-sonnet-4-5', ?) AS R`,
    [prompt],
  );
  const raw = String(out[0]?.R ?? '').trim();
  // AI_COMPLETE returns a JSON string literal; decode it when present.
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === 'string' ? parsed : raw;
  } catch {
    return raw;
  }
}

export async function POST(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const question = typeof body?.question === 'string' ? body.question.trim().slice(0, 2000) : '';
  const memo = body?.mode === 'memo';
  if (!memo && !question) return NextResponse.json({ error: 'Question required' }, { status: 400 });

  try {
    if (memo) {
      const provider = demoPlatform() === 'aws' ? 'bedrock' : 'cortex';
      const [kpis, exceedances, causes, risk, bands] = await Promise.all([
        executeQuery(INTENTS.kpis.sql),
        executeQuery(INTENTS.exceedances.sql),
        executeQuery(INTENTS.causes.sql),
        executeQuery(`SELECT ENTITY_ID, ROUND(EXCEEDANCE_PROB_7D, 2) AS EXCEEDANCE_PROB_7D, RISK_BAND
FROM ML.EXCEEDANCE_RISK_SCORES ORDER BY EXCEEDANCE_PROB_7D DESC LIMIT 5`),
        executeQuery(`SELECT RISK_BAND, COUNT(*) AS MILLS FROM ML.EXCEEDANCE_RISK_SCORES GROUP BY RISK_BAND`),
      ]);
      const rows = { kpis, topExceedanceMills: exceedances, topCauses: causes, top5ByRisk: risk, millsPerRiskBand: bands };
      const answer = await summarise(
        'Draft a short action memo for the VP Sustainability (textile wet processing) with 3 prioritised actions, citing the figures.',
        [rows],
        provider,
      );
      return NextResponse.json({ answer, sources: rows, provider: provider === 'bedrock' ? 'Amazon Bedrock (Claude Sonnet 4.5)' : 'Snowflake Cortex AI_COMPLETE (claude-sonnet-4-5)', draft: true, synthetic: true });
    }
    const key = Object.keys(INTENTS).find((k) => INTENTS[k].match.test(question))!;
    const rows = await executeQuery(INTENTS[key].sql);
    const answer = await summarise(question, rows);
    return NextResponse.json({ answer, sql: INTENTS[key].sql, sources: rows, synthetic: true });
  } catch (err) {
    console.error('ask route failed', err);
    return NextResponse.json({ error: 'AI service unavailable' }, { status: 503 });
  }
}

import snowflake from 'snowflake-sdk';

let connection: any = null;

/**
 * Reads the OAuth token that Snowpark Container Services writes into the
 * container. Snowflake refreshes this file every few minutes, so it must be
 * read at connect time rather than cached at module load.
 */
function getOAuthToken(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fs = require('fs');
    return fs.readFileSync('/snowflake/session/token', 'utf8').trim();
  } catch {
    // Not running in SPCS - fall back to an explicitly supplied token.
    return process.env.SNOWFLAKE_TOKEN || '';
  }
}

export async function getConnection() {
  if (connection) return connection;

  const token = getOAuthToken();

  connection = snowflake.createConnection({
    // SPCS injects these. The OAuth token is only valid when paired with host.
    account: process.env.SNOWFLAKE_ACCOUNT || '',
    host: process.env.SNOWFLAKE_HOST || '',
    database: process.env.SNOWFLAKE_DATABASE || process.env.DATABASE || '',
    schema: process.env.SNOWFLAKE_SCHEMA || process.env.SCHEMA || 'CURATED',
    // Not injected by SPCS - comes from the service QUERY_WAREHOUSE or env.
    warehouse: process.env.SNOWFLAKE_WAREHOUSE || process.env.WAREHOUSE || '',
    authenticator: 'OAUTH',
    token,
    clientSessionKeepAlive: true,
  } as any);

  return new Promise((resolve, reject) => {
    connection.connect((err: any, conn: any) => {
      if (err) {
        // Drop the handle so the next request retries with a fresh token.
        connection = null;
        reject(err);
      } else {
        resolve(conn);
      }
    });
  });
}

export async function executeQuery<T = Record<string, any>>(sql: string): Promise<T[]> {
  const conn = await getConnection();
  return new Promise((resolve, reject) => {
    conn.execute({
      sqlText: sql,
      complete: (err: any, _stmt: any, rows: T[]) => {
        if (err) {
          // A dead session must not poison every later request.
          connection = null;
          reject(err);
        } else {
          resolve(rows || []);
        }
      },
    });
  });
}

export async function callCortexComplete(model: string, prompt: string): Promise<string> {
  const rows = await executeQuery<{ RESPONSE: string }>(
    `SELECT SNOWFLAKE.CORTEX.COMPLETE('${model}', '${prompt.replace(/'/g, "''")}') AS RESPONSE`
  );
  return rows[0]?.RESPONSE || '';
}

export async function callCortexAnalyst(semanticView: string, question: string): Promise<{ sql: string; answer: string }> {
  const rows = await executeQuery<{ SQL_TEXT: string; ANSWER: string }>(
    `SELECT * FROM TABLE(
      SNOWFLAKE.CORTEX.ANALYST(
        SEMANTIC_VIEW => '${semanticView}',
        QUESTION => '${question.replace(/'/g, "''")}'
      )
    )`
  );
  return { sql: rows[0]?.SQL_TEXT || '', answer: rows[0]?.ANSWER || '' };
}

import pg from "pg";

const expectedRole = process.env.DB_REQUIRED_ROLE ?? "sastpeople";
if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required to check database permissions.");
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });

await client.connect();
try {
  const result = await client.query(`
    SELECT
      current_user,
      has_schema_privilege(current_user, 'public', 'USAGE') AS schema_usage,
      has_table_privilege(current_user, 'public.user_flow', 'SELECT') AS user_flow_select,
      has_table_privilege(current_user, 'public.flow', 'SELECT') AS flow_select,
      has_table_privilege(current_user, 'public.interview_evaluation', 'SELECT') AS evaluation_select
  `);
  const row = result.rows[0];

  if (
    row.current_user !== expectedRole ||
    !row.schema_usage ||
    !row.user_flow_select ||
    !row.flow_select ||
    !row.evaluation_select
  ) {
    throw new Error(
      `Database permission check failed for role ${expectedRole}: ` +
        JSON.stringify({
          currentUser: row.current_user,
          schemaUsage: row.schema_usage,
          userFlowSelect: row.user_flow_select,
          flowSelect: row.flow_select,
          evaluationSelect: row.evaluation_select,
        }),
    );
  }

  console.log(`Database permissions verified for ${expectedRole}.`);
} finally {
  await client.end();
}

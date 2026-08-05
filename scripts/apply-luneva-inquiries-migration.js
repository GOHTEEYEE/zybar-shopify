/**
 * Apply LUNEVA inquiries migration via DATABASE_URL (Postgres connection string).
 *
 * Usage:
 *   DATABASE_URL='postgresql://postgres:...@db.haebgpoowyrsufhqfexw.supabase.co:5432/postgres' \
 *     node scripts/apply-luneva-inquiries-migration.js
 *
 * Or with Supabase CLI (after `supabase login` + `supabase link`):
 *   npx supabase db query --linked -f supabase/migrations/20260728120000_luneva_inquiries.sql
 */
const fs = require('fs');
const path = require('path');

async function main() {
  const databaseUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
  if (!databaseUrl) {
    console.error('Missing DATABASE_URL / SUPABASE_DB_URL.');
    console.error('Open Supabase → SQL Editor and run:');
    console.error('  supabase/migrations/20260728120000_luneva_inquiries.sql');
    process.exit(1);
  }

  let Client;
  try {
    Client = require('pg').Client;
  } catch (e) {
    console.error('Install pg first: npm install pg');
    process.exit(1);
  }

  const sqlPath = path.join(
    __dirname,
    '..',
    'supabase',
    'migrations',
    '20260728120000_luneva_inquiries.sql'
  );
  const sql = fs.readFileSync(sqlPath, 'utf8');
  const client = new Client({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query(sql);
    console.log('LUNEVA inquiries migration applied.');
  } finally {
    await client.end();
  }
}

main().catch(function (err) {
  console.error(err);
  process.exit(1);
});

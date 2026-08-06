/**
 * Apply brand-split migration for newsletter + carts.
 *
 * Usage:
 *   DATABASE_URL='postgresql://postgres:...@db.xxx.supabase.co:5432/postgres' \
 *     node scripts/apply-brand-split-migration.js
 *
 * Or paste supabase/migrations/20260806120000_brand_split_newsletter_carts.sql
 * into the Supabase SQL Editor and run it.
 */
const fs = require('fs');
const path = require('path');

async function main() {
  const databaseUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
  if (!databaseUrl) {
    console.error('Missing DATABASE_URL / SUPABASE_DB_URL.');
    console.error('Open Supabase → SQL Editor and run:');
    console.error('  supabase/migrations/20260806120000_brand_split_newsletter_carts.sql');
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
    '20260806120000_brand_split_newsletter_carts.sql'
  );
  const sql = fs.readFileSync(sqlPath, 'utf8');
  const client = new Client({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query(sql);
    console.log('Brand-split newsletter/carts migration applied.');
  } finally {
    await client.end();
  }
}

main().catch(function (err) {
  console.error(err);
  process.exit(1);
});

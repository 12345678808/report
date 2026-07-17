const fs = require('fs');
const path = require('path');
const { pool } = require('./db');

// Public Health used to be scope='common' (one org-wide figure, no zone
// breakdown). Per explicit request, it's now tracked zone-wise like every
// other department (the CCMC master-register Google Sheet already logs it
// per zone, and the admin sync feature imports exactly that shape) — so its
// 4 catalog items flip to scope='zone'. Guarded by `WHERE scope = 'common'`,
// so re-running this on every deploy (via `npm run migrate`) is a safe no-op
// once it's already applied. Existing common-scope kpi_entries for these
// items (zone_id IS NULL) are left in place rather than deleted — they're
// simply never read again once the item is zone-scoped, so nothing breaks,
// and no historical data is destroyed.
async function migratePublicHealthToZoneScope() {
  const { rowCount } = await pool.query(
    `UPDATE kpi_items SET scope = 'zone' WHERE department = 'PUBLIC HEALTH' AND scope = 'common'`
  );
  if (rowCount > 0) {
    console.log(`Converted ${rowCount} Public Health kpi_items from scope='common' to scope='zone'.`);
  }
}

async function migrate() {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  console.log('Running schema.sql against', maskConnString(process.env.DATABASE_URL));
  await pool.query(sql);
  await migratePublicHealthToZoneScope();
  console.log('Migration complete.');
  await pool.end();
}

function maskConnString(url) {
  if (!url) return '(unset)';
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.username}:****@${u.host}${u.pathname}`;
  } catch {
    return '(unparseable)';
  }
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});

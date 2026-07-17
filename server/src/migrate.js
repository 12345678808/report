const fs = require('fs');
const path = require('path');
const { pool } = require('./db');

// Public Health used to be scope='common' (one org-wide figure, no zone
// breakdown). Per explicit request, it's now tracked zone-wise like every
// other department (the CCMC master-register Google Sheet already logs it
// per zone, and the admin sync feature imports exactly that shape) — so its
// catalog items flip to scope='zone'. Guarded by checking for any remaining
// scope='common' Public Health rows, so re-running this on every deploy (via
// `npm run migrate`) is a safe no-op once it's already applied. Existing
// common-scope kpi_entries for these items (zone_id IS NULL) are left in
// place rather than deleted — they're simply never read again once the item
// is zone-scoped, so nothing breaks, and no historical data is destroyed.
//
// IMPORTANT: kpi_items has a UNIQUE(sno, scope) constraint, and sno is only
// ever unique *within* a scope, not globally — a common-scope item and a
// zone-scope item can perfectly legitimately share the same sno number. A
// naive `UPDATE ... SET scope='zone'` (the original version of this
// function) kept each Public Health item's existing sno as-is, which is
// only safe if none of those numbers happen to already be taken in the
// zone-scope catalog. That assumption held against a freshly seeded
// database, but broke against the real production database — whose sno
// numbering has drifted from a fresh seed over time (every Add Row insert
// shifts other rows) — and crashed this migration (and with it, the whole
// deploy, since this runs before `npm start`) with a duplicate-key error
// the moment a Public Health item's sno collided with an existing zone
// item's. This version doesn't trust the existing sno values at all: it
// shifts every current zone-scope row's sno up out of the way first, then
// lands the converting Public Health items at the front (sno 1..n) —
// guaranteed collision-free no matter what the current numbering looks
// like, and keeps Public Health as the first department shown in every
// zone table (matching how it's always displayed/tested elsewhere).
async function migratePublicHealthToZoneScope() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: phItems } = await client.query(
      `SELECT id FROM kpi_items WHERE department = 'PUBLIC HEALTH' AND scope = 'common' ORDER BY sno ASC`
    );
    const n = phItems.length;

    if (n === 0) {
      await client.query('COMMIT');
      // Always log the outcome (not just the "did something" branch) — the
      // only way to see, from Render's deploy logs, whether a given deploy
      // actually flipped Public Health to per-zone tracking or whether it
      // was already done. A silent no-op previously looked identical to
      // "the migration step never ran at all", which made a stuck/
      // misconfigured deploy pipeline impossible to tell apart from a
      // normal idempotent re-run.
      const { rows } = await pool.query(
        `SELECT COUNT(*) FILTER (WHERE scope = 'zone') AS zone_count, COUNT(*) AS total
         FROM kpi_items WHERE department = 'PUBLIC HEALTH'`
      );
      const { zone_count: zoneCount, total } = rows[0] || {};
      console.log(
        `Public Health scope migration: no rows to convert (0 still scope='common'). ` +
          `Currently ${zoneCount}/${total} Public Health kpi_items are scope='zone'.`
      );
      return;
    }

    // Negate-then-shift dance (same trick POST /kpi/items already uses to
    // shift sno values without tripping the unique index mid-statement):
    // step 1 makes every existing zone row's sno negative (still mutually
    // unique, and guaranteed not to collide with anything positive); step 2
    // converts them back to positive, shifted up by n, freeing up sno
    // values 1..n for the incoming Public Health rows.
    await client.query(`UPDATE kpi_items SET sno = -sno WHERE scope = 'zone'`);
    await client.query(`UPDATE kpi_items SET sno = -sno + $1 WHERE scope = 'zone' AND sno < 0`, [n]);

    for (let i = 0; i < n; i++) {
      await client.query(`UPDATE kpi_items SET scope = 'zone', sno = $1 WHERE id = $2`, [i + 1, phItems[i].id]);
    }

    await client.query('COMMIT');
    console.log(
      `Converted ${n} Public Health kpi_items from scope='common' to scope='zone' ` +
        `(renumbered to sno 1..${n}, every other zone-scope row shifted up by ${n} to avoid sno collisions).`
    );
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
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

// Seeds the database with:
//  - the two demo accounts (admin / commissioner) with bcrypt-hashed passwords
//  - the 5 CCMC zones
//  - the full KPI catalog + today's logged figures, ported 1:1 from the original
//    static dashboard's REPORT_DATA so the numbers match what you saw before.
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { pool } = require('./db');

const ZONE_ORDER = ['Central', 'West', 'East', 'North', 'South'];
const TODAY = '2026-07-12'; // the one date the original demo data was logged for

function extractUnit(reportName) {
  const m = reportName.match(/-\s*\(([A-Za-z]+)\)\s*$/);
  return m ? m[1] : '';
}

function toNumOrNull(v) {
  if (v === '' || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

async function seed() {
  const raw = fs.readFileSync(path.join(__dirname, 'seed-data.json'), 'utf8');
  const REPORT_DATA = JSON.parse(raw);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ---- wipe existing demo data so this script is safely re-runnable ----
    await client.query('TRUNCATE kpi_entries, kpi_items, zones, users RESTART IDENTITY CASCADE');

    // ---- demo users ----
    const adminHash = await bcrypt.hash('admin@2026', 10);
    const commHash = await bcrypt.hash('comm@2026', 10);
    await client.query(
      `INSERT INTO users (username, password_hash, role, display_name) VALUES
       ($1, $2, 'admin', 'ICCC Admin Desk'),
       ($3, $4, 'commissioner', 'Thiru. Katta Ravi Teja')`,
      ['admin', adminHash, 'commissioner', commHash]
    );

    // ---- zones ----
    const zoneIdByName = {};
    for (const name of ZONE_ORDER) {
      const res = await client.query('INSERT INTO zones (name) VALUES ($1) RETURNING id', [name]);
      zoneIdByName[name] = res.rows[0].id;
    }

    // ---- common (org-wide) KPI items + today's entry ----
    for (const row of REPORT_DATA.common) {
      const [sno, department, reportName, target, achievement] = row;
      const unit = extractUnit(reportName);
      const itemRes = await client.query(
        `INSERT INTO kpi_items (sno, department, report_name, unit, scope)
         VALUES ($1, $2, $3, $4, 'common') RETURNING id`,
        [sno, department, reportName, unit]
      );
      const itemId = itemRes.rows[0].id;
      await client.query(
        `INSERT INTO kpi_entries (kpi_item_id, zone_id, entry_date, target, achievement, note)
         VALUES ($1, NULL, $2, $3, $4, '')`,
        [itemId, TODAY, toNumOrNull(target), toNumOrNull(achievement)]
      );
    }

    // ---- zone-scoped KPI items: catalog comes from Central zone's item list
    // (all 5 zones share the same catalog, only the figures differ) ----
    const catalogRows = REPORT_DATA.zones.Central;
    const itemIdBySno = {};
    for (const row of catalogRows) {
      const [sno, department, reportName] = row;
      const unit = extractUnit(reportName);
      const itemRes = await client.query(
        `INSERT INTO kpi_items (sno, department, report_name, unit, scope)
         VALUES ($1, $2, $3, $4, 'zone') RETURNING id`,
        [sno, department, reportName, unit]
      );
      itemIdBySno[sno] = itemRes.rows[0].id;
    }

    // ---- per-zone entries ----
    for (const zoneName of ZONE_ORDER) {
      for (const row of REPORT_DATA.zones[zoneName]) {
        const [sno, , , target, achievement, , , , note] = row;
        const itemId = itemIdBySno[sno];
        await client.query(
          `INSERT INTO kpi_entries (kpi_item_id, zone_id, entry_date, target, achievement, note)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [itemId, zoneIdByName[zoneName], TODAY, toNumOrNull(target), toNumOrNull(achievement), note || '']
        );
      }
    }

    await client.query('COMMIT');
    console.log('Seed complete:');
    console.log('  users:', 2);
    console.log('  zones:', ZONE_ORDER.length);
    console.log('  common kpi_items:', REPORT_DATA.common.length);
    console.log('  zone kpi_items:', catalogRows.length);
    console.log('  kpi_entries:', REPORT_DATA.common.length + catalogRows.length * ZONE_ORDER.length);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});

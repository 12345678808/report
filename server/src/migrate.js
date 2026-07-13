const fs = require('fs');
const path = require('path');
const { pool } = require('./db');

async function migrate() {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  console.log('Running schema.sql against', maskConnString(process.env.DATABASE_URL));
  await pool.query(sql);
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

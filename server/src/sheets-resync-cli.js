// Command-line resync: rewrites the whole "KPI Data" tab in Google Sheets from
// the database for one date. Run this once right after setup to bootstrap the
// Sheet with your current data, or any time later if you want the Sheet to
// forcibly match the database again.
//
// Usage: npm run sheets:resync [YYYY-MM-DD]   (date defaults to 2026-07-12,
// the one date this project's seed data covers)

require('dotenv').config();
const { getFullSnapshot } = require('./services/kpiStore');
const sheetsSync = require('./services/sheetsSync');

(async () => {
  if (!sheetsSync.isEnabled()) {
    console.error(
      'GOOGLE_SHEETS_ENABLED is not "true" in .env — nothing to do. See README.md "Google Sheets two-way sync".'
    );
    process.exit(1);
  }
  const date = process.argv[2] || '2026-07-12';
  console.log(`Pushing full snapshot for ${date} to the Sheet...`);
  const rows = await getFullSnapshot(date);
  const result = await sheetsSync.pushFullSnapshot(date, rows);
  console.log('Done:', result);
  process.exit(0);
})().catch((err) => {
  console.error('Resync failed:', err.message);
  process.exit(1);
});

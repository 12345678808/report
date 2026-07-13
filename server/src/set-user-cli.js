// Create or update a login — this is how you replace the demo admin/commissioner
// accounts with your real company logins (an email address works fine as the
// "username" — the users table just stores it as plain text, there's no
// separate email column or format requirement).
//
// Usage:
//   node src/set-user-cli.js <username-or-email> <password> <admin|commissioner> "<Display Name>" [old-username-to-replace]
//
// Examples:
//   # add a brand-new login
//   node src/set-user-cli.js commissioner@ccmc.gov.in "Str0ngP@ss" commissioner "Thiru. Katta Ravi Teja"
//
//   # rename the demo "admin" login to a real company email, keeping the same
//   # row (so anything tied to that user id, if you add such things later,
//   # doesn't need to move)
//   node src/set-user-cli.js admin.desk@ccmc.gov.in "Str0ngP@ss" admin "ICCC Admin Desk" admin
//
// Either way, run this once per person you want to log in, then tell them
// their username/email + password. There's no self-serve signup page by
// design — accounts are provisioned this way on purpose, since only two
// roles exist and both matter for data integrity.

require('dotenv').config();
const bcrypt = require('bcryptjs');
const { pool } = require('./db');

async function main() {
  const [, , username, password, role, displayName, oldUsername] = process.argv;

  if (!username || !password || !role || !displayName) {
    console.error(
      'Usage: node src/set-user-cli.js <username-or-email> <password> <admin|commissioner> "<Display Name>" [old-username-to-replace]'
    );
    process.exit(1);
  }
  if (!['admin', 'commissioner'].includes(role)) {
    console.error('role must be exactly "admin" or "commissioner"');
    process.exit(1);
  }
  if (password.length < 8) {
    console.error('Use a password of at least 8 characters — this is a real login, not a demo one.');
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 10);

  if (oldUsername) {
    const result = await pool.query(
      `UPDATE users SET username = $1, password_hash = $2, role = $3, display_name = $4
       WHERE username = $5
       RETURNING username`,
      [username, passwordHash, role, displayName, oldUsername]
    );
    if (result.rowCount === 0) {
      console.error(`No existing user found with username "${oldUsername}" — nothing renamed.`);
      process.exit(1);
    }
    console.log(`Renamed "${oldUsername}" -> "${username}" (${role}).`);
  } else {
    await pool.query(
      `INSERT INTO users (username, password_hash, role, display_name)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (username) DO UPDATE SET password_hash = EXCLUDED.password_hash,
                                             role = EXCLUDED.role,
                                             display_name = EXCLUDED.display_name`,
      [username, passwordHash, role, displayName]
    );
    console.log(`Saved user "${username}" (${role}).`);
  }

  await pool.end();
}

main().catch((err) => {
  console.error('Failed:', err.message);
  process.exit(1);
});

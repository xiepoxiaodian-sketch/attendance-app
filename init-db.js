const mysql = require('mysql2/promise');

const DB_URL = 'mysql://root:srNTRLYbtmrGlBjkruJIfUrGpaUmBrvF@interchange.proxy.rlwy.net:27276/railway';

const defaults = [
  ['company_name', 'My Company'],
  ['work_location_lat', '25.0330'],
  ['work_location_lng', '121.5654'],
  ['allowed_radius', '200'],
  ['require_device_binding', 'false'],
  ['require_biometric', 'false'],
  ['late_threshold_minutes', '10'],
];

async function main() {
  const pool = mysql.createPool(DB_URL + '?connectionLimit=5&connectTimeout=10000');
  
  try {
    // Insert settings one by one using pool
    for (const [key, value] of defaults) {
      try {
        await pool.execute(
          'INSERT IGNORE INTO settings (`key`, value) VALUES (?, ?)',
          [key, value]
        );
        console.log('Set:', key, '=', value);
      } catch (e) {
        console.log('Skip:', key, e.message);
      }
    }
    console.log('Settings done!');
  } finally {
    await pool.end();
    console.log('Connection pool closed.');
    process.exit(0);
  }
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});

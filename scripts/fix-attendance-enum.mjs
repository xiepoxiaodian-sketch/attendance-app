import mysql from 'mysql2/promise';

const DB_URL = 'mysql://root:srNTRLYbtmrGlBjkruJIfUrGpaUmBrvF@interchange.proxy.rlwy.net:27276/railway';

async function main() {
  const conn = await mysql.createConnection(DB_URL);
  
  // Check current ENUM
  const [rows] = await conn.execute(
    `SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'attendance' AND COLUMN_NAME = 'status'`
  );
  const currentType = rows.length > 0 ? rows[0].COLUMN_TYPE : 'unknown';
  console.log('Current status ENUM:', currentType);
  
  if (!currentType.includes('late_and_early')) {
    console.log('Updating ENUM to include late_and_early...');
    await conn.execute(
      `ALTER TABLE attendance MODIFY COLUMN status ENUM('normal','late','early_leave','absent','late_and_early') NOT NULL DEFAULT 'normal'`
    );
    console.log('✅ ENUM updated successfully!');
  } else {
    console.log('✅ ENUM already includes late_and_early, no update needed.');
  }
  
  // Verify
  const [verifyRows] = await conn.execute(
    `SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'attendance' AND COLUMN_NAME = 'status'`
  );
  console.log('Updated status ENUM:', verifyRows[0]?.COLUMN_TYPE);
  
  await conn.end();
}

main().catch(console.error);

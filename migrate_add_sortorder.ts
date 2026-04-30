import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

async function migrate() {
  const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: parseInt(process.env.DB_PORT || '3306'),
    ssl: { rejectUnauthorized: false }
  });

  const conn = await pool.getConnection();
  try {
    console.log('執行 migration: 為 schedules 表加入 sortOrder 欄位...');
    await conn.execute(`ALTER TABLE \`schedules\` ADD COLUMN \`sortOrder\` int NOT NULL DEFAULT 0`);
    console.log('✓ Migration 成功！');
  } catch (err: any) {
    if (err.code === 'ER_DUP_FIELDNAME') {
      console.log('✓ sortOrder 欄位已存在，跳過');
    } else {
      throw err;
    }
  } finally {
    conn.release();
    await pool.end();
  }
}

migrate().catch(err => {
  console.error('Migration 失敗:', err.message);
  process.exit(1);
});

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  ssl: {
    rejectUnauthorized: false
  }
});

async function queryEmployee007() {
  const conn = await pool.getConnection();
  try {
    const queryDate = '2026-04-26';
    
    console.log(`\n=== 查詢員工007 (${queryDate}) ===\n`);
    
    // 查詢打卡紀錄
    const [attendance] = await conn.query(
      `SELECT id, employee_id, clock_in_time, clock_out_time, status, location, photo_url, created_at 
       FROM attendance 
       WHERE employee_id = '007' AND DATE(clock_in_time) = ?
       ORDER BY clock_in_time DESC`,
      [queryDate]
    );
    
    console.log('📋 打卡紀錄：');
    if (attendance.length === 0) {
      console.log('  (無打卡紀錄)');
    } else {
      attendance.forEach((record, idx) => {
        console.log(`\n  記錄 ${idx + 1}:`);
        console.log(`    ID: ${record.id}`);
        console.log(`    上班時間: ${record.clock_in_time}`);
        console.log(`    下班時間: ${record.clock_out_time || '未打卡'}`);
        console.log(`    狀態: ${record.status}`);
        console.log(`    地點: ${record.location || '無'}`);
        console.log(`    照片: ${record.photo_url ? '有' : '無'}`);
      });
    }
    
    // 查詢補卡紀錄
    const [corrections] = await conn.query(
      `SELECT id, employee_id, attendance_id, correction_type, reason, status, screenshot_url, created_at, updated_at
       FROM punch_corrections 
       WHERE employee_id = '007' AND DATE(created_at) = ?
       ORDER BY created_at DESC`,
      [queryDate]
    );
    
    console.log('\n\n📝 補卡申請：');
    if (corrections.length === 0) {
      console.log('  (無補卡申請)');
    } else {
      corrections.forEach((record, idx) => {
        console.log(`\n  申請 ${idx + 1}:`);
        console.log(`    ID: ${record.id}`);
        console.log(`    補卡類型: ${record.correction_type}`);
        console.log(`    原因: ${record.reason}`);
        console.log(`    狀態: ${record.status}`);
        console.log(`    截圖: ${record.screenshot_url ? '有' : '無'}`);
        console.log(`    申請時間: ${record.created_at}`);
      });
    }
    
  } finally {
    conn.release();
    await pool.end();
  }
}

queryEmployee007().catch(err => {
  console.error('查詢失敗:', err.message);
  process.exit(1);
});

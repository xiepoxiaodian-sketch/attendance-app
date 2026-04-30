import mysql from 'mysql2/promise';

const DB_URL = 'mysql://root:srNTRLYbtmrGlBjkruJIfUrGpaUmBrvF@interchange.proxy.rlwy.net:27276/railway';

// 指定順序（index 0 = sortOrder 0，最前面）
const DESIRED_ORDER = [
  '張喆翔',
  '黃嘉森',
  '黃小冰',
  '杜可凡',
  '許玉',
  '陳宇心',
  '董尚謙',
  '謝涵',
  '杜僑聖',
  '許正',
  '何昊勤',
];

async function main() {
  const conn = await mysql.createConnection(DB_URL);
  
  // 查詢所有員工
  const [rows] = await conn.execute('SELECT id, fullName, username, sortOrder FROM employees ORDER BY sortOrder, username');
  console.log('目前員工列表：');
  rows.forEach(r => console.log(`  id=${r.id} fullName="${r.fullName}" username="${r.username}" sortOrder=${r.sortOrder}`));
  
  // 對應指定順序
  console.log('\n開始更新 sortOrder...');
  let notFound = [];
  
  for (let i = 0; i < DESIRED_ORDER.length; i++) {
    const name = DESIRED_ORDER[i];
    const emp = rows.find(r => r.fullName === name);
    if (!emp) {
      notFound.push(name);
      console.log(`  ⚠️  找不到員工：${name}`);
      continue;
    }
    await conn.execute('UPDATE employees SET sortOrder = ? WHERE id = ?', [i, emp.id]);
    console.log(`  ✅ ${name} (id=${emp.id}) → sortOrder=${i}`);
  }
  
  // 不在清單中的員工放到最後
  const listedNames = DESIRED_ORDER.filter(n => rows.find(r => r.fullName === n));
  const unlisted = rows.filter(r => !DESIRED_ORDER.includes(r.fullName));
  if (unlisted.length > 0) {
    console.log('\n不在清單中的員工（排到最後）：');
    for (let j = 0; j < unlisted.length; j++) {
      const sortVal = DESIRED_ORDER.length + j;
      await conn.execute('UPDATE employees SET sortOrder = ? WHERE id = ?', [sortVal, unlisted[j].id]);
      console.log(`  📌 ${unlisted[j].fullName} (id=${unlisted[j].id}) → sortOrder=${sortVal}`);
    }
  }
  
  // 驗證結果
  const [updated] = await conn.execute('SELECT id, fullName, username, sortOrder FROM employees ORDER BY sortOrder, username');
  console.log('\n更新後員工順序：');
  updated.forEach((r, i) => console.log(`  ${i + 1}. ${r.fullName} (${r.username}) sortOrder=${r.sortOrder}`));
  
  if (notFound.length > 0) {
    console.log(`\n⚠️  以下姓名在資料庫中找不到：${notFound.join('、')}`);
  }
  
  await conn.end();
  console.log('\n完成！');
}

main().catch(console.error);

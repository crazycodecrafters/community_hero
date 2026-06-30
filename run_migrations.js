const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const client = new Client({ connectionString: 'postgresql://communityhero:communityhero_dev@127.0.0.1:5432/communityhero' });

(async () => {
  try {
    await client.connect();
    const sqlPath = path.join(__dirname, 'backend', 'src', 'db', 'migrations', '04_admin_officer_tables.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    await client.query(sql);
    console.log('Migration successful');
  } catch(e) {
    console.error('Migration failed:', e);
  } finally {
    await client.end();
  }
})();

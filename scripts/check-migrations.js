const { Client } = require('pg');
(async () => {
  const cs = process.env.DATABASE_URL;
  if (!cs) { console.error('DATABASE_URL not set'); process.exit(1); }
  const c = new Client({ connectionString: cs });
  await c.connect();
  async function tryQuery(sql) {
    try {
      const res = await c.query(sql);
      console.log('OK:', sql);
      console.log(JSON.stringify(res.rows, null, 2));
    } catch (e) {
      console.log('ERR:', sql, e.message);
    }
  }
  await tryQuery('select * from drizzle.__drizzle_migrations order by created_at');
  await tryQuery('select * from drizzle._journal order by version');
  await tryQuery('select * from __drizzle_migrations order by created_at');
  await tryQuery('select * from _journal order by version');
  await c.end();
})();

#!/usr/bin/env node
require('dotenv').config();
const bcrypt = require('bcrypt');
const { Pool } = require('pg');

(async () => {
  if (!process.env.DATABASE_URL) {
    console.error('Please set DATABASE_URL in the environment');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  try {
    const client = await pool.connect();
    try {
      const colsRes = await client.query("SELECT column_name FROM information_schema.columns WHERE table_name='users'");
      const cols = colsRes.rows.map(r => r.column_name);
      console.log('users columns:', cols.join(','));

      const pwCandidates = ['password', 'password_hash', 'passwordHash', 'passwordhash'];
      let pwCol = pwCandidates.find(c => cols.includes(c));
      if (!pwCol) pwCol = cols.find(c => /password/i.test(c)) || cols.find(c => /pass/i.test(c));
      if (!pwCol) {
        console.error('No password-like column found in users table');
        process.exit(1);
      }

      const res = await client.query('SELECT id,' + pwCol + ' FROM users WHERE email=$1 LIMIT 1', ['admin@chainsync.local']);
      if (res.rows.length === 0) {
        console.error('No user found for admin@chainsync.local');
        process.exit(1);
      }

      const row = res.rows[0];
      const hash = '' + row[pwCol];
      console.log('Found user id', row.id, 'password column', pwCol);
      console.log('Stored hash (first 120 chars):', hash.slice(0, 120));

      const ok = await bcrypt.compare('Password123!', hash);
      console.log("bcrypt compare with 'Password123!' ->", ok);
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('ERROR:', err);
  } finally {
    await pool.end();
  }
})();

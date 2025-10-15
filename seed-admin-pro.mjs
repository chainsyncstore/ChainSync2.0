#!/usr/bin/env node
import 'dotenv/config';
import bcrypt from 'bcrypt';

import { Pool } from 'pg';

if (!process.env.DATABASE_URL) {
  console.error('\u274C DATABASE_URL environment variable is required to run this seed script');
  process.exit(1);
}

// Create a dedicated pool for this script. Neon requires SSL; set rejectUnauthorized false.
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const USERNAME = process.env.ADMIN_USERNAME || 'admin';
const EMAIL = process.env.ADMIN_EMAIL || 'admin@chainsync.local';
const PASSWORD = process.env.ADMIN_PASSWORD || 'Password123!';
const TIER = process.env.ADMIN_TIER || 'pro';
const SALT_ROUNDS = parseInt(process.env.SALT_ROUNDS || '12', 10);

async function ensureAdmin() {
  if (!process.env.DATABASE_URL) {
    console.error('\u274C DATABASE_URL environment variable is required to run this seed script');
    console.error('Set it inline when running, e.g. DATABASE_URL="postgresql://..." node ./seed-admin-pro.mjs');
    process.exit(1);
  }

  try {
    const client = await pool.connect();
    try {
      // Inspect columns on users table to be schema-agnostic
      const colsRes = await client.query(
        `SELECT column_name FROM information_schema.columns WHERE table_name = 'users'`);
      const cols = new Set(colsRes.rows.map(r => r.column_name));

      // helper to pick first matching column name
      const pick = (names) => names.find(n => cols.has(n));

      const col_username = pick(['username']);
      const col_firstName = pick(['first_name','firstName']);
      const col_lastName = pick(['last_name','lastName']);
      const col_email = pick(['email']);
      const col_password = pick(['password','password_hash','passwordHash']);
      const col_role = pick(['role','user_role']);
      const col_is_admin = pick(['is_admin']);
      const col_tier = pick(['tier']);
      const col_is_active = pick(['is_active','isActive']);
      const col_email_verified = pick(['email_verified','emailVerified']);
      const col_signup_completed = pick(['signup_completed','signupCompleted']);

      // Build select statement dynamically
      const selectCols = ['id'];
      if (col_role) selectCols.push(col_role);
      if (col_is_admin) selectCols.push(col_is_admin);
      const selectQuery = `SELECT ${selectCols.join(', ')} FROM users WHERE ${col_email || 'email'} = $1`;

      const selectRes = await client.query(selectQuery, [EMAIL]);
      let userId = null;
      if (selectRes.rows.length > 0) {
        const row = selectRes.rows[0];
        userId = row.id;
        console.log('\u2705 Found existing user:', userId, EMAIL);
        // Update role or is_admin accordingly
        if (col_role) {
          if (row[col_role] !== 'admin') {
            await client.query(`UPDATE users SET ${col_role} = $1 WHERE id = $2`, ['admin', userId]);
            console.log('\u2705 Updated user role to admin');
          }
        } else if (col_is_admin) {
          if (!row[col_is_admin]) {
            await client.query(`UPDATE users SET ${col_is_admin} = $1 WHERE id = $2`, [true, userId]);
            console.log('\u2705 Updated user is_admin = true');
          }
        } else {
          console.log('\u26A0 No role or is_admin column found; skipping role update');
        }
      } else {
        // Build insert using only available columns
        const insertCols = [];
        const insertParams = [];
        const values = [];
        let idx = 1;
        if (col_username) { insertCols.push(col_username); insertParams.push(`$${idx++}`); values.push(USERNAME); }
        if (col_firstName) { insertCols.push(col_firstName); insertParams.push(`$${idx++}`); values.push('System'); }
        if (col_lastName) { insertCols.push(col_lastName); insertParams.push(`$${idx++}`); values.push('Administrator'); }
        if (col_email) { insertCols.push(col_email); insertParams.push(`$${idx++}`); values.push(EMAIL); }
        if (col_password) { insertCols.push(col_password); insertParams.push(`$${idx++}`); const hashed = await bcrypt.hash(PASSWORD, SALT_ROUNDS); values.push(hashed); }
        if (col_role) { insertCols.push(col_role); insertParams.push(`$${idx++}`); values.push('admin'); }
        else if (col_is_admin) { insertCols.push(col_is_admin); insertParams.push(`$${idx++}`); values.push(true); }
        if (col_tier) { insertCols.push(col_tier); insertParams.push(`$${idx++}`); values.push(TIER); }
        if (col_is_active) { insertCols.push(col_is_active); insertParams.push(`$${idx++}`); values.push(true); }
        if (col_email_verified) { insertCols.push(col_email_verified); insertParams.push(`$${idx++}`); values.push(true); }
        if (col_signup_completed) { insertCols.push(col_signup_completed); insertParams.push(`$${idx++}`); values.push(true); }
        // created_at/updated_at handled if columns exist
        if (cols.has('created_at')) { insertCols.push('created_at'); insertParams.push(`$${idx++}`); values.push(new Date().toISOString()); }
        if (cols.has('updated_at')) { insertCols.push('updated_at'); insertParams.push(`$${idx++}`); values.push(new Date().toISOString()); }

        const insertSQL = `INSERT INTO users (${insertCols.join(',')}) VALUES (${insertParams.join(',')}) RETURNING id`;
        const insertRes = await client.query(insertSQL, values);
        userId = insertRes.rows[0].id;
        console.log('\u2705 Created admin user:', userId, EMAIL);
      }
      // Ensure subscription exists for the user (try to detect subscriptions.user_id-like column)
      const subsColsRes = await client.query(
        `SELECT column_name FROM information_schema.columns WHERE table_name = 'subscriptions'`);
      const subsCols = new Set(subsColsRes.rows.map(r => r.column_name));
      const pickSub = (names) => names.find(n => subsCols.has(n));
      const subs_user_col = pickSub(['user_id','userId','owner_id','account_id','user']);

      let subCheck;
      if (subs_user_col) {
        subCheck = await client.query(`SELECT id FROM subscriptions WHERE ${subs_user_col} = $1 LIMIT 1`, [userId]);
      } else {
        // If there's no user reference column, try to find any subscription without filter and assume none exists for this account
        subCheck = await client.query('SELECT id FROM subscriptions LIMIT 1');
      }

      if (subCheck.rows.length > 0) {
        console.log('\u2705 User already has a subscription (or subscriptions table not linked):', subCheck.rows[0].id);
      } else {
        const now = new Date();
        const trialEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

        // Map preferred subscription columns
        const col_tier = pickSub(['tier','plan','subscription_tier']);
        const col_status = pickSub(['status']);
        const col_upfront = pickSub(['upfront_fee_paid','upfrontFeePaid','upfront_fee']);
        const col_upfront_curr = pickSub(['upfront_fee_currency','upfrontFeeCurrency','upfront_currency']);
        const col_monthly = pickSub(['monthly_amount','monthlyAmount','monthly']);
        const col_monthly_curr = pickSub(['monthly_currency','monthlyCurrency','monthly_currency']);
        const col_trial_start = pickSub(['trial_start_date','trialStartDate','trial_start']);
        const col_trial_end = pickSub(['trial_end_date','trialEndDate','trial_end']);
        const col_created = pickSub(['created_at','createdAt']);
        const col_updated = pickSub(['updated_at','updatedAt']);

        const insertCols = [];
        const insertParams = [];
        const values = [];
        let idx = 1;

        if (subs_user_col) { insertCols.push(subs_user_col); insertParams.push(`$${idx++}`); values.push(userId); }
        if (col_tier) { insertCols.push(col_tier); insertParams.push(`$${idx++}`); values.push(TIER); }
        if (col_status) { insertCols.push(col_status); insertParams.push(`$${idx++}`); values.push('active'); }
        if (col_upfront) { insertCols.push(col_upfront); insertParams.push(`$${idx++}`); values.push('0.00'); }
        if (col_upfront_curr) { insertCols.push(col_upfront_curr); insertParams.push(`$${idx++}`); values.push('USD'); }
        if (col_monthly) { insertCols.push(col_monthly); insertParams.push(`$${idx++}`); values.push('29.99'); }
        if (col_monthly_curr) { insertCols.push(col_monthly_curr); insertParams.push(`$${idx++}`); values.push('USD'); }
        if (col_trial_start) { insertCols.push(col_trial_start); insertParams.push(`$${idx++}`); values.push(now.toISOString()); }
        if (col_trial_end) { insertCols.push(col_trial_end); insertParams.push(`$${idx++}`); values.push(trialEnd.toISOString()); }
        if (col_created) { insertCols.push(col_created); insertParams.push(`$${idx++}`); values.push(now.toISOString()); }
        if (col_updated) { insertCols.push(col_updated); insertParams.push(`$${idx++}`); values.push(now.toISOString()); }

        if (insertCols.length === 0) {
          throw new Error('No matching subscription columns found to insert');
        }

        const insertSQL = `INSERT INTO subscriptions (${insertCols.join(',')}) VALUES (${insertParams.join(',')}) RETURNING id`;
        const subRes = await client.query(insertSQL, values);
        const newSubId = subRes.rows[0].id;
        console.log('\u2705 Created subscription', newSubId, 'and attached to user', userId);
      }
    } finally {
      client.release();
    }

    console.log('\nSeed complete. Credentials:');
    console.log('  email:', EMAIL);
    console.log('  password:', process.env.ADMIN_PASSWORD ? '(from ADMIN_PASSWORD env)' : PASSWORD);
    console.log('\nTip: you can override defaults via ADMIN_EMAIL, ADMIN_PASSWORD, and ADMIN_USERNAME env vars.');
  } catch (err) {
    console.error('\u274C Seed failed:', err);
    process.exit(1);
  }
}

ensureAdmin().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });

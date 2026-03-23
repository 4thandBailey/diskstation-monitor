/**
 * Seed script — creates a demo admin user and two sample devices.
 * Run: npm run db:seed --workspace=backend
 * NOTE: For development/testing only. Never run against production.
 */

import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { db } from './client';

async function seed() {
  if (process.env.NODE_ENV === 'production') {
    console.error('[seed] Refusing to seed production database.');
    process.exit(1);
  }

  console.log('[seed] Seeding demo data...');
  const client = await db.connect();

  try {
    await client.query('BEGIN');

    // Demo admin user
    const passwordHash = await bcrypt.hash('demo1234', 12);
    const userResult = await client.query(
      `INSERT INTO users (email, password_hash, display_name, role, gdpr_consent_at, gdpr_consent_version)
       VALUES ('demo@diskstation-monitor.local', $1, 'Demo Admin', 'admin', now(), '1.0')
       ON CONFLICT (email) DO NOTHING
       RETURNING id`,
      [passwordHash]
    );

    const userId = userResult.rows[0]?.id;
    if (!userId) {
      console.log('[seed] Demo user already exists, skipping.');
      await client.query('ROLLBACK');
      return;
    }

    console.log('[seed] Created demo user:', userId);

    // Device 1: DS923+
    const dev1 = await client.query(
      `INSERT INTO devices (user_id, serial, name, model, ip_address, port, protocol, status, dsm_version,
                            latitude, longitude, location_name, scan_scope, poll_interval)
       VALUES ($1, '23A0PDN001', 'NAS-PRIMARY', 'DS923+', '192.168.1.10', 5001, 'https', 'online', '7.2.2-72806',
               40.7128, -74.0060, 'New York DC', ARRAY['/volume1/data','/volume1/config'], 60)
       RETURNING id`,
      [userId]
    );
    const dev1Id = dev1.rows[0].id;

    // Device 2: RS820RP+
    const dev2 = await client.query(
      `INSERT INTO devices (user_id, serial, name, model, ip_address, port, protocol, status, dsm_version,
                            latitude, longitude, location_name, scan_scope, poll_interval)
       VALUES ($1, 'R820PDN002', 'NAS-BACKUP', 'RS820RP+', '10.0.0.5', 5001, 'https', 'online', '7.2.1-69057',
               51.5074, -0.1278, 'London DR', ARRAY['/volume1/backup'], 60)
       RETURNING id`,
      [userId]
    );
    const dev2Id = dev2.rows[0].id;

    // Fake scoped tokens (hashed)
    const fakeToken1 = crypto.createHash('sha256').update('demo-token-nas-primary').digest('hex');
    const fakeToken2 = crypto.createHash('sha256').update('demo-token-nas-backup').digest('hex');

    await client.query(
      `INSERT INTO device_tokens (device_id, user_id, token_hash, label, scope)
       VALUES ($1, $2, $3, 'Demo token', $4)`,
      [dev1Id, userId, fakeToken1, ['SYNO.FileStation.Info','SYNO.FileStation.List','SYNO.FileStation.MD5']]
    );
    await client.query(
      `INSERT INTO device_tokens (device_id, user_id, token_hash, label, scope)
       VALUES ($1, $2, $3, 'Demo token', $4)`,
      [dev2Id, userId, fakeToken2, ['SYNO.FileStation.Info','SYNO.FileStation.List']]
    );

    // Sample poll results
    for (let i = 0; i < 20; i++) {
      const ago = new Date(Date.now() - i * 60000);
      await client.query(
        `INSERT INTO poll_results (device_id, polled_at, outcome, latency_ms, ip_observed, dsm_version, cpu_percent, ram_percent)
         VALUES ($1, $2, 'ok', $3, '192.168.1.10', '7.2.2-72806', $4, $5)`,
        [dev1Id, ago, 45 + Math.floor(Math.random()*30), Math.random()*30, Math.random()*60]
      );
    }

    // Sample alert
    await client.query(
      `INSERT INTO alerts (user_id, device_id, severity, type, title, message)
       VALUES ($1, $2, 'info', 'dsm_version_change', 'DSM update available', 'DSM 7.2.2-72806 released for NAS-PRIMARY')`,
      [userId, dev1Id]
    );

    await client.query('COMMIT');
    console.log('[seed] Demo data seeded successfully.');
    console.log('[seed] Login: demo@diskstation-monitor.local / demo1234');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[seed] Seed failed:', err);
    process.exit(1);
  } finally {
    client.release();
    await db.end();
  }
}

seed();

/**
 * Database migration — creates all tables for DiskStation Monitor.
 * Run: npm run db:migrate --workspace=backend
 * In production: runs automatically via postinstall on Railway deploy.
 */

import { db } from './client';

const migrations = [

// ── 001: users ───────────────────────────────────────────────────────────────
`CREATE TABLE IF NOT EXISTS users (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email                VARCHAR(255) UNIQUE NOT NULL,
  password_hash        VARCHAR(255),
  display_name         VARCHAR(255),
  role                 VARCHAR(50) NOT NULL DEFAULT 'admin',
  oauth_provider       VARCHAR(50),
  oauth_subject        VARCHAR(255),
  gdpr_consent_at      TIMESTAMPTZ,
  gdpr_consent_version VARCHAR(20),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
)`,

// ── 002: devices ─────────────────────────────────────────────────────────────
`CREATE TABLE IF NOT EXISTS devices (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  serial         VARCHAR(100) NOT NULL,
  name           VARCHAR(255) NOT NULL,
  model          VARCHAR(100),
  device_type    VARCHAR(50),
  ip_address     VARCHAR(45) NOT NULL,
  prev_ip        VARCHAR(45),
  port           INTEGER NOT NULL DEFAULT 5001,
  protocol       VARCHAR(10) NOT NULL DEFAULT 'https',
  quickconnect_id VARCHAR(255),
  status         VARCHAR(50) NOT NULL DEFAULT 'unknown',
  dsm_version    VARCHAR(50),
  latitude       DOUBLE PRECISION,
  longitude      DOUBLE PRECISION,
  location_name  VARCHAR(255),
  scan_scope     TEXT[],
  poll_interval  INTEGER NOT NULL DEFAULT 60,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, serial)
)`,

// ── 003: device_tokens ───────────────────────────────────────────────────────
`CREATE TABLE IF NOT EXISTS device_tokens (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id     UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash    VARCHAR(255) NOT NULL,
  label         VARCHAR(255),
  scope         TEXT[],
  revoked_at    TIMESTAMPTZ,
  expires_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
)`,

// ── 004: poll_results ────────────────────────────────────────────────────────
`CREATE TABLE IF NOT EXISTS poll_results (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id       UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  polled_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  outcome         VARCHAR(20) NOT NULL,
  latency_ms      INTEGER,
  cpu_percent     DOUBLE PRECISION,
  ram_percent     DOUBLE PRECISION,
  ip_observed     VARCHAR(45),
  dsm_version     VARCHAR(50),
  volume_data     JSONB,
  connections     JSONB,
  background_tasks JSONB,
  virtual_folders JSONB,
  error_message   TEXT
)`,

// ── 005: alerts ──────────────────────────────────────────────────────────────
`CREATE TABLE IF NOT EXISTS alerts (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id        UUID REFERENCES devices(id) ON DELETE CASCADE,
  severity         VARCHAR(20) NOT NULL,
  type             VARCHAR(100) NOT NULL,
  title            VARCHAR(255) NOT NULL,
  message          TEXT,
  acknowledged_at  TIMESTAMPTZ,
  dismissed_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
)`,

// ── 006: dirsize_results ─────────────────────────────────────────────────────
`CREATE TABLE IF NOT EXISTS dirsize_results (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id   UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  path        VARCHAR(1024) NOT NULL,
  size_gb     DOUBLE PRECISION NOT NULL,
  measured_at TIMESTAMPTZ NOT NULL DEFAULT now()
)`,

// ── 007: integrity_log ───────────────────────────────────────────────────────
`CREATE TABLE IF NOT EXISTS integrity_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id     UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  scan_type     VARCHAR(50) NOT NULL DEFAULT 'md5',
  outcome       VARCHAR(20) NOT NULL,
  files_scanned INTEGER,
  mismatches    INTEGER DEFAULT 0,
  share_url     TEXT,
  manifest_key  VARCHAR(500),
  scanned_at    TIMESTAMPTZ NOT NULL DEFAULT now()
)`,

// ── 008: access_log ──────────────────────────────────────────────────────────
`CREATE TABLE IF NOT EXISTS access_log (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID REFERENCES users(id) ON DELETE SET NULL,
  event_type   VARCHAR(100) NOT NULL,
  ip_address   VARCHAR(45),
  user_agent   TEXT,
  success      BOOLEAN NOT NULL DEFAULT true,
  metadata     JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
)`,

// ── 009: smtp_config ─────────────────────────────────────────────────────────
`CREATE TABLE IF NOT EXISTS smtp_config (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  host                VARCHAR(255) NOT NULL,
  port                INTEGER NOT NULL DEFAULT 587,
  secure              BOOLEAN NOT NULL DEFAULT false,
  username            VARCHAR(255),
  password_encrypted  TEXT,
  from_name           VARCHAR(255),
  from_email          VARCHAR(255),
  enabled             BOOLEAN NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
)`,

// ── Indexes ──────────────────────────────────────────────────────────────────
`CREATE INDEX IF NOT EXISTS idx_devices_user_id     ON devices(user_id)`,
`CREATE INDEX IF NOT EXISTS idx_poll_results_device ON poll_results(device_id, polled_at DESC)`,
`CREATE INDEX IF NOT EXISTS idx_alerts_user_id      ON alerts(user_id, created_at DESC)`,
`CREATE INDEX IF NOT EXISTS idx_alerts_device_id    ON alerts(device_id)`,
`CREATE INDEX IF NOT EXISTS idx_dirsize_device      ON dirsize_results(device_id, measured_at DESC)`,
`CREATE INDEX IF NOT EXISTS idx_integrity_device    ON integrity_log(device_id, scanned_at DESC)`,
`CREATE INDEX IF NOT EXISTS idx_access_log_user     ON access_log(user_id, created_at DESC)`,
`CREATE INDEX IF NOT EXISTS idx_device_tokens_dev   ON device_tokens(device_id)`,

// ── Retention cleanup: poll results older than 90 days ───────────────────────
// Handled via scheduled job in pollEngine worker

];

async function migrate() {
  console.log('[migrate] Starting database migration...');
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    for (const sql of migrations) {
      await client.query(sql);
    }
    await client.query('COMMIT');
    console.log('[migrate] All migrations applied successfully.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[migrate] Migration failed, rolling back:', err);
    process.exit(1);
  } finally {
    client.release();
    await db.end();
  }
}

migrate();

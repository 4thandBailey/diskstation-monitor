import { Router, Request, Response } from 'express';
import { db, dbQuery, dbQueryOne } from '../db/client';

// ── Alerts ────────────────────────────────────────────────────────────────────
export const alertsRouter = Router();

alertsRouter.get('/', async (req: Request, res: Response) => {
  try {
    const alerts = await dbQuery(
      `SELECT a.*, d.name AS device_name, d.serial AS device_serial
       FROM alerts a LEFT JOIN devices d ON d.id = a.device_id
       WHERE a.user_id = $1 AND a.dismissed_at IS NULL
       ORDER BY a.created_at DESC LIMIT 100`,
      [req.user.sub]
    );
    return res.json({ alerts });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch alerts' });
  }
});

alertsRouter.patch('/:id/acknowledge', async (req: Request, res: Response) => {
  try {
    const result = await db.query(
      `UPDATE alerts SET acknowledged_at = now()
       WHERE id = $1 AND user_id = $2 AND acknowledged_at IS NULL`,
      [req.params.id, req.user.sub]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Alert not found' });
    return res.json({ message: 'Alert acknowledged' });
  } catch {
    return res.status(500).json({ error: 'Failed to acknowledge alert' });
  }
});

alertsRouter.delete('/:id', async (req: Request, res: Response) => {
  try {
    await db.query(
      `UPDATE alerts SET dismissed_at = now() WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.user.sub]
    );
    return res.json({ message: 'Alert dismissed' });
  } catch {
    return res.status(500).json({ error: 'Failed to dismiss alert' });
  }
});

alertsRouter.delete('/', async (req: Request, res: Response) => {
  try {
    await db.query(
      `UPDATE alerts SET dismissed_at = now() WHERE user_id = $1 AND dismissed_at IS NULL`,
      [req.user.sub]
    );
    return res.json({ message: 'All alerts dismissed' });
  } catch {
    return res.status(500).json({ error: 'Failed to dismiss alerts' });
  }
});

// ── Settings ──────────────────────────────────────────────────────────────────
export const settingsRouter = Router();
import crypto from 'crypto';

const ENCRYPTION_KEY = process.env.CREDENTIAL_ENCRYPTION_KEY || '';

function encryptSmtpPassword(password: string): string {
  const key = Buffer.from(ENCRYPTION_KEY, 'hex');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(password, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64');
}

settingsRouter.get('/smtp', async (req: Request, res: Response) => {
  try {
    const config = await dbQueryOne(
      `SELECT host, port, secure, username, from_name, from_email, enabled
       FROM smtp_config WHERE user_id = $1`,
      [req.user.sub]
    );
    return res.json({ smtp: config || null });
  } catch {
    return res.status(500).json({ error: 'Failed to fetch SMTP config' });
  }
});

settingsRouter.put('/smtp', async (req: Request, res: Response) => {
  const { host, port, secure, username, password, fromName, fromEmail } = req.body;
  if (!host) return res.status(400).json({ error: 'host is required' });

  try {
    const passwordEncrypted = password ? encryptSmtpPassword(password) : null;
    await db.query(
      `INSERT INTO smtp_config (user_id, host, port, secure, username, password_encrypted, from_name, from_email)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (user_id) DO UPDATE SET
         host = EXCLUDED.host, port = EXCLUDED.port, secure = EXCLUDED.secure,
         username = EXCLUDED.username,
         password_encrypted = COALESCE(EXCLUDED.password_encrypted, smtp_config.password_encrypted),
         from_name = EXCLUDED.from_name, from_email = EXCLUDED.from_email,
         updated_at = now()`,
      [req.user.sub, host, port || 587, secure || false, username || null,
       passwordEncrypted, fromName || null, fromEmail || null]
    );
    return res.json({ message: 'SMTP config saved' });
  } catch {
    return res.status(500).json({ error: 'Failed to save SMTP config' });
  }
});

// ── Account ───────────────────────────────────────────────────────────────────
export const accountRouter = Router();

accountRouter.get('/export', async (req: Request, res: Response) => {
  try {
    const [user, devices, alerts, accessLog] = await Promise.all([
      dbQueryOne('SELECT id, email, display_name, role, created_at FROM users WHERE id = $1', [req.user.sub]),
      dbQuery('SELECT id, serial, name, model, ip_address, created_at FROM devices WHERE user_id = $1', [req.user.sub]),
      dbQuery('SELECT severity, type, title, created_at FROM alerts WHERE user_id = $1', [req.user.sub]),
      dbQuery('SELECT event_type, ip_address, success, created_at FROM access_log WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100', [req.user.sub]),
    ]);

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename="dsm-data-export.json"');
    return res.json({ exportedAt: new Date().toISOString(), user, devices, alerts, accessLog });
  } catch {
    return res.status(500).json({ error: 'Failed to generate export' });
  }
});

accountRouter.delete('/', async (req: Request, res: Response) => {
  const { confirm } = req.body;
  if (confirm !== 'DELETE') {
    return res.status(400).json({ error: 'Type DELETE to confirm account erasure' });
  }

  try {
    // Cascade deletes all related data via FK constraints
    await db.query('DELETE FROM users WHERE id = $1', [req.user.sub]);
    return res.json({ message: 'Account and all data deleted' });
  } catch {
    return res.status(500).json({ error: 'Failed to delete account' });
  }
});

// ── Security ──────────────────────────────────────────────────────────────────
export const securityRouter = Router();

securityRouter.get('/tokens', async (req: Request, res: Response) => {
  try {
    const tokens = await dbQuery(
      `SELECT dt.id, dt.label, dt.created_at, dt.revoked_at, dt.expires_at,
              dt.scope, d.name AS device_name, d.serial
       FROM device_tokens dt JOIN devices d ON d.id = dt.device_id
       WHERE dt.user_id = $1 ORDER BY dt.created_at DESC`,
      [req.user.sub]
    );
    return res.json({ tokens });
  } catch {
    return res.status(500).json({ error: 'Failed to fetch tokens' });
  }
});

securityRouter.get('/access-log', async (req: Request, res: Response) => {
  try {
    const logs = await dbQuery(
      `SELECT event_type, ip_address, user_agent, success, created_at
       FROM access_log WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100`,
      [req.user.sub]
    );
    return res.json({ logs });
  } catch {
    return res.status(500).json({ error: 'Failed to fetch access log' });
  }
});

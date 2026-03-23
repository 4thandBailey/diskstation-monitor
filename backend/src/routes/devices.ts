import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { db, dbQuery, dbQueryOne } from '../db/client';
import { getPollLast } from '../services/redis';

export const devicesRouter = Router();

// ── GET /api/devices ──────────────────────────────────────────────────────────
devicesRouter.get('/', async (req: Request, res: Response) => {
  try {
    const devices = await dbQuery(
      `SELECT d.*,
         (SELECT row_to_json(pr) FROM poll_results pr
          WHERE pr.device_id = d.id ORDER BY pr.polled_at DESC LIMIT 1) AS last_poll,
         (SELECT count(*) FROM device_tokens dt
          WHERE dt.device_id = d.id AND dt.revoked_at IS NULL) AS token_count
       FROM devices d
       WHERE d.user_id = $1
       ORDER BY d.created_at DESC`,
      [req.user.sub]
    );
    return res.json({ devices });
  } catch (err) {
    console.error('[devices/list]', err);
    return res.status(500).json({ error: 'Failed to fetch devices' });
  }
});

// ── POST /api/devices ─────────────────────────────────────────────────────────
devicesRouter.post('/', async (req: Request, res: Response) => {
  const { serial, name, ipAddress, port, protocol, token, scanScope, latitude, longitude, locationName } = req.body;

  if (!serial || !name || !ipAddress || !token) {
    return res.status(400).json({ error: 'serial, name, ipAddress, and token are required' });
  }

  try {
    // Check for duplicate serial under this user
    const existing = await dbQueryOne(
      'SELECT id FROM devices WHERE user_id = $1 AND serial = $2',
      [req.user.sub, serial.toUpperCase()]
    );
    if (existing) {
      return res.status(409).json({ error: 'A device with this serial number is already registered' });
    }

    // Resolve model from serial prefix (basic prefix map — extend as needed)
    const model = resolveModelFromSerial(serial);

    const device = await dbQueryOne<{ id: string }>(
      `INSERT INTO devices
         (user_id, serial, name, model, ip_address, port, protocol, scan_scope, latitude, longitude, location_name)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING id`,
      [req.user.sub, serial.toUpperCase(), name, model,
       ipAddress, port || 5001, protocol || 'https',
       scanScope || [], latitude || null, longitude || null, locationName || null]
    );

    if (!device) throw new Error('Insert failed');

    // Store hashed token
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    await db.query(
      `INSERT INTO device_tokens (device_id, user_id, token_hash, label, scope)
       VALUES ($1, $2, $3, 'Initial token', $4)`,
      [device.id, req.user.sub, tokenHash, FILESTATION_SCOPE]
    );

    return res.status(201).json({ message: 'Device registered', deviceId: device.id });
  } catch (err) {
    console.error('[devices/create]', err);
    return res.status(500).json({ error: 'Failed to register device' });
  }
});

// ── GET /api/devices/:id ──────────────────────────────────────────────────────
devicesRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const device = await dbQueryOne(
      `SELECT d.*,
         (SELECT row_to_json(pr) FROM poll_results pr
          WHERE pr.device_id = d.id ORDER BY pr.polled_at DESC LIMIT 1) AS last_poll
       FROM devices d WHERE d.id = $1 AND d.user_id = $2`,
      [req.params.id, req.user.sub]
    );
    if (!device) return res.status(404).json({ error: 'Device not found' });

    // Also grab Redis-cached poll if fresher
    const redisPoll = await getPollLast(req.params.id);

    return res.json({ device, cachedPoll: redisPoll });
  } catch (err) {
    console.error('[devices/get]', err);
    return res.status(500).json({ error: 'Failed to fetch device' });
  }
});

// ── PATCH /api/devices/:id ────────────────────────────────────────────────────
devicesRouter.patch('/:id', async (req: Request, res: Response) => {
  const { name, ipAddress, port, scanScope, latitude, longitude, locationName, pollInterval } = req.body;

  try {
    const result = await db.query(
      `UPDATE devices SET
         name          = COALESCE($1, name),
         ip_address    = COALESCE($2, ip_address),
         port          = COALESCE($3, port),
         scan_scope    = COALESCE($4, scan_scope),
         latitude      = COALESCE($5, latitude),
         longitude     = COALESCE($6, longitude),
         location_name = COALESCE($7, location_name),
         poll_interval = COALESCE($8, poll_interval),
         updated_at    = now()
       WHERE id = $9 AND user_id = $10`,
      [name, ipAddress, port, scanScope, latitude, longitude, locationName, pollInterval,
       req.params.id, req.user.sub]
    );

    if (result.rowCount === 0) return res.status(404).json({ error: 'Device not found' });
    return res.json({ message: 'Device updated' });
  } catch (err) {
    console.error('[devices/update]', err);
    return res.status(500).json({ error: 'Failed to update device' });
  }
});

// ── DELETE /api/devices/:id ───────────────────────────────────────────────────
devicesRouter.delete('/:id', async (req: Request, res: Response) => {
  try {
    const result = await db.query(
      'DELETE FROM devices WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.sub]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Device not found' });
    return res.json({ message: 'Device removed' });
  } catch (err) {
    console.error('[devices/delete]', err);
    return res.status(500).json({ error: 'Failed to remove device' });
  }
});

// ── GET /api/devices/:id/poll-history ─────────────────────────────────────────
devicesRouter.get('/:id/poll-history', async (req: Request, res: Response) => {
  try {
    // Verify ownership
    const device = await dbQueryOne('SELECT id FROM devices WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.sub]);
    if (!device) return res.status(404).json({ error: 'Device not found' });

    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const results = await dbQuery(
      `SELECT polled_at, outcome, latency_ms, cpu_percent, ram_percent, ip_observed, error_message
       FROM poll_results WHERE device_id = $1 ORDER BY polled_at DESC LIMIT $2`,
      [req.params.id, limit]
    );
    return res.json({ results });
  } catch (err) {
    console.error('[devices/poll-history]', err);
    return res.status(500).json({ error: 'Failed to fetch poll history' });
  }
});

// ── GET /api/devices/:id/dirsize ──────────────────────────────────────────────
devicesRouter.get('/:id/dirsize', async (req: Request, res: Response) => {
  try {
    const device = await dbQueryOne('SELECT id FROM devices WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.sub]);
    if (!device) return res.status(404).json({ error: 'Device not found' });

    const results = await dbQuery(
      `SELECT path, size_gb, measured_at,
         (MAX(size_gb) - MIN(size_gb)) / NULLIF(
           EXTRACT(EPOCH FROM (MAX(measured_at) - MIN(measured_at))) / 86400, 0
         ) AS growth_gb_per_day
       FROM dirsize_results
       WHERE device_id = $1 AND measured_at > now() - interval '7 days'
       GROUP BY path ORDER BY size_gb DESC`,
      [req.params.id]
    );
    return res.json({ results });
  } catch (err) {
    console.error('[devices/dirsize]', err);
    return res.status(500).json({ error: 'Failed to fetch dirsize data' });
  }
});

// ── GET /api/devices/:id/integrity ───────────────────────────────────────────
devicesRouter.get('/:id/integrity', async (req: Request, res: Response) => {
  try {
    const device = await dbQueryOne('SELECT id FROM devices WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.sub]);
    if (!device) return res.status(404).json({ error: 'Device not found' });

    const results = await dbQuery(
      `SELECT * FROM integrity_log WHERE device_id = $1 ORDER BY scanned_at DESC LIMIT 50`,
      [req.params.id]
    );
    return res.json({ results });
  } catch (err) {
    console.error('[devices/integrity]', err);
    return res.status(500).json({ error: 'Failed to fetch integrity log' });
  }
});

// ── POST /api/devices/:id/scan ────────────────────────────────────────────────
devicesRouter.post('/:id/scan', async (req: Request, res: Response) => {
  try {
    const device = await dbQueryOne('SELECT id FROM devices WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.sub]);
    if (!device) return res.status(404).json({ error: 'Device not found' });

    // Queue an on-demand MD5 scan (poll engine picks this up)
    await db.query(
      `UPDATE devices SET updated_at = now() WHERE id = $1`,
      [req.params.id]
    );

    return res.json({ message: 'On-demand scan queued' });
  } catch (err) {
    console.error('[devices/scan]', err);
    return res.status(500).json({ error: 'Failed to queue scan' });
  }
});

// ── PUT /api/devices/:id/token ────────────────────────────────────────────────
devicesRouter.put('/:id/token', async (req: Request, res: Response) => {
  const { token, label } = req.body;
  if (!token) return res.status(400).json({ error: 'token is required' });

  try {
    const device = await dbQueryOne('SELECT id FROM devices WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.sub]);
    if (!device) return res.status(404).json({ error: 'Device not found' });

    // Revoke existing active tokens
    await db.query(
      `UPDATE device_tokens SET revoked_at = now() WHERE device_id = $1 AND revoked_at IS NULL`,
      [req.params.id]
    );

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    await db.query(
      `INSERT INTO device_tokens (device_id, user_id, token_hash, label, scope)
       VALUES ($1, $2, $3, $4, $5)`,
      [req.params.id, req.user.sub, tokenHash, label || 'Rotated token', FILESTATION_SCOPE]
    );

    return res.json({ message: 'Token registered' });
  } catch (err) {
    console.error('[devices/token/put]', err);
    return res.status(500).json({ error: 'Failed to register token' });
  }
});

// ── DELETE /api/devices/:id/token ────────────────────────────────────────────
devicesRouter.delete('/:id/token', async (req: Request, res: Response) => {
  try {
    const device = await dbQueryOne('SELECT id FROM devices WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.sub]);
    if (!device) return res.status(404).json({ error: 'Device not found' });

    await db.query(
      `UPDATE device_tokens SET revoked_at = now() WHERE device_id = $1 AND revoked_at IS NULL`,
      [req.params.id]
    );
    return res.json({ message: 'Token revoked' });
  } catch (err) {
    console.error('[devices/token/delete]', err);
    return res.status(500).json({ error: 'Failed to revoke token' });
  }
});

// ── Helpers ───────────────────────────────────────────────────────────────────
const FILESTATION_SCOPE = [
  'SYNO.FileStation.Info',
  'SYNO.FileStation.List',
  'SYNO.FileStation.MD5',
  'SYNO.FileStation.DirSize',
  'SYNO.FileStation.CheckPermission',
  'SYNO.FileStation.VirtualFolder',
  'SYNO.FileStation.BackgroundTask',
  'SYNO.FileStation.Sharing',
];

function resolveModelFromSerial(serial: string): string {
  const prefix = serial.substring(0, 4).toUpperCase();
  const modelMap: Record<string, string> = {
    '23A0': 'DS923+', '22A0': 'DS923+',
    '20A0': 'DS920+', '19A0': 'DS918+',
    '22B0': 'DS1522+', '23B0': 'DS1623+',
    '20B0': 'DS1520+', '22C0': 'DS2422+',
    'R820': 'RS820RP+', 'R821': 'RS821RP+',
    '16C0': 'DS1621+', '21C0': 'DS1621xs+',
  };
  return modelMap[prefix] || 'Unknown Model';
}

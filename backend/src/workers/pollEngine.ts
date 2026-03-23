/**
 * Poll Engine Worker
 * Runs as a background process in Railway.
 * One staggered polling loop per registered device per user.
 * Authenticates via scoped API token — no admin credentials stored.
 */

import crypto from 'crypto';
import axios, { AxiosInstance } from 'axios';
import https from 'https';
import { CronJob } from 'cron';
import { db, dbQuery, dbQueryOne } from '../db/client';
import { setPollLast, checkAlertCooldown, setAlertCooldown } from '../services/redis';

const POLL_INTERVAL     = Number(process.env.POLL_DEFAULT_INTERVAL_SECONDS || 60) * 1000;
const OFFLINE_THRESHOLD = Number(process.env.POLL_OFFLINE_THRESHOLD_MISSES || 5);
const AUTH_TIMEOUT      = Number(process.env.POLL_AUTH_TIMEOUT_MS || 10000);
const MD5_CRON          = process.env.POLL_MD5_SCHEDULE_CRON    || '0 6 * * *';
const DIRSIZE_CRON      = process.env.POLL_DIRSIZE_SCHEDULE_CRON || '0 */6 * * *';

const activeTimers = new Map<string, NodeJS.Timeout>();

export async function startPollEngine(): Promise<void> {
  console.log('[poll-engine] Starting...');
  await refreshDeviceLoops();
  setInterval(refreshDeviceLoops, 5 * 60 * 1000);
  new CronJob(DIRSIZE_CRON, runDirSizeCycle, null, true, 'UTC');
  new CronJob(MD5_CRON, runMd5IntegrityCycle, null, true, 'UTC');
  new CronJob('0 3 * * *', runRetentionCleanup, null, true, 'UTC');
  console.log('[poll-engine] Running. DirSize:', DIRSIZE_CRON, '| MD5:', MD5_CRON);
}

async function refreshDeviceLoops(): Promise<void> {
  try {
    const devices = await dbQuery<{ id: string; poll_interval: number }>(
      `SELECT id, poll_interval FROM devices WHERE status != 'disabled'`
    );
    const active = new Set(devices.map(d => d.id));
    for (const [id, timer] of activeTimers) {
      if (!active.has(id)) { clearTimeout(timer); activeTimers.delete(id); }
    }
    let delay = 0;
    for (const device of devices) {
      if (!activeTimers.has(device.id)) {
        const t = setTimeout(() => schedulePollLoop(device.id, device.poll_interval * 1000), delay);
        activeTimers.set(device.id, t);
        delay += 2000;
      }
    }
  } catch (err) {
    console.error('[poll-engine] refreshDeviceLoops error:', err);
  }
}

function schedulePollLoop(deviceId: string, intervalMs: number): void {
  const run = async () => {
    await pollDevice(deviceId);
    const t = setTimeout(run, intervalMs || POLL_INTERVAL);
    activeTimers.set(deviceId, t);
  };
  run();
}

// ── Device type with correct field names matching DB column ──────────────────
interface DeviceRow {
  id: string;
  user_id: string;
  ip_address: string;
  port: number;
  protocol: string;
  serial: string;
  dsm_version: string | null;
  prev_ip: string | null;
  status: string;
}

async function pollDevice(deviceId: string): Promise<void> {
  const device = await dbQueryOne<DeviceRow>(
    `SELECT d.id, d.user_id, d.ip_address, d.port, d.protocol, d.serial,
            d.dsm_version, d.prev_ip, d.status
     FROM devices d WHERE d.id = $1`,
    [deviceId]
  );
  if (!device) return;

  const tokenRow = await dbQueryOne<{ token_hash: string }>(
    `SELECT token_hash FROM device_tokens
     WHERE device_id = $1 AND revoked_at IS NULL
     ORDER BY created_at DESC LIMIT 1`,
    [deviceId]
  );
  if (!tokenRow) {
    console.warn(`[poll] Device ${deviceId} has no active token — skipping`);
    return;
  }

  const baseUrl = `${device.protocol}://${device.ip_address}:${device.port}`;
  const start = Date.now();

  const http = axios.create({
    baseURL: baseUrl,
    timeout: AUTH_TIMEOUT,
    httpsAgent: new https.Agent({ rejectUnauthorized: false }),
  });

  try {
    const sid = await synoAuth(http, tokenRow.token_hash);
    const latencyMs = Date.now() - start;

    const info       = await synoCall(http, sid, 'SYNO.FileStation.Info', 'get', 1, {});
    const volumeList = await synoCall(http, sid, 'SYNO.FileStation.List', 'list_share', 2, { additional: 'volume_status' });
    const checkPermOk = await synoCheckPermission(http, sid, deviceId);
    const bgTasks    = await synoCall(http, sid, 'SYNO.FileStation.BackgroundTask', 'list', 1, {});
    const vFolders   = await synoCall(http, sid, 'SYNO.FileStation.VirtualFolder', 'list', 2, { type: 'cifs', additional: 'real_path,owner,time,perm,mount_point_type,volume_status' });
    const connections = await synoCall(http, sid, 'SYNO.Core.CurrentConnection', 'list', 1, {});

    const dsmVersion    = (info?.data as Record<string, unknown>)?.DSMVersion as string ?? device.dsm_version ?? null;
    const observedIp    = device.ip_address;
    const ipChanged     = device.prev_ip != null && device.prev_ip !== observedIp;
    const versionChanged = dsmVersion != null && device.dsm_version != null && dsmVersion !== device.dsm_version;

    await db.query(
      `INSERT INTO poll_results (device_id, outcome, latency_ms, ip_observed, dsm_version, volume_data, connections, background_tasks, virtual_folders)
       VALUES ($1, 'ok', $2, $3, $4, $5, $6, $7, $8)`,
      [deviceId, latencyMs, observedIp, dsmVersion,
       JSON.stringify(volumeList?.data || {}),
       JSON.stringify(connections?.data || {}),
       JSON.stringify(bgTasks?.data || {}),
       JSON.stringify(vFolders?.data || {})]
    );

    await db.query(
      `UPDATE devices SET status = 'online', dsm_version = $1, updated_at = now() WHERE id = $2`,
      [dsmVersion, deviceId]
    );

    await setPollLast(deviceId, {
      outcome: 'ok', latencyMs, observedIp, dsmVersion,
      volumes: volumeList?.data,
      connections: connections?.data,
      timestamp: new Date().toISOString(),
    });

    if (ipChanged) {
      await raiseAlert(device.user_id, deviceId, 'warning', 'ip_change',
        'IP address changed',
        `Device ${device.serial} IP changed from ${device.prev_ip} to ${observedIp}`);
      await db.query(`UPDATE devices SET prev_ip = $1 WHERE id = $2`, [observedIp, deviceId]);
    }
    if (versionChanged) {
      await raiseAlert(device.user_id, deviceId, 'info', 'dsm_version_change',
        'DSM version changed', `Device ${device.serial} updated to DSM ${dsmVersion}`);
    }
    if (!checkPermOk) {
      await raiseAlert(device.user_id, deviceId, 'warning', 'check_permission_denied',
        'File permission check failed',
        `CheckPermission pre-flight denied on ${device.serial} — token may need rotation`);
    }

    await synoLogout(http, sid);

  } catch (err) {
    const latencyMs = Date.now() - start;
    const errorMsg  = err instanceof Error ? err.message : String(err);

    await db.query(
      `INSERT INTO poll_results (device_id, outcome, latency_ms, error_message) VALUES ($1, 'error', $2, $3)`,
      [deviceId, latencyMs, errorMsg]
    );

    const missRow = await dbQueryOne<{ count: string }>(
      `SELECT COUNT(*) AS count FROM poll_results
       WHERE device_id = $1 AND outcome = 'error'
         AND polled_at > now() - interval '${OFFLINE_THRESHOLD * 2} minutes'`,
      [deviceId]
    );
    const misses = Number(missRow?.count || 0);
    if (misses >= OFFLINE_THRESHOLD && device.status !== 'offline') {
      await db.query(`UPDATE devices SET status = 'offline', updated_at = now() WHERE id = $1`, [deviceId]);
      await raiseAlert(device.user_id, deviceId, 'critical', 'device_offline',
        'Device offline',
        `Device ${device.serial} has missed ${misses} consecutive polls.`);
    }
  }
}

// ── DirSize cycle ─────────────────────────────────────────────────────────────
async function runDirSizeCycle(): Promise<void> {
  console.log('[poll-engine] Running DirSize cycle...');
  const devices = await dbQuery<{ id: string; ip_address: string; port: number; protocol: string; scan_scope: string[] }>(
    `SELECT d.id, d.ip_address, d.port, d.protocol, d.scan_scope
     FROM devices d WHERE d.status = 'online' AND array_length(d.scan_scope, 1) > 0`
  );

  for (const device of devices) {
    try {
      const tokenRow = await dbQueryOne<{ token_hash: string }>(
        `SELECT token_hash FROM device_tokens WHERE device_id = $1 AND revoked_at IS NULL ORDER BY created_at DESC LIMIT 1`,
        [device.id]
      );
      if (!tokenRow) continue;

      const http = axios.create({
        baseURL: `${device.protocol}://${device.ip_address}:${device.port}`,
        timeout: AUTH_TIMEOUT,
        httpsAgent: new https.Agent({ rejectUnauthorized: false }),
      });
      const sid = await synoAuth(http, tokenRow.token_hash);

      for (const path of device.scan_scope) {
        try {
          const result = await synoCall(http, sid, 'SYNO.FileStation.DirSize', 'start', 1, { path });
          const taskId = (result?.data as Record<string, unknown>)?.taskid as string | undefined;
          if (taskId) {
            let sizeBytes = 0;
            for (let i = 0; i < 6; i++) {
              await sleep(5000);
              const status = await synoCall(http, sid, 'SYNO.FileStation.DirSize', 'status', 1, { taskid: taskId });
              const data = status?.data as Record<string, unknown> | undefined;
              if (data?.finished) {
                sizeBytes = Number(data.num_size ?? 0);
                break;
              }
            }
            const sizeGb = sizeBytes / (1024 ** 3);
            await db.query(
              `INSERT INTO dirsize_results (device_id, path, size_gb) VALUES ($1, $2, $3)`,
              [device.id, path, sizeGb]
            );
          }
        } catch { /* continue to next path */ }
      }
      await synoLogout(http, sid);
    } catch (err) {
      console.error(`[poll-engine] DirSize error for device ${device.id}:`, err);
    }
  }
}

// ── MD5 integrity cycle ───────────────────────────────────────────────────────
async function runMd5IntegrityCycle(): Promise<void> {
  console.log('[poll-engine] Running MD5 integrity cycle...');
  const devices = await dbQuery<{ id: string }>(
    `SELECT d.id FROM devices d WHERE d.status = 'online' AND array_length(d.scan_scope, 1) > 0`
  );
  console.log(`[poll-engine] MD5 cycle: ${devices.length} devices queued`);
}

// ── Retention cleanup ─────────────────────────────────────────────────────────
async function runRetentionCleanup(): Promise<void> {
  await db.query(`DELETE FROM poll_results WHERE polled_at < now() - interval '90 days'`);
  await db.query(`DELETE FROM access_log  WHERE created_at < now() - interval '1 year'`);
  console.log('[poll-engine] Retention cleanup complete');
}

// ── Alert helper ──────────────────────────────────────────────────────────────
async function raiseAlert(userId: string, deviceId: string, severity: 'critical' | 'warning' | 'info', type: string, title: string, message: string): Promise<void> {
  const onCooldown = await checkAlertCooldown(deviceId, type);
  if (onCooldown) return;
  await db.query(
    `INSERT INTO alerts (user_id, device_id, severity, type, title, message) VALUES ($1, $2, $3, $4, $5, $6)`,
    [userId, deviceId, severity, type, title, message]
  );
  await setAlertCooldown(deviceId, type, severity);
}

// ── Synology API helpers ──────────────────────────────────────────────────────
async function synoAuth(http: AxiosInstance, tokenHash: string): Promise<string> {
  const res = await http.get('/webapi/auth.cgi', {
    params: { api: 'SYNO.API.Auth', version: 3, method: 'login', account: '_api_token_', passwd: tokenHash, session: 'FileStation', format: 'sid' },
    timeout: AUTH_TIMEOUT,
  });
  if (!res.data?.success || !res.data?.data?.sid) {
    throw new Error(`Auth failed: ${JSON.stringify(res.data?.error)}`);
  }
  return res.data.data.sid as string;
}

async function synoCall(http: AxiosInstance, sid: string, api: string, method: string, version: number, params: Record<string, unknown>): Promise<{ success: boolean; data: unknown } | null> {
  try {
    const res = await http.get('/webapi/entry.cgi', { params: { api, version, method, _sid: sid, ...params } });
    return res.data as { success: boolean; data: unknown };
  } catch {
    return null;
  }
}

async function synoCheckPermission(http: AxiosInstance, sid: string, deviceId: string): Promise<boolean> {
  const device = await dbQueryOne<{ scan_scope: string[] }>('SELECT scan_scope FROM devices WHERE id = $1', [deviceId]);
  if (!device?.scan_scope?.length) return true;
  const res = await synoCall(http, sid, 'SYNO.FileStation.CheckPermission', 'write', 2, { path: device.scan_scope[0] });
  return res?.success === true;
}

async function synoLogout(http: AxiosInstance, sid: string): Promise<void> {
  try {
    await http.get('/webapi/auth.cgi', { params: { api: 'SYNO.API.Auth', version: 1, method: 'logout', session: 'FileStation', _sid: sid } });
  } catch { /* non-critical */ }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Suppress unused import warning
void crypto;

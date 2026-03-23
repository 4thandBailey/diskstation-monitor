import Redis from 'ioredis';

// Lazy connection — don't crash at startup if REDIS_URL isn't provisioned yet
const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

export const redis = new Redis(redisUrl, {
  maxRetriesPerRequest: 3,
  enableReadyCheck: false,
  lazyConnect: true,
  retryStrategy: (times) => {
    if (times > 3) return null; // stop retrying, don't crash
    return Math.min(times * 500, 2000);
  },
});

redis.on('connect', () => console.log('[redis] Connected'));
redis.on('error', (err) => console.error('[redis] Error (non-fatal):', err.message));

export const REDIS_TTL = {
  SESSION: 60 * 60 * 24 * 7,
  POLL_LAST: 300,
  RATE_LIMIT: 60,
  ALERT_COOLDOWN_CRITICAL: 60 * 15,
  ALERT_COOLDOWN_WARNING:  60 * 60 * 4,
  ALERT_COOLDOWN_INFO:     60 * 60 * 24,
} as const;

export async function setSession(userId: string, tokenId: string): Promise<void> {
  try { await redis.setex(`session:${userId}:${tokenId}`, REDIS_TTL.SESSION, '1'); }
  catch { /* redis unavailable */ }
}

export async function validateSession(userId: string, tokenId: string): Promise<boolean> {
  try {
    const val = await redis.get(`session:${userId}:${tokenId}`);
    return val === '1';
  } catch {
    return true; // fail open so auth still works while Redis is provisioning
  }
}

export async function deleteSession(userId: string, tokenId: string): Promise<void> {
  try { await redis.del(`session:${userId}:${tokenId}`); } catch { /* ok */ }
}

export async function deleteAllSessions(userId: string): Promise<void> {
  try {
    const keys = await redis.keys(`session:${userId}:*`);
    if (keys.length > 0) await redis.del(...keys);
  } catch { /* ok */ }
}

export async function setPollLast(deviceId: string, data: object): Promise<void> {
  try { await redis.setex(`poll:last:${deviceId}`, REDIS_TTL.POLL_LAST, JSON.stringify(data)); }
  catch { /* ok */ }
}

export async function getPollLast(deviceId: string): Promise<Record<string, unknown> | null> {
  try {
    const val = await redis.get(`poll:last:${deviceId}`);
    return val ? JSON.parse(val) : null;
  } catch { return null; }
}

export async function checkAlertCooldown(deviceId: string, alertType: string): Promise<boolean> {
  try {
    const val = await redis.get(`cooldown:${deviceId}:${alertType}`);
    return val !== null;
  } catch { return false; }
}

export async function setAlertCooldown(deviceId: string, alertType: string, severity: 'critical' | 'warning' | 'info'): Promise<void> {
  try {
    const ttl = severity === 'critical' ? REDIS_TTL.ALERT_COOLDOWN_CRITICAL
      : severity === 'warning' ? REDIS_TTL.ALERT_COOLDOWN_WARNING
      : REDIS_TTL.ALERT_COOLDOWN_INFO;
    await redis.setex(`cooldown:${deviceId}:${alertType}`, ttl, '1');
  } catch { /* ok */ }
}

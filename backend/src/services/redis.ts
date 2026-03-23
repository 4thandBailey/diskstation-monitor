import Redis from 'ioredis';

if (!process.env.REDIS_URL) {
  throw new Error('REDIS_URL environment variable is required');
}

export const redis = new Redis(process.env.REDIS_URL, {
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  lazyConnect: false,
});

redis.on('connect', () => console.log('[redis] Connected'));
redis.on('error', (err) => console.error('[redis] Error:', err.message));

// ── Key namespaces ────────────────────────────────────────────────────────────
// session:{userId}:{tokenId}           TTL 604800s  — JWT refresh token store
// cooldown:{deviceId}:{alertType}      TTL variable — alert deduplication
// poll:last:{deviceId}                 TTL 300s     — last poll result cache

export const REDIS_TTL = {
  SESSION: 60 * 60 * 24 * 7,  // 7 days
  POLL_LAST: 300,               // 5 min
  RATE_LIMIT: 60,               // 1 min window
  ALERT_COOLDOWN_CRITICAL: 60 * 15,  // 15 min
  ALERT_COOLDOWN_WARNING:  60 * 60 * 4, // 4 hours
  ALERT_COOLDOWN_INFO:     60 * 60 * 24, // 24 hours
} as const;

export async function setSession(userId: string, tokenId: string): Promise<void> {
  await redis.setex(`session:${userId}:${tokenId}`, REDIS_TTL.SESSION, '1');
}

export async function validateSession(userId: string, tokenId: string): Promise<boolean> {
  const val = await redis.get(`session:${userId}:${tokenId}`);
  return val === '1';
}

export async function deleteSession(userId: string, tokenId: string): Promise<void> {
  await redis.del(`session:${userId}:${tokenId}`);
}

export async function deleteAllSessions(userId: string): Promise<void> {
  const keys = await redis.keys(`session:${userId}:*`);
  if (keys.length > 0) await redis.del(...keys);
}

export async function setPollLast(deviceId: string, data: object): Promise<void> {
  await redis.setex(`poll:last:${deviceId}`, REDIS_TTL.POLL_LAST, JSON.stringify(data));
}

export async function getPollLast(deviceId: string): Promise<Record<string, unknown> | null> {
  const val = await redis.get(`poll:last:${deviceId}`);
  return val ? JSON.parse(val) : null;
}

export async function checkAlertCooldown(deviceId: string, alertType: string): Promise<boolean> {
  const key = `cooldown:${deviceId}:${alertType}`;
  const val = await redis.get(key);
  return val !== null;
}

export async function setAlertCooldown(
  deviceId: string,
  alertType: string,
  severity: 'critical' | 'warning' | 'info'
): Promise<void> {
  const ttl = severity === 'critical'
    ? REDIS_TTL.ALERT_COOLDOWN_CRITICAL
    : severity === 'warning'
    ? REDIS_TTL.ALERT_COOLDOWN_WARNING
    : REDIS_TTL.ALERT_COOLDOWN_INFO;
  await redis.setex(`cooldown:${deviceId}:${alertType}`, ttl, '1');
}

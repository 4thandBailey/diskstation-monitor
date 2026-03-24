import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { db, dbQueryOne } from '../db/client';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../services/jwt';
import { setSession, deleteSession, validateSession } from '../services/redis';

export const authRouter = Router();

// Rate limit: 10 requests per minute on auth endpoints
const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false }, // Railway sets this header — disable strict validation
});

// ── POST /auth/signup ─────────────────────────────────────────────────────────
authRouter.post('/signup', authLimiter, async (req: Request, res: Response) => {
  const { email, password, displayName, gdprConsent } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }
  if (!gdprConsent) {
    return res.status(400).json({ error: 'GDPR consent is required to create an account' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  try {
    const existing = await dbQueryOne('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (existing) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await dbQueryOne<{ id: string; email: string; role: string }>(
      `INSERT INTO users (email, password_hash, display_name, role, gdpr_consent_at, gdpr_consent_version)
       VALUES ($1, $2, $3, 'admin', now(), '1.0')
       RETURNING id, email, role`,
      [email.toLowerCase(), passwordHash, displayName || null]
    );

    if (!user) throw new Error('Failed to create user');

    // Issue tokens
    const { token: refreshToken, jti: refreshJti } = signRefreshToken(user.id, user.email, user.role);
    const accessToken = signAccessToken({ sub: user.id, email: user.email, role: user.role, jti: refreshJti });
    await setSession(user.id, refreshJti);

    // Log the signup event
    await db.query(
      `INSERT INTO access_log (user_id, event_type, ip_address, user_agent, success)
       VALUES ($1, 'signup', $2, $3, true)`,
      [user.id, req.ip, req.get('user-agent')]
    );

    res.cookie('dsm_refresh', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/auth/refresh',
    });

    return res.status(201).json({ accessToken, user: { id: user.id, email: user.email, role: user.role } });
  } catch (err) {
    console.error('[auth/signup]', err);
    return res.status(500).json({ error: 'Failed to create account' });
  }
});

// ── POST /auth/login ──────────────────────────────────────────────────────────
authRouter.post('/login', authLimiter, async (req: Request, res: Response) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    const user = await dbQueryOne<{ id: string; email: string; role: string; password_hash: string | null }>(
      'SELECT id, email, role, password_hash FROM users WHERE email = $1',
      [email.toLowerCase()]
    );

    const success = user && user.password_hash
      ? await bcrypt.compare(password, user.password_hash)
      : false;

    // Always log attempt
    await db.query(
      `INSERT INTO access_log (user_id, event_type, ip_address, user_agent, success)
       VALUES ($1, 'login', $2, $3, $4)`,
      [user?.id || null, req.ip, req.get('user-agent'), success]
    );

    if (!success || !user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const { token: refreshToken, jti } = signRefreshToken(user.id, user.email, user.role);
    const accessToken = signAccessToken({ sub: user.id, email: user.email, role: user.role, jti });
    await setSession(user.id, jti);

    res.cookie('dsm_refresh', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/auth/refresh',
    });

    return res.json({ accessToken, user: { id: user.id, email: user.email, role: user.role } });
  } catch (err) {
    console.error('[auth/login]', err);
    return res.status(500).json({ error: 'Login failed' });
  }
});

// ── POST /auth/refresh ────────────────────────────────────────────────────────
authRouter.post('/refresh', async (req: Request, res: Response) => {
  const refreshToken = req.cookies?.dsm_refresh;
  if (!refreshToken) {
    return res.status(401).json({ error: 'No refresh token' });
  }

  try {
    const payload = verifyRefreshToken(refreshToken);
    const valid = await validateSession(payload.sub, payload.jti);
    if (!valid) {
      return res.status(401).json({ error: 'Session revoked' });
    }

    // Rotate: delete old session, issue new tokens
    await deleteSession(payload.sub, payload.jti);
    const { token: newRefreshToken, jti: newJti } = signRefreshToken(payload.sub, payload.email, payload.role);
    const accessToken = signAccessToken({ sub: payload.sub, email: payload.email, role: payload.role, jti: newJti });
    await setSession(payload.sub, newJti);

    res.cookie('dsm_refresh', newRefreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/auth/refresh',
    });

    return res.json({ accessToken });
  } catch {
    return res.status(401).json({ error: 'Invalid refresh token' });
  }
});

// ── POST /auth/logout ─────────────────────────────────────────────────────────
authRouter.post('/logout', async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    try {
      const { verifyAccessToken } = await import('../services/jwt');
      const payload = verifyAccessToken(authHeader.slice(7));
      await deleteSession(payload.sub, payload.jti);
    } catch { /* token already expired — that's fine */ }
  }

  res.clearCookie('dsm_refresh', { path: '/auth/refresh' });
  return res.json({ message: 'Logged out' });
});
